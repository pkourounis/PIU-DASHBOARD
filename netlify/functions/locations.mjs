import { getConfig, publicTenant } from './_shared/config.mjs';

export default async () => Response.json((await getConfig()).tenants.map(publicTenant));

export const config = { path: '/api/locations' };
