// Runtime configuration — edit this file after build/deploy (no rebuild needed).
// Leave SUPABASE_URL empty to run the platform in local DEMO mode (data kept in the browser).
window.TEKNIQ = {
  SUPABASE_URL: "",        // e.g. https://abcd1234.supabase.co
  SUPABASE_ANON_KEY: "",   // the public "anon" key (Project Settings → API)
  ROOT_DOMAIN: "tekniq.store",   // domain whose subdomains host stores: <slug>.tekniq.store
  PLATFORM_HOSTS: ["localhost", "127.0.0.1"] // hostnames that serve the platform app itself (add your app domain)
};
