# Backlog / follow-ups

## Welcome email (deferred)
"Create user → send login instructions" is built (Edge Function `send-welcome`,
super-admin-guarded) but not yet sending real email. To enable:
1. Create a Resend account and **verify the `patchitup.com` domain** (DNS records).
2. Set Edge Function secrets: `RESEND_API_KEY`, `WELCOME_FROM="PatchitUP Support <supportcenter@patchitup.com>"`, `APP_URL`.
Until then the admin gets a copy-paste message. (Swap Resend for SendGrid/Postmark if preferred.)

## GoHighLevel reviews (deferred)
Pull each location's Google rating + review count from GoHighLevel (per
`locations.ghl_location_id`). Needs a GHL API key. Dashboard shows "Awaiting Google" until wired.

## HomeGuard vs Power Partner membership split
Once ServiceTitan is connected, inspect membership types to map which count as
HomeGuard vs Power Partner, then split the "sold" counts in the sync.
