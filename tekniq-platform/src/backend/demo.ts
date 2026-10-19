// Demo backend: the same rules as the SQL functions, running on localStorage. Used when public/config.js has no Supabase keys.
import type { AdminStats, AdminStore, Api, DataSourceRow, MyStore, Usage } from './api';
import type { ActivityRow, ComponentTypeRow, Draft, DomainRow, Invite, Invoice, MediaRow, Member, Plan, Profile, Snapshot, StoreRow, Subscription, TemplateRow, Ticket, TicketMessage } from '../core/types';
import { ApiError } from './http';
import { ALL_DEFS, DATA_SOURCES } from '../core/registry';
import { TEMPLATES, templateDraft } from '../core/templates';
import { clone, uid } from '../core/util';

interface User { id: string; email: string; password: string }
interface DB {
  users: User[]; profiles: Profile[]; stores: StoreRow[]; members: { store_id: string; user_id: string; role: 'owner' | 'editor' | 'viewer'; created_at: string }[];
  invites: (Invite & { store_id: string })[]; drafts: Record<string, { draft: Draft; rev: number }>; versions: Record<string, { id: string; no: number; snap: Snapshot; note?: string; author?: string; at: string }[]>;
  media: MediaRow[]; domains: DomainRow[]; subs: Subscription[]; invoices: Invoice[]; tickets: Ticket[]; messages: TicketMessage[]; activity: ActivityRow[];
  plans: Plan[]; templates: TemplateRow[]; components: ComponentTypeRow[]; sources: DataSourceRow[]; seq: number;
}
const KEY = 'tk_demo_db_v1'; const SES = 'tk_demo_session';
const now = () => new Date().toISOString();
const RESERVED = ['www', 'app', 'admin', 'api', 'mail', 'static', 'assets', 'cdn', 'dashboard', 'login', 'signup', 'support', 'help', 'status', 'blog', 'docs', 'shop', 'store', 'stores', 's', 'preview', 'demo', 'tekniq', 'platform', 'cname'];

function seed(): DB {
  const adminId = uid();
  return {
    users: [{ id: adminId, email: 'admin@tekniq.demo', password: 'admin123' }],
    profiles: [{ id: adminId, email: 'admin@tekniq.demo', full_name: 'مدير المنصة', role: 'platform_admin', status: 'active', created_at: now() }],
    stores: [], members: [], invites: [], drafts: {}, versions: {}, media: [], domains: [], subs: [], invoices: [], tickets: [], messages: [], activity: [], seq: 10000,
    plans: [
      { id: uid(), code: 'starter', name: 'المبتدئ', description: 'لبدء متجرك', price_monthly: 0, price_yearly: 0, currency: 'USD', limits_json: { stores: 1, custom_pages: 3, seats: 2, domains: 1, media_mb: 100 }, features_json: ['متجر واحد', '3 صفحات مخصصة', 'نطاق فرعي'], is_active: true, sort: 1 },
      { id: uid(), code: 'pro', name: 'الاحترافي', description: 'للمتاجر النامية', price_monthly: 29, price_yearly: 290, currency: 'USD', limits_json: { stores: 3, custom_pages: 20, seats: 5, domains: 3, media_mb: 1000 }, features_json: ['3 متاجر', '20 صفحة مخصصة', 'نطاقات خاصة'], is_active: true, sort: 2 },
      { id: uid(), code: 'business', name: 'الأعمال', description: 'للفرق الكبيرة', price_monthly: 79, price_yearly: 790, currency: 'USD', limits_json: { stores: 10, custom_pages: 100, seats: 20, domains: 10, media_mb: 10000 }, features_json: ['10 متاجر', 'صفحات غير محدودة تقريباً', 'أولوية الدعم'], is_active: true, sort: 3 },
    ],
    templates: TEMPLATES.map((t) => ({ id: uid(), slug: t.slug, name: t.name, category: t.category, description: t.description, thumbnail_url: null, is_premium: !!t.premium, price: null, status: 'published' as const, sort: t.sort })),
    components: ALL_DEFS.map((d, i) => ({ id: uid(), key: d.key, kind: d.kind, name_ar: d.name, name_en: null, category: d.category, status: 'active' as const, sort: i })),
    sources: DATA_SOURCES.map((s) => ({ id: uid(), key: s.key, name: s.description, kind: 'list', method: s.key.startsWith('order') || s.key.startsWith('discount') ? 'POST' : 'GET', endpoint_template: '/' + s.key.replace('.', '/'), status: 'planned' })),
  };
}
let cache: DB | null = null;
const db = (): DB => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { cache = null; }
  if (!cache) { cache = seed(); save(); }
  return cache!;
};
function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota */ } }
export function resetDemo() { cache = null; try { localStorage.removeItem(KEY); localStorage.removeItem(SES); } catch { /* */ } }

const uidNow = (): string => { const u = localStorage.getItem(SES); if (!u) throw new ApiError('not_authenticated', 401); return u; };
const meP = (): Profile => { const p = db().profiles.find((x) => x.id === uidNow()); if (!p) throw new ApiError('not_authenticated', 401); return p; };
const isAdmin = () => meP().role === 'platform_admin';
const isStaff = () => meP().role !== 'merchant';
function role(storeId: string): 'owner' | 'editor' | 'viewer' | null {
  const p = meP(); if (p.role === 'platform_admin') return 'owner'; if (p.role === 'support') return 'viewer';
  return db().members.find((m) => m.store_id === storeId && m.user_id === p.id)?.role ?? null;
}
const rank = { owner: 3, editor: 2, viewer: 1 };
function need(storeId: string, min: 'owner' | 'editor' | 'viewer') { const r = role(storeId); if (!r || rank[r] < rank[min]) throw new ApiError('forbidden', 403); return r; }
function log(storeId: string | null, action: string, meta: any = {}) { db().activity.unshift({ id: String(db().seq++), store_id: storeId, user_id: uidNow(), action, meta_json: meta, created_at: now() }); db().activity.length = Math.min(db().activity.length, 500); }
const planOf = (storeId: string) => { const s = db().subs.find((x) => x.store_id === storeId); return db().plans.find((p) => p.id === s?.plan_id)!; };
const limit = (storeId: string, k: string) => planOf(storeId)?.limits_json[k] ?? Infinity;
const ok = <T,>(v: T): Promise<T> => Promise.resolve(clone(v));
const wrap = <T,>(f: () => T): Promise<T> => { try { return Promise.resolve(clone(f() as any)); } catch (e) { return Promise.reject(e); } };

function buildSnapshot(s: StoreRow, d: Draft, no: number): Snapshot {
  return { ...clone(d), version: no, store: { id: s.id, name: s.name, slug: s.slug, locale: s.default_locale, direction: s.direction, currency: s.currency, timezone: s.timezone, dataMode: s.data_mode, dataApiUrl: s.data_api_url, logoUrl: s.logo_url, faviconUrl: s.favicon_url, status: s.status } };
}
function withIds(d: Draft): Draft { return clone(d); } // templates are built with ids already

function saveDraftChecked(storeId: string, draft: Draft, trusted: boolean) {
  if (!draft || !Array.isArray(draft.pages)) throw new ApiError('invalid_draft');
  const cur = db().drafts[storeId].draft;
  const existing = new Map(cur.pages.map((p) => [p.id, p]));
  for (const p of draft.pages) {
    if (!trusted && p.type !== 'custom' && !existing.has(p.id)) throw new ApiError('forbidden_page_type');
    const old = existing.get(p.id);
    if (old?.system) { p.system = true; p.slug = old.slug; p.type = old.type; } else if (!trusted) p.system = false;
  }
  // system pages cannot be deleted
  for (const p of cur.pages) if (p.system && !draft.pages.some((x) => x.id === p.id)) draft.pages.push(p);
}

export const demoApi: Api = {
  demo: true,
  async me() { const u = localStorage.getItem(SES); if (!u) return null; const p = db().profiles.find((x) => x.id === u); return p ? clone(p) : null; },
  async signIn(email, password) {
    const u = db().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || u.password !== password) throw new ApiError('invalid_credentials', 400);
    const p = db().profiles.find((x) => x.id === u.id)!; if (p.status !== 'active') throw new ApiError('account_inactive', 403);
    localStorage.setItem(SES, u.id); p.last_login_at = now(); save();
  },
  async signUp(email, password, fullName, phone) {
    email = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError('invalid_email');
    if (password.length < 8) throw new ApiError('weak_password');
    if (db().users.some((u) => u.email === email)) throw new ApiError('email_exists');
    const id = uid(); db().users.push({ id, email, password });
    db().profiles.push({ id, email, full_name: fullName || null, phone: phone || null, role: 'merchant', status: 'active', created_at: now() });
    for (const i of db().invites.filter((x) => x.email.toLowerCase() === email)) db().members.push({ store_id: i.store_id, user_id: id, role: i.role, created_at: now() });
    db().invites = db().invites.filter((x) => x.email.toLowerCase() !== email);
    localStorage.setItem(SES, id); save(); return { needsConfirm: false };
  },
  async signOut() { localStorage.removeItem(SES); },
  async recover() { /* demo: nothing to send */ },
  async updatePassword(p) { if (p.length < 8) throw new ApiError('weak_password'); db().users.find((u) => u.id === uidNow())!.password = p; save(); },
  updateProfile(p) { return wrap(() => { const me = meP(); Object.assign(me, p); save(); return me; }); },

  myStores() { return wrap(() => db().members.filter((m) => m.user_id === uidNow()).map((m) => ({ ...db().stores.find((s) => s.id === m.store_id)!, myRole: m.role })).filter((s) => s.id && s.status !== 'archived').sort((a, b) => b.created_at.localeCompare(a.created_at)) as MyStore[]); },
  getStore(id) { return wrap(() => { const r = need(id, 'viewer'); return { ...db().stores.find((s) => s.id === id)!, myRole: r } as MyStore; }); },
  createStore(i) {
    return wrap(() => {
      const me = meP(); if (me.status !== 'active') throw new ApiError('account_inactive');
      const slug = i.slug.trim().toLowerCase();
      if (i.name.trim().length < 2) throw new ApiError('invalid_name');
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) throw new ApiError('invalid_slug');
      if (RESERVED.includes(slug)) throw new ApiError('slug_reserved');
      if (db().stores.some((s) => s.slug === slug)) throw new ApiError('slug_taken');
      const owned = db().stores.filter((s) => s.owner_id === me.id && s.status !== 'archived');
      const max = Math.max(1, ...owned.map((s) => limit(s.id, 'stores')).filter(Number.isFinite), db().plans.find((p) => p.code === 'starter')!.limits_json.stores);
      if (owned.length >= max && me.role !== 'platform_admin') throw new ApiError('limit_reached:stores');
      const tpl = db().templates.find((t) => t.id === i.templateId && t.status === 'published') ?? db().templates.find((t) => t.slug === 'blank')!;
      const id = uid();
      const s: StoreRow = { id, owner_id: me.id, template_id: tpl.id, name: i.name.trim(), slug, status: 'draft', default_locale: i.locale ?? 'ar', direction: 'rtl', currency: (i.currency ?? 'USD').toUpperCase(), timezone: 'Asia/Aden', logo_url: null, favicon_url: null, data_mode: 'mock', data_api_url: null, draft_rev: 1, published_version_id: null, published_at: null, created_at: now() };
      db().stores.push(s); db().members.push({ store_id: id, user_id: me.id, role: 'owner', created_at: now() });
      db().drafts[id] = { draft: withIds(templateDraft(tpl.slug)), rev: 1 };
      const starter = db().plans.find((p) => p.code === 'starter')!;
      db().subs.push({ id: uid(), store_id: id, plan_id: starter.id, status: 'trialing', billing_cycle: 'monthly', trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(), current_period_end: new Date(Date.now() + 14 * 864e5).toISOString() });
      db().domains.push({ id: uid(), store_id: id, hostname: slug + '.tekniq.store', type: 'subdomain', is_primary: true, verification_status: 'verified', ssl_status: 'active', verification_token: '', dns_records_json: [] });
      log(id, 'store.create', { template: tpl.slug }); save(); return s;
    });
  },
  updateStore(id, p) {
    return wrap(() => { need(id, 'editor'); const s = db().stores.find((x) => x.id === id)!; if (s.status === 'archived') throw new ApiError('not_found');
      for (const k of ['name', 'default_locale', 'direction', 'currency', 'timezone', 'logo_url', 'favicon_url']) if (k in p) (s as any)[k] = p[k] || (k === 'logo_url' || k === 'favicon_url' ? null : (s as any)[k]);
      log(id, 'store.settings', p); save(); return s; });
  },
  async archiveStore(id) { need(id, 'owner'); db().stores.find((s) => s.id === id)!.status = 'archived'; log(id, 'store.archive'); save(); },
  templates() { return ok(db().templates.filter((t) => t.status === 'published').sort((a, b) => a.sort - b.sort)); },
  usage(id) { return wrap(() => { need(id, 'viewer'); const d = db().drafts[id]?.draft; return { pages: d ? d.pages.filter((p) => p.type === 'custom').length : 0, members: db().members.filter((m) => m.store_id === id).length, domains: db().domains.filter((x) => x.store_id === id && x.type === 'custom').length, mediaMb: Math.round(db().media.filter((m) => m.store_id === id).reduce((n, m) => n + m.size_bytes, 0) / 1048576) } as Usage; }); },

  getDraft(id) { return wrap(() => { need(id, 'viewer'); const d = db().drafts[id]; return { draft: d.draft, rev: d.rev }; }); },
  saveDraft(id, draft, base) {
    return wrap(() => {
      need(id, 'editor'); const s = db().stores.find((x) => x.id === id)!; const d = db().drafts[id];
      if (['suspended', 'archived'].includes(s.status)) throw new ApiError('store_locked');
      if (base != null && base !== d.rev) throw new ApiError('draft_conflict');
      if (JSON.stringify(draft).length > 4_000_000) throw new ApiError('draft_too_large');
      if (draft.pages.filter((p) => p.type === 'custom').length > limit(id, 'custom_pages')) throw new ApiError('limit_reached:custom_pages');
      const next = clone(draft); saveDraftChecked(id, next, false);
      d.draft = next; d.rev += 1; s.draft_rev = d.rev; save(); return d.rev;
    });
  },
  publish(id, note) {
    return wrap(() => {
      need(id, 'editor'); const s = db().stores.find((x) => x.id === id)!; const d = db().drafts[id].draft;
      if (['suspended', 'archived'].includes(s.status)) throw new ApiError('store_locked');
      const missing = ['home', 'collection', 'product', 'cart', 'checkout'].filter((t) => !d.pages.some((p) => p.type === t && p.enabled));
      if (missing.length) throw new ApiError('not_ready:' + missing.join(','));
      const list = (db().versions[id] ||= []); const no = (list[0]?.no ?? 0) + 1; const vid = uid();
      list.unshift({ id: vid, no, snap: buildSnapshot(s, d, no), note, author: meP().full_name || meP().email, at: now() }); list.length = Math.min(list.length, 30);
      s.published_version_id = vid; s.published_at = now(); if (s.status === 'draft') s.status = s.data_mode === 'mock' ? 'ready_for_integration' : 'live';
      log(id, 'store.publish', { version: no }); save(); return { versionNo: no };
    });
  },
  versions(id) { return wrap(() => { need(id, 'viewer'); const s = db().stores.find((x) => x.id === id)!; return (db().versions[id] || []).map((v) => ({ id: v.id, version_no: v.no, status: v.id === s.published_version_id ? 'published' : 'archived', note: v.note, author: v.author, published_at: v.at, is_current: v.id === s.published_version_id })); }); },
  async restore(id, vid, publish) {
    need(id, 'editor'); const v = (db().versions[id] || []).find((x) => x.id === vid); if (!v) throw new ApiError('not_found');
    const d = db().drafts[id]; const { version, store, ...rest } = clone(v.snap) as any; void version; void store;
    d.draft = rest as Draft; d.rev += 1; db().stores.find((s) => s.id === id)!.draft_rev = d.rev; log(id, 'store.restore', { version: v.no }); save();
    if (publish) await demoApi.publish(id, 'استرجاع النسخة ' + v.no);
    return d.rev;
  },
  async getPublished(q) {
    let s: StoreRow | undefined;
    if (q.host) { const dm = db().domains.find((d) => d.hostname.toLowerCase() === q.host!.toLowerCase() && d.verification_status === 'verified'); s = db().stores.find((x) => x.id === dm?.store_id); }
    if (!s && q.slug) s = db().stores.find((x) => x.slug === q.slug!.toLowerCase());
    if (!s || !s.published_version_id || !['ready_for_integration', 'live'].includes(s.status)) return null;
    const v = (db().versions[s.id] || []).find((x) => x.id === s!.published_version_id); if (!v) return null;
    return clone({ ...v.snap, store: { ...v.snap.store, status: s.status, dataMode: s.data_mode, dataApiUrl: s.data_api_url } });
  },

  media(id) { return wrap(() => { need(id, 'viewer'); return db().media.filter((m) => m.store_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)); }); },
  async uploadMedia(storeId, file) {
    need(storeId, 'editor');
    if (!/^(image|video)\//.test(file.type)) throw new ApiError('invalid_file');
    if (file.size > 3 * 1048576) throw new ApiError('file_too_large'); // demo keeps files in localStorage
    const used = db().media.filter((m) => m.store_id === storeId).reduce((n, m) => n + m.size_bytes, 0);
    if (used + file.size > limit(storeId, 'media_mb') * 1048576) throw new ApiError('limit_reached:media_mb');
    const url: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    const m: MediaRow = { id: uid(), store_id: storeId, type: file.type.startsWith('video') ? 'video' : 'image', url, storage_path: `${storeId}/${uid()}`, file_name: file.name, mime_type: file.type, size_bytes: file.size, created_at: now() };
    db().media.push(m); save(); return clone(m);
  },
  async deleteMedia(m) { need(m.store_id, 'editor'); db().media = db().media.filter((x) => x.id !== m.id); save(); },

  domains(id) { return wrap(() => { need(id, 'viewer'); return db().domains.filter((d) => d.store_id === id); }); },
  addDomain(id, host) {
    return wrap(() => {
      need(id, 'owner'); const h = host.trim().toLowerCase();
      if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(h) || h === 'tekniq.store' || h.endsWith('.tekniq.store')) throw new ApiError('invalid_domain');
      if (db().domains.some((d) => d.hostname === h)) throw new ApiError('domain_taken');
      if (db().domains.filter((d) => d.store_id === id && d.type === 'custom').length >= limit(id, 'domains')) throw new ApiError('limit_reached:domains');
      const token = uid().replace(/-/g, '');
      const d: DomainRow = { id: uid(), store_id: id, hostname: h, type: 'custom', is_primary: false, verification_status: 'pending', ssl_status: 'pending', verification_token: token, dns_records_json: [{ type: 'CNAME', name: h, value: 'stores.tekniq.store' }, { type: 'TXT', name: '_tekniq.' + h, value: 'tekniq-verify=' + token }] };
      db().domains.push(d); log(id, 'domain.add', { hostname: h }); save(); return d;
    });
  },
  async removeDomain(id) { const d = db().domains.find((x) => x.id === id); if (!d) throw new ApiError('not_found'); need(d.store_id, 'owner'); if (d.type === 'subdomain') throw new ApiError('cannot_remove_subdomain'); db().domains = db().domains.filter((x) => x.id !== id); if (d.is_primary) { const sub = db().domains.find((x) => x.store_id === d.store_id && x.type === 'subdomain'); if (sub) sub.is_primary = true; } save(); },
  async verifyDomain(id) { const d = db().domains.find((x) => x.id === id); return { status: d?.verification_status ?? 'pending', txtOk: false, cnameOk: false }; },
  async setPrimaryDomain(id) { const d = db().domains.find((x) => x.id === id); if (!d) throw new ApiError('not_found'); need(d.store_id, 'owner'); if (d.verification_status !== 'verified') throw new ApiError('domain_not_verified'); db().domains.filter((x) => x.store_id === d.store_id).forEach((x) => (x.is_primary = x.id === id)); save(); },

  members(id) { return wrap(() => { need(id, 'viewer'); return { members: db().members.filter((m) => m.store_id === id).map((m) => { const p = db().profiles.find((x) => x.id === m.user_id)!; return { userId: m.user_id, email: p.email, name: p.full_name, role: m.role, joinedAt: m.created_at } as Member; }), invites: db().invites.filter((i) => i.store_id === id).map(({ store_id, ...i }) => { void store_id; return i; }) }; }); },
  invite(id, email, role) {
    return wrap(() => {
      need(id, 'owner'); const e = email.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ApiError('invalid_email');
      if (db().members.filter((m) => m.store_id === id).length + db().invites.filter((i) => i.store_id === id).length >= limit(id, 'seats')) throw new ApiError('limit_reached:seats');
      const p = db().profiles.find((x) => x.email.toLowerCase() === e);
      if (p) { const m = db().members.find((x) => x.store_id === id && x.user_id === p.id); if (m) { if (m.role !== 'owner') m.role = role; } else db().members.push({ store_id: id, user_id: p.id, role, created_at: now() }); save(); return { status: 'added' as const }; }
      const ex = db().invites.find((i) => i.store_id === id && i.email.toLowerCase() === e); if (ex) ex.role = role; else db().invites.push({ id: uid(), store_id: id, email: e, role, createdAt: now() });
      save(); return { status: 'invited' as const };
    });
  },
  async setMemberRole(id, u, r) { need(id, 'owner'); const m = db().members.find((x) => x.store_id === id && x.user_id === u && x.role !== 'owner'); if (!m) throw new ApiError('not_found'); m.role = r; save(); },
  async removeMember(id, u) { if (u !== uidNow()) need(id, 'owner'); const n = db().members.length; db().members = db().members.filter((x) => !(x.store_id === id && x.user_id === u && x.role !== 'owner')); if (n === db().members.length) throw new ApiError('not_found'); save(); },
  async cancelInvite(id) { const i = db().invites.find((x) => x.id === id); if (!i) throw new ApiError('not_found'); need(i.store_id, 'owner'); db().invites = db().invites.filter((x) => x.id !== id); save(); },

  plans() { return ok(db().plans.filter((p) => p.is_active).sort((a, b) => a.sort - b.sort)); },
  subscription(id) { return wrap(() => { need(id, 'owner'); return db().subs.find((s) => s.store_id === id) ?? null; }); },
  invoices(id) { return wrap(() => { need(id, 'owner'); return db().invoices.filter((i) => i.store_id === id); }); },
  async changePlan(id, planId, cycle) {
    need(id, 'owner'); const plan = db().plans.find((p) => p.id === planId && p.is_active); if (!plan) throw new ApiError('not_found');
    const l = plan.limits_json;
    if (db().members.filter((m) => m.store_id === id).length > l.seats) throw new ApiError('plan_limit_exceeded:seats');
    if (db().domains.filter((d) => d.store_id === id && d.type === 'custom').length > l.domains) throw new ApiError('plan_limit_exceeded:domains');
    if ((db().drafts[id]?.draft.pages.filter((p) => p.type === 'custom').length ?? 0) > l.custom_pages) throw new ApiError('plan_limit_exceeded:custom_pages');
    const sub = db().subs.find((s) => s.store_id === id)!; const amount = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
    sub.plan_id = planId; sub.billing_cycle = cycle; if (amount === 0) { sub.status = 'active'; sub.current_period_end = null; }
    else db().invoices.unshift({ id: uid(), store_id: id, number: `INV-${db().seq++}`, amount, currency: plan.currency, status: 'unpaid', issued_at: now() });
    log(id, 'billing.change_plan', { cycle }); save();
  },

  tickets(id) { return wrap(() => (id ? (need(id, 'viewer'), db().tickets.filter((t) => t.store_id === id)) : db().tickets.filter((t) => role(t.store_id))).sort((a, b) => b.updated_at.localeCompare(a.updated_at))); },
  createTicket(storeId, subject, body, priority) { return wrap(() => { need(storeId, 'editor'); const t: Ticket = { id: uid(), store_id: storeId, user_id: uidNow(), subject, body, status: 'open', priority, created_at: now(), updated_at: now() }; db().tickets.unshift(t); save(); return t; }); },
  ticketMessages(id) { return wrap(() => { const t = db().tickets.find((x) => x.id === id); if (!t) throw new ApiError('not_found'); need(t.store_id, 'viewer'); return db().messages.filter((m) => m.ticket_id === id); }); },
  async reply(id, body) {
    const t = db().tickets.find((x) => x.id === id); if (!t) throw new ApiError('not_found'); if (!isStaff()) need(t.store_id, 'editor');
    const staff = isStaff(); db().messages.push({ id: uid(), ticket_id: id, user_id: uidNow(), body, is_staff: staff, created_at: now() });
    t.updated_at = now(); if (staff && t.status === 'open') t.status = 'pending'; else if (!staff && ['pending', 'resolved'].includes(t.status)) t.status = 'open'; save();
  },
  activity(id, limitN = 50) { return wrap(() => (id ? (need(id, 'owner'), db().activity.filter((a) => a.store_id === id)) : isStaff() ? db().activity : []).slice(0, limitN)); },

  adminStats() {
    return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); const d = db(); const by = <T,>(l: T[], f: (x: T) => string) => l.reduce((o: Record<string, number>, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
      return { users: d.profiles.length, stores: d.stores.filter((s) => s.status !== 'archived').length, storesByStatus: by(d.stores, (s) => s.status), subscriptionsByPlan: by(d.subs, (s) => d.plans.find((p) => p.id === s.plan_id)!.code), openTickets: d.tickets.filter((t) => ['open', 'pending'].includes(t.status)).length, unpaidInvoices: d.invoices.filter((i) => i.status === 'unpaid').length, pendingDomains: d.domains.filter((x) => x.verification_status === 'pending').length } as AdminStats; });
  },
  adminStores() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().stores.map((s) => ({ ...s, owner_email: db().profiles.find((p) => p.id === s.owner_id)?.email, plan_code: planOf(s.id)?.code })).sort((a, b) => b.created_at.localeCompare(a.created_at)) as AdminStore[]; }); },
  async adminSetStoreStatus(id, status) { if (!isAdmin()) throw new ApiError('forbidden', 403); const s = db().stores.find((x) => x.id === id); if (!s) throw new ApiError('not_found'); if (status === 'live' && !s.published_version_id) throw new ApiError('not_published'); s.status = status; log(id, 'admin.store_status', { status }); save(); },
  async adminSetIntegration(id, mode, url) { if (!isAdmin()) throw new ApiError('forbidden', 403); if (mode === 'http' && !/^https?:\/\//.test(url || '')) throw new ApiError('invalid_url'); const s = db().stores.find((x) => x.id === id); if (!s) throw new ApiError('not_found'); s.data_mode = mode; s.data_api_url = mode === 'http' ? url! : null; if (mode !== 'mock' && s.status === 'ready_for_integration') s.status = 'live'; else if (mode === 'mock' && s.status === 'live') s.status = 'ready_for_integration'; log(id, 'admin.integration', { mode, url }); save(); },
  adminUsers() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().profiles; }); },
  async adminSetUser(id, p) { if (!isAdmin()) throw new ApiError('forbidden', 403); const u = db().profiles.find((x) => x.id === id); if (!u) throw new ApiError('not_found'); Object.assign(u, p); save(); },
  async adminSavePlan(p) { if (!isAdmin()) throw new ApiError('forbidden', 403); const ex = db().plans.find((x) => x.code === p.code); if (ex) Object.assign(ex, p); else db().plans.push({ id: uid(), description: null, price_monthly: 0, price_yearly: 0, currency: 'USD', limits_json: {}, features_json: [], is_active: true, sort: 99, ...p } as Plan); save(); },
  adminTemplates() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().templates; }); },
  async adminSetTemplate(id, p) { if (!isAdmin()) throw new ApiError('forbidden', 403); const t = db().templates.find((x) => x.id === id); if (!t) throw new ApiError('not_found'); Object.assign(t, p); save(); },
  async adminDeleteTemplate(id) { if (!isAdmin()) throw new ApiError('forbidden', 403); db().templates = db().templates.filter((t) => t.id !== id); save(); },
  async adminTemplateFromStore(storeId, name, slug, category) { if (!isAdmin()) throw new ApiError('forbidden', 403); if (db().templates.some((t) => t.slug === slug)) throw new ApiError('slug_taken'); db().templates.push({ id: uid(), slug, name, category, description: null, thumbnail_url: null, is_premium: false, price: null, status: 'draft', sort: 50 }); save(); },
  adminComponents() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().components; }); },
  async adminSetComponent(id, p) { if (!isAdmin()) throw new ApiError('forbidden', 403); Object.assign(db().components.find((x) => x.id === id)!, p); save(); },
  adminDataSources() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().sources; }); },
  async adminSetDataSource(id, p) { if (!isAdmin()) throw new ApiError('forbidden', 403); Object.assign(db().sources.find((x) => x.id === id)!, p); save(); },
  adminInvoices() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().invoices; }); },
  async adminMarkPaid(id) { if (!isAdmin()) throw new ApiError('forbidden', 403); const i = db().invoices.find((x) => x.id === id); if (!i) throw new ApiError('not_found'); i.status = 'paid'; i.paid_at = now(); const sub = db().subs.find((s) => s.store_id === i.store_id); if (sub) sub.status = 'active'; save(); },
  adminDomains() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().domains.map((d) => ({ ...d, store_name: db().stores.find((s) => s.id === d.store_id)?.name })); }); },
  async adminSetDomain(id, v, ssl) { if (!isAdmin()) throw new ApiError('forbidden', 403); const d = db().domains.find((x) => x.id === id); if (!d) throw new ApiError('not_found'); d.verification_status = v; d.ssl_status = ssl; save(); },
  adminTickets() { return wrap(() => { if (!isStaff()) throw new ApiError('forbidden', 403); return db().tickets.map((t) => ({ ...t, store_name: db().stores.find((s) => s.id === t.store_id)?.name })); }); },
  async adminSetTicket(id, p) { if (!isStaff()) throw new ApiError('forbidden', 403); const t = db().tickets.find((x) => x.id === id); if (!t) throw new ApiError('not_found'); Object.assign(t, p); t.updated_at = now(); save(); },
};
