// Google Places API (New) — pulls a business's overall star rating + total review count.
// Auth is a single Maps API key (GOOGLE_MAPS_API_KEY), Places API (New) enabled.
const PLACES = 'https://places.googleapis.com/v1';

// Find a place by free-text (business name + city/region). Returns the top match with rating/count.
export async function placesSearchText(key, textQuery, { locationBias } = {}) {
  // includePureServiceAreaBusinesses: return businesses with no storefront address (service-area
  // businesses) — otherwise Places omits them from search entirely.
  const body = { textQuery, maxResultCount: 5, includePureServiceAreaBusinesses: true };
  if (locationBias) body.locationBias = locationBias;
  const res = await fetch(`${PLACES}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Places searchText failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Look up a known place by id (stable — use once we've resolved it from the name).
export async function placeDetails(key, placeId) {
  const res = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,rating,userRatingCount' },
  });
  if (!res.ok) throw new Error(`Places details failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// A Google Place ID (New API) looks like ChIJ… — a URL-safe base64-ish token, ~27 chars.
const PLACE_ID_RE = /ChIJ[0-9A-Za-z_-]{15,}/;
export function extractPlaceId(s) { const m = String(s || '').match(PLACE_ID_RE); return m ? m[0] : null; }
export function looksLikePlaceId(s) { return /^ChIJ[0-9A-Za-z_-]{15,}$/.test(String(s || '').trim()); }

// Service-area businesses (no storefront address) can't be found by the map-pin Place ID Finder,
// but the "Share" button on their Google Business Profile yields a link that points straight at
// the exact profile. Follow that link server-side (Google is reachable from the deployed function)
// and dig the Place ID out of the final URL or the returned HTML. Handles share.google/…,
// maps.app.goo.gl/…, g.co/… and full google.com/maps URLs.
export async function resolvePlaceIdFromUrl(shareUrl) {
  const trail = [];
  let url = String(shareUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  // Follow up to 5 redirects manually so we can inspect every hop's Location + final body.
  let html = '', finalUrl = url;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(finalUrl, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PatchitUP-dashboard/1.0)' } });
    trail.push({ url: finalUrl, status: res.status });
    const fromUrl = extractPlaceId(finalUrl);
    if (fromUrl) return { placeId: fromUrl, via: 'url', trail };
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      finalUrl = new URL(loc, finalUrl).href;
      const hop = extractPlaceId(finalUrl);
      if (hop) return { placeId: hop, via: 'redirect', trail };
      continue;
    }
    html = await res.text().catch(() => '');
    break;
  }
  const fromUrl = extractPlaceId(finalUrl);
  if (fromUrl) return { placeId: fromUrl, via: 'url', trail };
  const fromHtml = extractPlaceId(html);
  if (fromHtml) return { placeId: fromHtml, via: 'html', trail };
  // Last resort: a hex feature id ("!1s0x…:0x…" / "ftid=") — return it for diagnosis even though
  // Place Details needs the ChIJ form.
  const ftid = (finalUrl + ' ' + html).match(/0x[0-9a-f]+:0x[0-9a-f]+/i);
  return { placeId: null, ftid: ftid ? ftid[0] : null, finalUrl, trail };
}

// Resolve { rating, count } for a location from any of: a stored Place ID, a Google profile /
// Share URL (service-area friendly), or a free-text name query — in that order of preference.
export async function fetchGoogleReviews(key, { placeId, url, query } = {}) {
  let resolvedPlaceId = null, resolveTrail = null;
  if (placeId && looksLikePlaceId(placeId)) resolvedPlaceId = placeId;
  else if (placeId || url) {                       // a URL may arrive in either field
    const r = await resolvePlaceIdFromUrl(url || placeId);
    resolvedPlaceId = r.placeId; resolveTrail = r;
  }
  let place = null;
  if (resolvedPlaceId) place = await placeDetails(key, resolvedPlaceId);
  else if (query) { const r = await placesSearchText(key, query); place = (r.places || [])[0] || null; }
  if (!place) return resolveTrail ? { error: 'could not resolve a Place ID', resolve: resolveTrail } : null;
  return {
    placeId: place.id || resolvedPlaceId || null,
    name: place.displayName?.text || null,
    address: place.formattedAddress || null,
    rating: place.rating ?? null,
    count: place.userRatingCount ?? null,
  };
}
