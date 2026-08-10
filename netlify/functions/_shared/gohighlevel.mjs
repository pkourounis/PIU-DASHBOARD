// GoHighLevel (LeadConnector) API v2 client — Private Integration Token auth.
// A location-scoped token pulls that sub-account's Google reviews for the goals page.
const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

export function ghlHeaders(token) {
  return { Authorization: `Bearer ${token}`, Version: VERSION, Accept: 'application/json' };
}

export async function ghlGet(token, path, query = {}) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: ghlHeaders(token) });
  if (!res.ok) throw new Error(`GHL GET ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}
