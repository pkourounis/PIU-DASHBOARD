// Public Supabase connection for the PatchitUP dashboard + admin UI.
// These values are browser-safe: the publishable key is designed to ship to
// clients, and row-level security (see supabase/migrations) enforces access.
// Secrets (ServiceTitan client secrets, service-role key) never appear here.
window.SUPABASE_CONFIG = {
  url: "https://lzptesxrzzhrngphbdbq.supabase.co",
  anonKey: "sb_publishable_awRbdPKZU7j3htdQ6NLZQA_FXcahcLC",
};
