// Diagnostic: finds the right Google business for a location and returns its live star rating +
// total review count. Tries several query variants, and biases to the coordinates if provided.
//   GET /api/google-debug/<tenant>?lat=40.7377599&lng=-73.7399525
import { getConfig } from './_shared/config.mjs';
import { placesSearchText } from './_shared/google.mjs';

export default async (req, context) => {
  const key = Netlify.env.get('GOOGLE_MAPS_API_KEY');
  if (!key) return Response.json({ error: 'GOOGLE_MAPS_API_KEY not set' });
  const c = await getConfig();
  const k = decodeURIComponent(context.params.tenant || '').toLowerCase();
  const t = c.tenants.find((x) => String(x.tenantId) === context.params.tenant)
    || c.tenants.find((x) => (x.code || '').toLowerCase() === k || (x.name || '').toLowerCase().includes(k))
    || c.tenants[0];
  if (!t) return Response.json({ error: 'no tenant' });

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  const locationBias = Number.isFinite(lat) && Number.isFinite(lng)
    ? { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } } : undefined;

  const queries = [
    t.name,
    `${t.name} drywall`,
    `${t.name} - For Every Type of Drywall Damage`,
    `PatchitUP drywall ${t.state || ''}`.trim(),
  ];
  const out = { tenant: t.name, locationBias: locationBias ? { lat, lng } : null, results: {} };
  for (const q of queries) {
    try {
      const r = await placesSearchText(key, q, { locationBias });
      out.results[q] = (r.places || []).map((p) => ({ name: p.displayName?.text, address: p.formattedAddress, rating: p.rating, count: p.userRatingCount, placeId: p.id }));
    } catch (e) { out.results[q] = { error: String(e.message || e) }; }
  }
  return Response.json(out);
};

export const config = { path: '/api/google-debug/:tenant' };
