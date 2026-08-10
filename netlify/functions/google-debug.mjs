// Diagnostic: confirms the Google Maps key works and resolves a location to the right business,
// returning its live star rating + total review count.
//   GET /api/google-debug/<tenant>
import { getConfig } from './_shared/config.mjs';
import { placesSearchText, fetchGoogleReviews } from './_shared/google.mjs';

export default async (req, context) => {
  const key = Netlify.env.get('GOOGLE_MAPS_API_KEY');
  if (!key) return Response.json({ error: 'GOOGLE_MAPS_API_KEY not set' });
  const c = await getConfig();
  const k = decodeURIComponent(context.params.tenant || '').toLowerCase();
  const t = c.tenants.find((x) => String(x.tenantId) === context.params.tenant)
    || c.tenants.find((x) => (x.code || '').toLowerCase() === k || (x.name || '').toLowerCase().includes(k))
    || c.tenants[0];
  if (!t) return Response.json({ error: 'no tenant' });

  const query = [t.name, t.region, t.state].filter(Boolean).join(' ');
  try {
    const raw = await placesSearchText(key, query);
    const top = await fetchGoogleReviews(key, { query });
    return Response.json({
      tenant: t.name, query,
      resolved: top,   // { placeId, name, address, rating, count } — verify this is the right business
      candidates: (raw.places || []).map((p) => ({ name: p.displayName?.text, address: p.formattedAddress, rating: p.rating, count: p.userRatingCount, placeId: p.id })),
    });
  } catch (e) { return Response.json({ tenant: t.name, query, error: String(e.message || e) }); }
};

export const config = { path: '/api/google-debug/:tenant' };
