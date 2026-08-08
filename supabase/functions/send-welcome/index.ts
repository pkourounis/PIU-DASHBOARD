// Sends a franchisee their login instructions. Super-admin only.
// Uses Resend; set these Edge Function secrets to enable real sending:
//   RESEND_API_KEY   – your Resend API key
//   WELCOME_FROM     – e.g. "PatchitUP Support <supportcenter@patchitup.com>"
//   APP_URL          – e.g. "https://patchitup-dashboard.netlify.app"
// Until RESEND_API_KEY is set, it returns {sent:false, reason:"email_not_configured"}
// and the admin UI shows the message to copy/paste.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Verify the caller is a signed-in super-admin.
    const authHeader = req.headers.get("Authorization") || "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: isSuper } = await supa.rpc("is_super_admin");
    if (!isSuper) return json({ error: "forbidden" }, 403);

    const { email, password, role, locationName } = await req.json();
    if (!email) return json({ error: "email required" }, 400);

    const appUrl = Deno.env.get("APP_URL") || "https://patchitup-dashboard.netlify.app";
    const subject = "Your PatchitUP Technician Dashboard login";
    const intro = role === "super_admin"
      ? "You've been given super-admin access to the PatchitUP Technician Dashboard."
      : `You've been given access to the PatchitUP Technician Dashboard for ${locationName || "your location"}.`;
    const text =
`Welcome to the PatchitUP Technician Dashboard!

${intro}

It's your live leaderboard and technician scorecards — revenue, sales, close rate and job averages for each tech, plus your company goals — pulled from ServiceTitan. Run it full-screen on a TV in the shop, or open it anytime on your phone or computer.

How to sign in:
1. Go to ${appUrl}
2. Click the "Password" tab.
3. Email: ${email}
4. Password: ${password}
5. Click "Sign in", then change your password.

Questions? Just reply to this email.`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f2233;line-height:1.5">
      <h2 style="color:#2A7DD1;margin:0 0 10px">Welcome to the PatchitUP Technician Dashboard</h2>
      <p>${intro}</p>
      <p>It's your live leaderboard and technician scorecards — revenue, sales, close rate and job averages for each tech, plus your company goals — pulled from ServiceTitan. Run it full-screen on a shop TV, or open it on your phone or computer.</p>
      <p><b>How to sign in</b></p>
      <ol>
        <li>Go to <a href="${appUrl}">${appUrl}</a></li>
        <li>Click the <b>Password</b> tab.</li>
        <li>Email: <b>${email}</b></li>
        <li>Password: <b>${password}</b></li>
        <li>Click <b>Sign in</b>, then change your password.</li>
      </ol>
      <p style="color:#7E8488">Questions? Just reply to this email.</p></div>`;

    const KEY = Deno.env.get("RESEND_API_KEY");
    const FROM = Deno.env.get("WELCOME_FROM") || "PatchitUP Support <supportcenter@patchitup.com>";
    if (!KEY) return json({ sent: false, reason: "email_not_configured", subject, text });

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [email], subject, html }),
    });
    const data = await r.json();
    if (!r.ok) return json({ sent: false, reason: "send_failed", detail: data, subject, text });
    return json({ sent: true, id: data.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
