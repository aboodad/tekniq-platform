import type { Api, AdminStore, MyStore } from './api';
import type { Draft, DomainRow, MediaRow, Profile, Snapshot } from '../core/types';
import * as H from './http';
import { cfg } from './config';
import { uid } from '../core/util';

const enc = encodeURIComponent;
const uidNow = () => { const u = H.getSession()?.user?.id; if (!u) throw new H.ApiError('not_authenticated', 401); return u; };
const one = <T,>(r: T[]): T => { if (!r[0]) throw new H.ApiError('not_found', 404); return r[0]; };
const patch = (table: string, filter: string, body: unknown) => H.rest(`${table}?${filter}`, { method: 'PATCH', body, prefer: 'return=minimal' });

export const supabaseApi: Api = {
  demo: false,
  async me() {
    const s = H.getSession(); if (!s) return null;
    if (!s.user.id) { try { const r = await fetch(`${cfg().SUPABASE_URL}/auth/v1/user`, { headers: { apikey: cfg().SUPABASE_ANON_KEY, Authorization: 'Bearer ' + s.access_token } }); if (r.ok) { const u = await r.json(); H.setSession({ ...s, user: u }); } else { H.setSession(null); return null; } } catch { return null; } }
    try { return one(await H.rest<Profile[]>(`profiles?id=eq.${H.getSession()!.user.id}&select=*`)); } catch (e: any) { if (e.code === 'not_found') { H.setSession(null); return null; } throw e; }
  },
  async signIn(email, password) { await H.signIn(email.trim(), password); H.rpc('touch_login').catch(() => undefined); },
  async signUp(email, password, fullName, phone) { return H.signUp(email.trim(), password, { full_name: fullName, phone: phone || '' }); },
  signOut: () => H.signOut(),
  async recover(email) { await H.recover(email.trim(), location.origin + '/reset'); },
  updatePassword: (p) => H.updatePassword(p),
  async updateProfile(p) { return one(await H.rest<Profile[]>(`profiles?id=eq.${uidNow()}`, { method: 'PATCH', body: p, prefer: 'return=representation' })); },

  async myStores() {
    const rows = await H.rest<any[]>(`store_members?user_id=eq.${uidNow()}&select=role,stores(*)&order=created_at.desc`);
    return rows.filter((r) => r.stores && r.stores.status !== 'archived').map((r) => ({ ...r.stores, myRole: r.role })) as MyStore[];
  },
  async getStore(id) {
    const s = one(await H.rest<any[]>(`stores?id=eq.${id}&select=*`));
    const m = await H.rest<any[]>(`store_members?store_id=eq.${id}&user_id=eq.${uidNow()}&select=role`);
    return { ...s, myRole: m[0]?.role ?? 'viewer' };
  },
  createStore: (i) => H.rpc('create_store', { p_name: i.name, p_slug: i.slug, p_template_id: i.templateId ?? null, p_locale: i.locale ?? 'ar', p_currency: i.currency ?? 'USD' }),
  updateStore: (id, p) => H.rpc('update_store_settings', { p_store: id, p_patch: p }),
  async archiveStore(id) { await H.rpc('archive_store', { p_store: id }); },
  templates: () => H.rest(`templates?status=eq.published&select=id,slug,name,category,description,thumbnail_url,is_premium,price,sort,status&order=sort.asc`),
  async usage(id) {
    const c = async (t: string, extra = '') => { const { total } = await H.rest<any>(`${t}?store_id=eq.${id}${extra}&select=id`, { count: true, range: [0, 0] }) as any; return total ?? 0; };
    const media = await H.rest<any[]>(`media_assets?store_id=eq.${id}&select=size_bytes`);
    return { pages: await c('pages', '&type=eq.custom'), members: await c('store_members').catch(() => 0), domains: await c('domains', '&type=eq.custom'), mediaMb: Math.round(media.reduce((n, m) => n + Number(m.size_bytes), 0) / 1048576) };
  },

  async getDraft(id) {
    const [draft, st] = await Promise.all([H.rpc<Draft>('get_editor_state', { p_store: id }), H.rest<any[]>(`stores?id=eq.${id}&select=draft_rev`)]);
    return { draft, rev: one(st).draft_rev };
  },
  saveDraft: (id, draft, rev) => H.rpc('save_draft', { p_store: id, p_draft: draft, p_base_rev: rev }),
  publish: async (id, note) => ({ versionNo: (await H.rpc<any>('publish_store', { p_store: id, p_note: note ?? null })).versionNo }),
  async versions(id) { return (await H.rpc<any[]>('list_store_versions', { p_store: id })); },
  restore: (id, v, p) => H.rpc('restore_store_version', { p_store: id, p_version: v, p_publish: !!p }),
  getPublished: (q) => H.rpc<Snapshot | null>('get_published_store', { p_slug: q.slug ?? null, p_host: q.host ?? null }),

  media: (id) => H.rest(`media_assets?store_id=eq.${id}&order=created_at.desc&select=*`),
  async uploadMedia(storeId, file) {
    if (file.size > 10 * 1048576) throw new H.ApiError('file_too_large');
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const path = `${storeId}/${uid()}.${ext}`;
    const url = await H.uploadObject(path, file, file.type || 'application/octet-stream');
    try {
      return one(await H.rest<MediaRow[]>('media_assets', { method: 'POST', prefer: 'return=representation', body: { store_id: storeId, type: file.type.startsWith('video') ? 'video' : 'image', file_name: file.name.slice(0, 200), storage_path: path, url, mime_type: file.type, size_bytes: file.size, uploaded_by: uidNow() } }));
    } catch (e) { await H.deleteObject(path).catch(() => undefined); throw e; }
  },
  async deleteMedia(m) { await H.rest(`media_assets?id=eq.${m.id}`, { method: 'DELETE' }); await H.deleteObject(m.storage_path).catch(() => undefined); },

  domains: (id) => H.rest(`domains?store_id=eq.${id}&order=created_at.asc&select=*`),
  addDomain: (id, host) => H.rpc('add_domain', { p_store: id, p_hostname: host }),
  async removeDomain(id) { await H.rpc('remove_domain', { p_domain: id }); },
  verifyDomain: (id) => H.invokeFn('verify-domain', { domain_id: id }),
  async setPrimaryDomain(id) { await H.rpc('set_primary_domain', { p_domain: id }); },

  members: (id) => H.rpc('list_store_members', { p_store: id }),
  invite: (id, email, role) => H.rpc('invite_member', { p_store: id, p_email: email, p_role: role }),
  async setMemberRole(id, u, role) { await H.rpc('update_member_role', { p_store: id, p_user: u, p_role: role }); },
  async removeMember(id, u) { await H.rpc('remove_member', { p_store: id, p_user: u }); },
  async cancelInvite(id) { await H.rpc('cancel_invite', { p_invite: id }); },

  plans: () => H.rest('plans?is_active=eq.true&order=sort.asc&select=*'),
  async subscription(id) { return (await H.rest<any[]>(`subscriptions?store_id=eq.${id}&select=*`))[0] ?? null; },
  invoices: (id) => H.rest(`invoices?store_id=eq.${id}&order=issued_at.desc&select=*`),
  async changePlan(id, plan, cycle) { await H.rpc('change_plan', { p_store: id, p_plan: plan, p_cycle: cycle }); },

  tickets: (id) => H.rest(`support_tickets?${id ? `store_id=eq.${id}&` : ''}order=updated_at.desc&select=*`),
  async createTicket(storeId, subject, body, priority) { return one(await H.rest<any[]>('support_tickets', { method: 'POST', prefer: 'return=representation', body: { store_id: storeId, user_id: uidNow(), subject, body, priority } })); },
  ticketMessages: (id) => H.rest(`ticket_messages?ticket_id=eq.${id}&order=created_at.asc&select=*`),
  async reply(id, body) { await H.rest('ticket_messages', { method: 'POST', prefer: 'return=minimal', body: { ticket_id: id, user_id: uidNow(), body } }); },
  activity: (id, limit = 50) => H.rest(`activity_logs?${id ? `store_id=eq.${id}&` : ''}order=created_at.desc&limit=${limit}&select=*`),

  adminStats: () => H.rpc('admin_stats'),
  async adminStores() {
    const [s, owners, subs, plans] = await Promise.all([H.rest<any[]>('stores?order=created_at.desc&select=*'), H.rest<any[]>('profiles?select=id,email'), H.rest<any[]>('subscriptions?select=store_id,plan_id'), H.rest<any[]>('plans?select=id,code')]);
    const em = new Map(owners.map((o) => [o.id, o.email])); const pc = new Map(plans.map((p) => [p.id, p.code])); const sp = new Map(subs.map((x) => [x.store_id, pc.get(x.plan_id)]));
    return s.map((x) => ({ ...x, owner_email: em.get(x.owner_id), plan_code: sp.get(x.id) })) as AdminStore[];
  },
  async adminSetStoreStatus(id, status) { await H.rpc('admin_set_store_status', { p_store: id, p_status: status }); },
  async adminSetIntegration(id, mode, url) { await H.rpc('admin_set_store_integration', { p_store: id, p_mode: mode, p_url: url ?? null }); },
  adminUsers: () => H.rest('profiles?order=created_at.desc&select=*'),
  async adminSetUser(id, p) { await patch('profiles', `id=eq.${id}`, p); },
  async adminSavePlan(p) { await H.rest('plans?on_conflict=code', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: p }); },
  adminTemplates: () => H.rest('templates?order=sort.asc&select=id,slug,name,category,description,thumbnail_url,is_premium,price,sort,status'),
  async adminSetTemplate(id, p) { await patch('templates', `id=eq.${id}`, p); },
  async adminDeleteTemplate(id) { await H.rest(`templates?id=eq.${id}`, { method: 'DELETE' }); },
  async adminTemplateFromStore(storeId, name, slug, category) { await H.rpc('save_store_as_template', { p_store: storeId, p_name: name, p_slug: slug, p_category: category }); },
  adminComponents: () => H.rest('component_types?order=sort.asc,key.asc&select=id,key,kind,name_ar,name_en,category,status,sort'),
  async adminSetComponent(id, p) { await patch('component_types', `id=eq.${id}`, p); },
  adminDataSources: () => H.rest('data_sources?order=key.asc&select=*'),
  async adminSetDataSource(id, p) { await patch('data_sources', `id=eq.${id}`, p); },
  adminInvoices: () => H.rest('invoices?order=issued_at.desc&limit=200&select=*'),
  async adminMarkPaid(id, ref) { await H.rpc('admin_mark_invoice_paid', { p_invoice: id, p_ref: ref ?? null }); },
  async adminDomains() {
    const [d, s] = await Promise.all([H.rest<any[]>('domains?order=created_at.desc&select=*'), H.rest<any[]>('stores?select=id,name')]);
    const nm = new Map(s.map((x) => [x.id, x.name])); return d.map((x) => ({ ...x, store_name: nm.get(x.store_id) })) as (DomainRow & { store_name?: string })[];
  },
  async adminSetDomain(id, v, ssl) { await H.rpc('admin_set_domain_status', { p_domain: id, p_verification: v, p_ssl: ssl }); },
  async adminTickets() {
    const [t, s] = await Promise.all([H.rest<any[]>('support_tickets?order=updated_at.desc&select=*'), H.rest<any[]>('stores?select=id,name')]);
    const nm = new Map(s.map((x) => [x.id, x.name])); return t.map((x) => ({ ...x, store_name: nm.get(x.store_id) }));
  },
  async adminSetTicket(id, p) { await patch('support_tickets', `id=eq.${id}`, p); },
};
