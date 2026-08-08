// Config for the Netlify Functions backend. Secrets come from encrypted env vars.
//  ST_APP_KEY                 — optional fallback ServiceTitan app key (ST-App-Key header). Each
//                               location can carry its own app key from the admin UI; this only
//                               fills in when a location left the app-key field blank.
//  ST_ENV                     — "production" (default) | "integration"
//  SUPABASE_URL               — the Supabase project URL (locations live here)
//  SUPABASE_SERVICE_ROLE_KEY  — service role key; lets the sync read location_credentials
//  TENANTS_JSON               — fallback when Supabase isn't configured: JSON array of
//                               { name, code, region, market, state, tenantId, clientId, clientSecret, appKey }
//
// When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, the tenant list is built from the
// active locations that have a ServiceTitan tenant id AND saved credentials (client id, secret,
// app key) — so adding a location in the admin UI and entering its keys is all it takes to bring
// it live; no per-location env vars.

async function tenantsFromSupabase() {
  const url = Netlify.env.get('SUPABASE_URL');
  const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
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
    const globalAppKey = Netlify.env.get('ST_APP_KEY') || '';
    const tenants = [];
    for (const l of locs) {
      const c = credById[l.id];
      const appKey = (c && c.st_app_key) || globalAppKey;
      if (!l.st_tenant_id || !c || !c.st_client_id || !c.st_client_secret || !appKey) continue; // not fully connected yet
      tenants.push({
        name: l.name, code: l.code, region: l.region, market: l.market, state: l.state,
        tenantId: String(l.st_tenant_id), clientId: c.st_client_id, clientSecret: c.st_client_secret,
        appKey, env: l.st_env || 'production',
      });
    }
    return tenants;
  } catch (e) {
    console.log('tenantsFromSupabase failed:', e.message);
    return null;
  }
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
