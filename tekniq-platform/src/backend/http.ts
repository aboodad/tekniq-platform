// Minimal Supabase client (GoTrue + PostgREST + Storage) built on fetch — no external packages.
import { cfg } from './config';

export class ApiError extends Error {
  constructor(public code: string, public status = 400, public detail?: string) { super(code); }
}
export interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string; user_metadata?: any }; }

const KEY = 'tk_session';
let session: Session | null = null;
const listeners = new Set<(s: Session | null) => void>();
try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { session = null; }

export const getSession = () => session;
export function setSession(s: Session | null) {
  session = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((f) => f(s));
}
export function onSession(f: (s: Session | null) => void) { listeners.add(f); return () => listeners.delete(f); }

const base = () => cfg().SUPABASE_URL.replace(/\/+$/, '');
const anon = () => cfg().SUPABASE_ANON_KEY;

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!session) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${base()}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: anon(), 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session!.refresh_token }) });
      if (!r.ok) { setSession(null); return false; }
      setSession(normalize(await r.json())); return true;
    } finally { refreshing = null; }
  })();
  return refreshing;
}
function normalize(j: any): Session {
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600), user: j.user };
}

async function call(url: string, init: RequestInit & { raw?: boolean } = {}, retry = true): Promise<Response> {
  if (session && session.expires_at - 30 < Date.now() / 1000) await refresh();
  const headers = new Headers(init.headers);
  headers.set('apikey', anon());
  headers.set('Authorization', 'Bearer ' + (session?.access_token || anon()));
  const r = await fetch(url, { ...init, headers });
  if (r.status === 401 && retry && session && (await refresh())) return call(url, init, false);
  return r;
}
async function fail(r: Response): Promise<never> {
  let j: any = {}; try { j = await r.json(); } catch { /* not json */ }
  const msg = String(j.message || j.msg || j.error_description || j.error || '');
  // custom exceptions raised in SQL carry a stable code as their message
  throw new ApiError(msg || 'http_' + r.status, r.status, j.details || j.hint);
}

export async function rest<T = any>(path: string, o: { method?: string; body?: unknown; prefer?: string; count?: boolean; range?: [number, number] } = {}): Promise<T> {
  const h: Record<string, string> = {};
  if (o.body !== undefined) h['Content-Type'] = 'application/json';
  const pref: string[] = []; if (o.prefer) pref.push(o.prefer); if (o.count) pref.push('count=exact');
  if (pref.length) h.Prefer = pref.join(',');
  if (o.range) { h['Range-Unit'] = 'items'; h.Range = `${o.range[0]}-${o.range[1]}`; }
  const r = await call(`${base()}/rest/v1/${path}`, { method: o.method || 'GET', headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  if (!r.ok && r.status !== 206) return fail(r);
  const text = await r.text(); const data = text ? JSON.parse(text) : null;
  if (o.count) { const cr = r.headers.get('content-range'); const total = cr ? Number(cr.split('/')[1]) : undefined; return { data, total } as any; }
  return data;
}
export async function invokeFn<T = any>(name: string, body: unknown): Promise<T> {
  const r = await fetch(`${base()}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon(), Authorization: 'Bearer ' + (session?.access_token ?? anon()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || 'function_failed', r.status);
  return j as T;
}
export const rpc = <T = any>(name: string, args: Record<string, unknown> = {}) => rest<T>(`rpc/${name}`, { method: 'POST', body: args });

// ---------- auth ----------
async function authReq(path: string, body: unknown, method = 'POST') {
  const r = await fetch(`${base()}/auth/v1/${path}`, { method, headers: { apikey: anon(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    let j: any = {}; try { j = await r.json(); } catch { /* */ }
    const m = String(j.msg || j.error_description || j.message || j.error_code || '');
    throw new ApiError(/invalid login/i.test(m) ? 'invalid_credentials' : /already registered/i.test(m) ? 'email_exists' : /email not confirmed/i.test(m) ? 'email_not_confirmed' : /password/i.test(m) ? 'weak_password' : m || 'auth_error', r.status);
  }
  return r.json();
}
export async function signIn(email: string, password: string) {
  const s = normalize(await authReq('token?grant_type=password', { email, password })); setSession(s); return s;
}
export async function signUp(email: string, password: string, meta: Record<string, string>) {
  const j = await authReq('signup', { email, password, data: meta });
  if (j.access_token) { setSession(normalize(j)); return { needsConfirm: false }; }
  return { needsConfirm: true };
}
export const recover = (email: string, redirectTo: string) => authReq(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email });
export async function signOut() {
  try { if (session) await call(`${base()}/auth/v1/logout`, { method: 'POST' }, false); } catch { /* ignore */ }
  setSession(null);
}
export async function updatePassword(password: string) {
  const r = await call(`${base()}/auth/v1/user`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (!r.ok) return fail(r);
}
// Handles the redirect from a password-reset or confirmation email (#access_token=...&type=recovery)
export function consumeAuthHash(): 'recovery' | 'signup' | null {
  const h = location.hash.startsWith('#') ? new URLSearchParams(location.hash.slice(1)) : null;
  if (!h || !h.get('access_token')) return null;
  setSession({ access_token: h.get('access_token')!, refresh_token: h.get('refresh_token') || '', expires_at: Number(h.get('expires_at')) || Math.floor(Date.now() / 1000) + 3600, user: { id: '', email: '' } });
  history.replaceState(null, '', location.pathname + location.search);
  return h.get('type') === 'recovery' ? 'recovery' : 'signup';
}

// ---------- storage ----------
export async function uploadObject(path: string, file: Blob, contentType: string): Promise<string> {
  const r = await call(`${base()}/storage/v1/object/media/${path}`, { method: 'POST', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, body: file });
  if (!r.ok) return fail(r);
  return `${base()}/storage/v1/object/public/media/${path}`;
}
export async function deleteObject(path: string) {
  const r = await call(`${base()}/storage/v1/object/media/${path}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) return fail(r);
}
