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

// Resolve { rating, count } for a location. Prefer a stored place id; else search by name.
export async function fetchGoogleReviews(key, { placeId, query }) {
  let place = null;
  if (placeId) place = await placeDetails(key, placeId);
  else { const r = await placesSearchText(key, query); place = (r.places || [])[0] || null; }
  if (!place) return null;
  return {
    placeId: place.id || placeId || null,
    name: place.displayName?.text || null,
    address: place.formattedAddress || null,
    rating: place.rating ?? null,
    count: place.userRatingCount ?? null,
  };
}
