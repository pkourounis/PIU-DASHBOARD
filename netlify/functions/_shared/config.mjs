// Config for the Netlify Functions backend. Secrets come from encrypted env vars.
//  ST_APP_KEY                 — optional fallback ServiceTitan app key (ST-App-Key header). Each
//                               location can carry its own app key from the admin UI; this only
//                               fills in when a location left the app-key field blank.
//  ST_ENV                     — "production" (default) | "integration"
//  SUPABASE_URL               — the Supabase project URL (locations live here)
//  SUPABASE_ANON_KEY          — publishable key (public); used to call the sync_tenants RPC
//  SYNC_TENANTS_SECRET        — shared secret that authorizes the read-only sync_tenants RPC to
//                               return locations + ServiceTitan credentials (preferred path; no
//                               service_role key needed)
//  SUPABASE_SERVICE_ROLE_KEY  — legacy path: service role key that reads the tables directly
//  TENANTS_JSON               — fallback when Supabase isn't configured: JSON array of
//                               { name, code, region, market, state, tenantId, clientId, clientSecret, appKey }
//
// Whichever Supabase path is configured, the tenant list is built from the active locations that
// have a ServiceTitan tenant id AND saved credentials (client id, secret, app key) — so adding a
// location in the admin UI and entering its keys is all it takes to bring it live; no per-location
// env vars.

function mapTenants(rows) {
  const globalAppKey = Netlify.env.get('ST_APP_KEY') || '';
  const tenants = [];
  for (const l of rows) {
    const appKey = l.st_app_key || globalAppKey;
    if (!l.st_tenant_id || !l.st_client_id || !l.st_client_secret || !appKey) continue; // not fully connected yet
    tenants.push({
      name: l.name, code: l.code, region: l.region, market: l.market, state: l.state,
      tenantId: String(l.st_tenant_id), clientId: l.st_client_id, clientSecret: l.st_client_secret,
      appKey, env: l.st_env || 'production',
    });
  }
  return tenants;
}

// Preferred path: a read-only RPC gated by a shared secret. Returns one row per fully-connected
// location with its credentials joined in — no service_role key required.
async function tenantsViaRpc(url) {
  const secret = Netlify.env.get('SYNC_TENANTS_SECRET');
  const anon = Netlify.env.get('SUPABASE_ANON_KEY');
  if (!secret || !anon) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/sync_tenants`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_secret: secret }),
    });
    if (!res.ok) { console.log('sync_tenants RPC failed:', res.status, await res.text().catch(() => '')); return null; }
    return mapTenants(await res.json());
  } catch (e) {
    console.log('tenantsViaRpc failed:', e.message);
    return null;
  }
}

// Legacy path: read the tables directly with a service_role key.
async function tenantsViaServiceRole(url) {
  const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return null;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const [locsRes, credsRes] = await Promise.all([
      fetch(`${url}/rest/v1/locations?select=id,name,code,region,market,state,st_tenant_id,st_env,is_active&is_active=eq.true`, { headers: h }),
      fetch(`${url}/rest/v1/location_credentials?select=location_id,st_client_id,st_client_secret,st_app_key`, { headers: h }),
    ]);
    if (!locsRes.ok) return null;
    const locs = await locsRes.json();
    const creds = credsRes.ok ? await credsRes.json() : [];
    const credById = {};
    for (const c of creds) credById[c.location_id] = c;
    return mapTenants(locs.map((l) => ({ ...l, ...(credById[l.id] || {}) })));
  } catch (e) {
    console.log('tenantsViaServiceRole failed:', e.message);
    return null;
  }
}

async function tenantsFromSupabase() {
  const url = Netlify.env.get('SUPABASE_URL');
  if (!url) return null;
  const viaRpc = await tenantsViaRpc(url);
  if (viaRpc !== null) return viaRpc;
  return tenantsViaServiceRole(url);
}

export async function getConfig() {
  let tenants = await tenantsFromSupabase();
  let source = 'supabase';
  if (tenants === null) {
    try { tenants = JSON.parse(Netlify.env.get('TENANTS_JSON') || '[]'); } catch { tenants = []; }
    source = 'env';
  }
  return {
    env: Netlify.env.get('ST_ENV') === 'integration' ? 'integration' : 'production',
    appKey: Netlify.env.get('ST_APP_KEY') || '',
    tenants,
    source,
    backfillDays: Number(Netlify.env.get('BACKFILL_DAYS') || 400),
    // Manual "Sync data" + hourly refresh recompute this many recent days for every location.
    refreshDays: Number(Netlify.env.get('REFRESH_DAYS') || 120),
  };
}

// Configured once there's at least one tenant that has an effective app key — its own
// (entered in the admin) or the shared ST_APP_KEY fallback.
export const configured = (c) => c.tenants.length > 0 && c.tenants.some((t) => t.appKey || c.appKey);
export const publicTenant = (t) => ({ name: t.name, code: t.code || null, region: t.region || null, market: t.market || null, state: t.state || null, tenant: String(t.tenantId) });
