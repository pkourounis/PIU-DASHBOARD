// Diagnostic: probes the GoHighLevel reviews API for one location so we can see the exact
// response shape (where the rating, count and platform live) before wiring the goals card.
//   GET /api/ghl-debug/<tenant>     (PII-light: dumps structure + rating fields, not review text)
import { getConfig, debugForbidden } from './_shared/config.mjs';
import { ghlGet } from './_shared/gohighlevel.mjs';

export default async (req, context) => {
  const forbidden = debugForbidden(req); if (forbidden) return forbidden;
  const c = await getConfig();
  const key = decodeURIComponent(context.params.tenant || '').toLowerCase();
  const t = c.tenants.find((x) => String(x.tenantId) === context.params.tenant)
    || c.tenants.find((x) => (x.code || '').toLowerCase() === key || (x.name || '').toLowerCase().includes(key))
    || c.tenants[0];
  if (!t) return Response.json({ error: 'no tenant' });
  if (!t.ghlApiKey || !t.ghlLocationId) {
    return Response.json({ error: 'GoHighLevel not connected for this location', hasToken: !!t.ghlApiKey, hasLocationId: !!t.ghlLocationId });
  }

  const out = { tenant: t.name, ghlLocationId: t.ghlLocationId, probes: {} };
  const probe = async (label, path, query) => {
    try {
      const j = await ghlGet(t.ghlApiKey, path, query);
      const arr = Array.isArray(j) ? j : Array.isArray(j.reviews) ? j.reviews : Array.isArray(j.data) ? j.data : null;
      const first = arr && arr[0] ? arr[0] : null;
      out.probes[label] = {
        ok: true,
        topKeys: Object.keys(j || {}),
        arrayField: Array.isArray(j) ? '(root)' : Array.isArray(j.reviews) ? 'reviews' : Array.isArray(j.data) ? 'data' : null,
        returnedCount: arr ? arr.length : null,
        // pagination / totals live in different places per endpoint — surface the likely ones
        totals: { total: j.total ?? null, count: j.count ?? null, totalCount: j.totalCount ?? null, meta: j.meta ?? null, pagination: j.pagination ?? null },
        // rating summary if the endpoint returns an aggregate
        aggregate: { averageRating: j.averageRating ?? j.avgRating ?? j.rating ?? null, reviewCount: j.reviewCount ?? j.reviewsCount ?? null },
        firstItemKeys: first ? Object.keys(first) : [],
        firstItemRating: first ? { rating: first.rating, stars: first.stars, score: first.score, platform: first.platform ?? first.type ?? first.source, createdAt: first.createdAt ?? first.dateAdded ?? first.date ?? first.reviewDate } : null,
      };
    } catch (e) { out.probes[label] = { ok: false, error: String(e.message || e) }; }
  };

  await probe('reviews', '/reputation/reviews', { locationId: t.ghlLocationId, limit: 5 });
  await probe('reviews_google', '/reputation/reviews', { locationId: t.ghlLocationId, limit: 5, type: 'google', platform: 'google' });
  await probe('reviews_count', '/reputation/reviews/count', { locationId: t.ghlLocationId });
  await probe('reviews_stats', '/reputation/reviews/stats', { locationId: t.ghlLocationId });

  return Response.json(out);
};

export const config = { path: '/api/ghl-debug/:tenant' };
