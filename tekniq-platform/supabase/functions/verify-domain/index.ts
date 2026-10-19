// Supabase Edge Function: verify-domain
// Checks the DNS records of a custom domain (DNS-over-HTTPS) and marks it verified.
// Call from the app (or a cron) with:  POST /functions/v1/verify-domain  { "domain_id": "<uuid>" }
// The caller must be signed in and be a member of the store (RLS decides what they can read).
// Deploy:  supabase functions deploy verify-domain
// SSL: this function only marks ssl_status='pending'->'active' after DNS passes; actual certificates are
//      issued by your hosting provider (Vercel / Netlify / Cloudflare) once the domain is attached there.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

async function doh(name: string, type: 'TXT' | 'CNAME'): Promise<string[]> {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.Answer ?? []).map((a: { data: string }) => a.data.replace(/^"|"$/g, '').replace(/\.$/, '').toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { domain_id } = await req.json();
    const auth = req.headers.get('Authorization') ?? '';
    const url = Deno.env.get('SUPABASE_URL')!;
    // 1) read the domain as the caller: RLS guarantees they may see it
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: d, error } = await asUser.from('domains').select('*').eq('id', domain_id).maybeSingle();
    if (error || !d) return json({ error: 'not_found' }, 404);
    if (d.type !== 'custom') return json({ status: d.verification_status });

    const { data: cn } = await asUser.from('platform_settings').select('value').eq('key', 'cname_target').maybeSingle();
    const target = String(cn?.value ?? 'stores.tekniq.store').toLowerCase();

    const txt = await doh('_tekniq.' + d.hostname, 'TXT');
    const cname = await doh(d.hostname, 'CNAME');
    const txtOk = txt.includes(('tekniq-verify=' + d.verification_token).toLowerCase());
    const cnameOk = cname.includes(target);
    const ok = txtOk && cnameOk;

    // 2) write with the service role (clients cannot change verification themselves)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.from('domains').update({
      verification_status: ok ? 'verified' : 'pending', ssl_status: ok ? 'active' : 'pending', verified_at: ok ? new Date().toISOString() : null,
    }).eq('id', d.id);
    return json({ status: ok ? 'verified' : 'pending', txtOk, cnameOk });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});
