import { useState } from 'react';
import { api } from '../backend';
import { Link, Redirect } from '../core/router';
import { fmtDate, money } from '../core/util';
import type { Plan, Profile, StoreStatus, TemplateRow } from '../core/types';
import { Shell, type NavGroup } from '../app/shell';
import { useSession } from '../app/session';
import { Async, Badge, Empty, Field, Modal, PageHead, useAction, useLoad, useUi } from '../app/ui';
import { STATUS } from '../app/dashboard/Home';
import { Thread } from '../app/dashboard/Misc';

const NAV: NavGroup[] = [
  { items: [{ to: '/admin', label: 'نظرة عامة', icon: '📊', exact: true }, { to: '/admin/stores', label: 'المتاجر', icon: '🏬' }, { to: '/admin/users', label: 'المستخدمون', icon: '👥' }] },
  { title: 'المنصة', items: [{ to: '/admin/plans', label: 'الباقات', icon: '💎' }, { to: '/admin/templates', label: 'القوالب', icon: '🎨' }, { to: '/admin/components', label: 'المكوّنات', icon: '🧩' }, { to: '/admin/integrations', label: 'مصادر البيانات', icon: '🔌' }] },
  { title: 'العمليات', items: [{ to: '/admin/domains', label: 'النطاقات', icon: '🌐' }, { to: '/admin/invoices', label: 'الفواتير', icon: '🧾' }, { to: '/admin/tickets', label: 'الدعم', icon: '🎧' }, { to: '/admin/activity', label: 'سجل النشاط', icon: '📜' }] },
];

export function Admin({ path }: { path: string }) {
  const { user } = useSession(); const admin = user?.role === 'platform_admin';
  const k = path.split('/')[2] || '';
  const P: Record<string, JSX.Element> = { '': <Overview />, stores: <Stores admin={admin} />, users: <Users admin={admin} />, plans: <Plans admin={admin} />, templates: <Templates admin={admin} />, components: <Components admin={admin} />,
    integrations: <Sources admin={admin} />, domains: <Domains admin={admin} />, invoices: <Invoices admin={admin} />, tickets: <Tickets />, activity: <Activity /> };
  return <Shell nav={NAV} roles={['platform_admin', 'support']} title="لوحة الشركة">{P[k] ?? <Redirect to="/admin" />}</Shell>;
}

const RO = () => <div className="notice" style={{ marginBottom: 14 }}>صلاحيتك للعرض فقط.</div>;
const Tbl = ({ head, children }: { head: string[]; children: React.ReactNode }) => <div className="tablewrap"><table><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;

function Overview() {
  const s = useLoad(() => api.adminStats(), []);
  return <><PageHead title="نظرة عامة" sub="حالة المنصة" /><Async s={s}>{(d) => (
    <div className="stack"><div className="grid g4">{[['المستخدمون', d.users], ['المتاجر', d.stores], ['تذاكر مفتوحة', d.openTickets], ['فواتير غير مدفوعة', d.unpaidInvoices], ['نطاقات قيد التوثيق', d.pendingDomains]].map(([l, v]) => <div className="card statcard" key={String(l)}><b>{v}</b><span>{l}</span></div>)}</div>
      <div className="grid g2"><div className="card"><h3>المتاجر حسب الحالة</h3>{Object.entries(d.storesByStatus).map(([k, v]) => <div className="row sp" key={k} style={{ padding: '4px 0' }}><span>{STATUS[k as StoreStatus]?.[0] || k}</span><b>{v}</b></div>)}</div>
        <div className="card"><h3>الاشتراكات حسب الباقة</h3>{Object.entries(d.subscriptionsByPlan).map(([k, v]) => <div className="row sp" key={k} style={{ padding: '4px 0' }}><span>{k}</span><b>{v}</b></div>)}</div></div></div>)}</Async></>;
}

function Stores({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.adminStores(), []); const { run } = useAction(); const ui = useUi(); const [q, setQ] = useState(''); const [edit, setEdit] = useState<string | null>(null); const [tpl, setTpl] = useState<string | null>(null);
  return <><PageHead title="المتاجر" actions={<input placeholder="بحث…" style={{ width: 200 }} value={q} onChange={(e) => setQ(e.target.value)} />} />{!admin && <RO />}
    <Async s={s}>{(l) => <Tbl head={['المتجر', 'المالك', 'الباقة', 'الحالة', 'مصدر البيانات', '']}>{l.filter((x) => (x.name + x.slug + (x.owner_email || '')).toLowerCase().includes(q.toLowerCase())).map((x) => (
      <tr key={x.id}><td><b>{x.name}</b><div className="muted ltr" style={{ fontSize: 12 }}>{x.slug}</div></td><td className="ltr">{x.owner_email}</td><td>{x.plan_code}</td>
        <td>{admin ? <select style={{ width: 150 }} value={x.status} onChange={async (e) => { await run(() => api.adminSetStoreStatus(x.id, e.target.value as StoreStatus), 'تم التحديث'); s.reload(); }}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select> : <Badge tone={STATUS[x.status][1]}>{STATUS[x.status][0]}</Badge>}</td>
        <td><Badge tone={x.data_mode === 'mock' ? 'gray' : 'violet'}>{x.data_mode}</Badge></td>
        <td><div className="row"><Link to={'/dashboard/stores/' + x.id} className="btn sm ghost">عرض</Link>{admin ? <><button className="btn sm ghost" onClick={() => setEdit(x.id)}>الربط</button><button className="btn sm ghost" onClick={() => setTpl(x.id)}>حفظ كقالب</button></> : null}</div></td></tr>))}</Tbl>}</Async>
    {edit ? <Integration store={s.data!.find((x) => x.id === edit)!} onClose={(ok) => { setEdit(null); if (ok) s.reload(); }} /> : null}
    {tpl ? <TplFromStore id={tpl} onClose={() => setTpl(null)} /> : null}
    <span hidden>{String(!!ui)}</span></>;
}
function Integration({ store, onClose }: { store: any; onClose(ok: boolean): void }) {
  const { busy, run } = useAction(); const [m, setM] = useState<'mock' | 'supabase' | 'http'>(store.data_mode); const [u, setU] = useState(store.data_api_url || '');
  return <Modal title={'ربط البيانات: ' + store.name} onClose={() => onClose(false)} footer={<><button className="btn ghost" onClick={() => onClose(false)}>إلغاء</button><button className="btn" disabled={busy} onClick={async () => { if (await run(() => api.adminSetIntegration(store.id, m, u), 'تم الحفظ')) onClose(true); }}>حفظ</button></>}>
    <Field label="مصدر بيانات المتجر" hint="mock: بيانات تجريبية · supabase: جداول المنتجات والطلبات في قاعدتكم · http: واجهة API خارجية"><select value={m} onChange={(e) => setM(e.target.value as any)}><option value="mock">mock — تجريبي</option><option value="supabase">supabase — قاعدة المنصة</option><option value="http">http — API خارجي</option></select></Field>
    {m === 'http' ? <Field label="رابط الـ API الأساسي"><input dir="ltr" placeholder="https://api.example.com" value={u} onChange={(e) => setU(e.target.value)} /></Field> : null}
    <p className="muted" style={{ fontSize: 13 }}>عند تحويل متجر منشور من mock إلى مصدر حقيقي تصبح حالته «منشور».</p></Modal>;
}
function TplFromStore({ id, onClose }: { id: string; onClose(): void }) {
  const { busy, run } = useAction(); const [n, setN] = useState(''); const [sl, setSl] = useState(''); const [c, setC] = useState('general');
  return <Modal title="حفظ التصميم كقالب" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy || !n || !sl} onClick={async () => { if (await run(() => api.adminTemplateFromStore(id, n, sl, c), 'تم إنشاء القالب (مسودة)')) onClose(); }}>حفظ</button></>}>
    <Field label="اسم القالب"><input value={n} onChange={(e) => setN(e.target.value)} /></Field><Field label="المعرّف"><input dir="ltr" value={sl} onChange={(e) => setSl(e.target.value.toLowerCase())} /></Field><Field label="التصنيف"><input value={c} onChange={(e) => setC(e.target.value)} /></Field></Modal>;
}

function Users({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.adminUsers(), []); const { run } = useAction(); const { user } = useSession(); const [q, setQ] = useState('');
  const set = async (p: Profile, patch: any) => { await run(() => api.adminSetUser(p.id, patch), 'تم التحديث'); s.reload(); };
  return <><PageHead title="المستخدمون" actions={<input placeholder="بحث…" style={{ width: 200 }} value={q} onChange={(e) => setQ(e.target.value)} />} />{!admin && <RO />}
    <Async s={s}>{(l) => <Tbl head={['المستخدم', 'الدور', 'الحالة', 'آخر دخول']}>{l.filter((u) => ((u.full_name || '') + u.email).toLowerCase().includes(q.toLowerCase())).map((u) => (
      <tr key={u.id}><td>{u.full_name || '—'}<div className="muted ltr" style={{ fontSize: 12 }}>{u.email}</div></td>
        <td>{admin && u.id !== user?.id ? <select style={{ width: 130 }} value={u.role} onChange={(e) => set(u, { role: e.target.value })}><option value="merchant">تاجر</option><option value="support">دعم</option><option value="platform_admin">مدير</option></select> : u.role}</td>
        <td>{admin && u.id !== user?.id ? <select style={{ width: 110 }} value={u.status} onChange={(e) => set(u, { status: e.target.value })}><option value="active">نشط</option><option value="suspended">موقوف</option></select> : u.status}</td><td>{fmtDate(u.last_login_at)}</td></tr>))}</Tbl>}</Async></>;
}

function Plans({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.plans(), []); const [ed, setEd] = useState<Partial<Plan> | null>(null);
  return <><PageHead title="الباقات" actions={admin ? <button className="btn" onClick={() => setEd({ code: '', name: '', price_monthly: 0, price_yearly: 0, currency: 'USD', limits_json: { stores: 1, custom_pages: 3, seats: 2, domains: 0, media_mb: 100 }, is_active: true })}>＋ باقة</button> : null} />
    <Async s={s}>{(l) => <Tbl head={['الرمز', 'الاسم', 'شهري', 'سنوي', 'الحدود', 'الحالة', '']}>{l.map((p) => <tr key={p.id}><td className="ltr">{p.code}</td><td>{p.name}</td><td>{money(p.price_monthly, p.currency)}</td><td>{money(p.price_yearly, p.currency)}</td>
      <td className="muted" style={{ fontSize: 12 }}>{Object.entries(p.limits_json).map(([k, v]) => `${k}:${v}`).join(' · ')}</td><td><Badge tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'نشطة' : 'مخفية'}</Badge></td><td>{admin ? <button className="btn sm ghost" onClick={() => setEd(p)}>تعديل</button> : null}</td></tr>)}</Tbl>}</Async>
    {ed ? <PlanForm p={ed} onClose={(ok) => { setEd(null); if (ok) s.reload(); }} /> : null}</>;
}
function PlanForm({ p, onClose }: { p: Partial<Plan>; onClose(ok: boolean): void }) {
  const { busy, run } = useAction(); const [f, setF] = useState({ ...p, limits_json: { ...p.limits_json } } as any); const L = ['stores', 'custom_pages', 'seats', 'domains', 'media_mb'];
  return <Modal title={p.id ? 'تعديل الباقة' : 'باقة جديدة'} wide onClose={() => onClose(false)} footer={<><button className="btn ghost" onClick={() => onClose(false)}>إلغاء</button><button className="btn" disabled={busy || !f.code || !f.name} onClick={async () => { if (await run(() => api.adminSavePlan(f), 'تم الحفظ')) onClose(true); }}>حفظ</button></>}>
    <div className="grid g2"><Field label="الرمز"><input dir="ltr" value={f.code} disabled={!!p.id} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} /></Field><Field label="الاسم"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="السعر الشهري"><input type="number" min={0} value={f.price_monthly} onChange={(e) => setF({ ...f, price_monthly: Number(e.target.value) })} /></Field><Field label="السعر السنوي"><input type="number" min={0} value={f.price_yearly} onChange={(e) => setF({ ...f, price_yearly: Number(e.target.value) })} /></Field>
      {L.map((k) => <Field key={k} label={k}><input type="number" min={0} value={f.limits_json[k] ?? 0} onChange={(e) => setF({ ...f, limits_json: { ...f.limits_json, [k]: Number(e.target.value) } })} /></Field>)}
      <Field label="الحالة"><select value={f.is_active ? '1' : '0'} onChange={(e) => setF({ ...f, is_active: e.target.value === '1' })}><option value="1">نشطة</option><option value="0">مخفية</option></select></Field></div></Modal>;
}

function Templates({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.adminTemplates(), []); const { run } = useAction(); const ui = useUi();
  const set = async (t: TemplateRow, patch: Partial<TemplateRow>) => { await run(() => api.adminSetTemplate(t.id, patch), 'تم التحديث'); s.reload(); };
  return <><PageHead title="القوالب" sub="القوالب المنشورة تظهر للتجار عند إنشاء متجر" />{!admin && <RO />}
    <Async s={s}>{(l) => l.length === 0 ? <Empty title="لا توجد قوالب" /> : <Tbl head={['القالب', 'التصنيف', 'مميز', 'الحالة', '']}>{l.map((t) => <tr key={t.id}><td><b>{t.name}</b><div className="muted ltr" style={{ fontSize: 12 }}>{t.slug}</div></td><td>{t.category}</td>
      <td>{admin ? <input type="checkbox" checked={t.is_premium} onChange={(e) => set(t, { is_premium: e.target.checked })} /> : t.is_premium ? '★' : ''}</td>
      <td>{admin ? <select style={{ width: 120 }} value={t.status} onChange={(e) => set(t, { status: e.target.value as any })}><option value="draft">مسودة</option><option value="published">منشور</option><option value="archived">مؤرشف</option></select> : t.status}</td>
      <td>{admin && t.slug !== 'blank' ? <button className="btn sm danger" onClick={async () => { if (await ui.confirm('حذف القالب؟', { danger: true })) { await run(() => api.adminDeleteTemplate(t.id), 'تم الحذف'); s.reload(); } }}>حذف</button> : null}</td></tr>)}</Tbl>}</Async></>;
}

function Components({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.adminComponents(), []); const { run } = useAction();
  return <><PageHead title="مكوّنات المحرر" sub="إيقاف مكوّن يمنع إضافته الجديدة (المتاجر الحالية لا تتأثر)" />{!admin && <RO />}
    <Async s={s}>{(l) => <Tbl head={['المفتاح', 'الاسم', 'النوع', 'التصنيف', 'الحالة']}>{l.map((c) => <tr key={c.id}><td className="ltr"><code>{c.key}</code></td><td>{c.name_ar}</td><td>{c.kind === 'section' ? 'قسم' : 'عنصر'}</td><td>{c.category}</td>
      <td>{admin ? <select style={{ width: 120 }} value={c.status} onChange={async (e) => { await run(() => api.adminSetComponent(c.id, { status: e.target.value as any })); s.reload(); }}><option value="active">نشط</option><option value="deprecated">متوقف</option></select> : c.status}</td></tr>)}</Tbl>}</Async></>;
}

function Sources({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.adminDataSources(), []); const { run } = useAction();
  return <><PageHead title="مصادر البيانات" sub="كل قسم في المتجر يطلب بياناته عبر مفتاح من هذه القائمة. عند ربط API خارجي (http) تُستبدل المسارات أدناه بمسارات خدمتكم." />{!admin && <RO />}
    <Async s={s}>{(l) => <Tbl head={['المفتاح', 'الوصف', 'الطريقة', 'المسار', 'الحالة']}>{l.map((d) => <tr key={d.id}><td className="ltr"><code>{d.key}</code></td><td>{d.name}</td><td>{d.method}</td>
      <td>{admin ? <input dir="ltr" defaultValue={d.endpoint_template} onBlur={async (e) => { if (e.target.value !== d.endpoint_template) await run(() => api.adminSetDataSource(d.id, { endpoint_template: e.target.value }), 'تم الحفظ'); }} /> : <code>{d.endpoint_template}</code>}</td>
      <td><Badge tone={d.status === 'ready' ? 'green' : 'amber'}>{d.status}</Badge></td></tr>)}</Tbl>}</Async></>;
}

function Domains({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.adminDomains(), []); const { run } = useAction();
  return <><PageHead title="النطاقات" sub="توثيق DNS يتم عبر دالة verify-domain، ويمكنك التوثيق يدوياً من هنا" />{!admin && <RO />}
    <Async s={s}>{(l) => <Tbl head={['النطاق', 'المتجر', 'التوثيق', 'SSL', '']}>{l.map((d) => <tr key={d.id}><td className="ltr">{d.hostname}</td><td>{d.store_name}</td><td><Badge tone={d.verification_status === 'verified' ? 'green' : d.verification_status === 'failed' ? 'red' : 'amber'}>{d.verification_status}</Badge></td><td>{d.ssl_status}</td>
      <td>{admin && d.type === 'custom' ? <div className="row"><button className="btn sm" onClick={async () => { await run(() => api.adminSetDomain(d.id, 'verified', 'active'), 'تم التوثيق'); s.reload(); }}>توثيق + SSL</button><button className="btn sm ghost" onClick={async () => { await run(() => api.adminSetDomain(d.id, 'failed', 'failed')); s.reload(); }}>رفض</button></div> : null}</td></tr>)}</Tbl>}</Async></>;
}

function Invoices({ admin }: { admin: boolean }) {
  const s = useLoad(() => api.adminInvoices(), []); const { run } = useAction();
  return <><PageHead title="الفواتير" />{!admin && <RO />}<Async s={s}>{(l) => l.length === 0 ? <Empty title="لا توجد فواتير" /> : <Tbl head={['الرقم', 'المبلغ', 'الحالة', 'التاريخ', '']}>{l.map((i) => <tr key={i.id}><td className="ltr">{i.number}</td><td>{money(i.amount, i.currency)}</td><td><Badge tone={i.status === 'paid' ? 'green' : 'amber'}>{i.status}</Badge></td><td>{fmtDate(i.issued_at)}</td>
    <td>{admin && i.status === 'unpaid' ? <button className="btn sm" onClick={async () => { await run(() => api.adminMarkPaid(i.id, 'manual'), 'تم تسجيل الدفع'); s.reload(); }}>تسجيل كمدفوعة</button> : null}</td></tr>)}</Tbl>}</Async></>;
}

function Tickets() {
  const s = useLoad(() => api.adminTickets(), []); const { run } = useAction(); const [open, setOpen] = useState<string | null>(null);
  return <><PageHead title="تذاكر الدعم" /><Async s={s}>{(l) => l.length === 0 ? <Empty title="لا توجد تذاكر" /> : <Tbl head={['الموضوع', 'المتجر', 'الأولوية', 'الحالة', '']}>{l.map((t) => <tr key={t.id}><td>{t.subject}</td><td>{t.store_name}</td><td>{t.priority}</td>
    <td><select style={{ width: 120 }} value={t.status} onChange={async (e) => { await run(() => api.adminSetTicket(t.id, { status: e.target.value as any })); s.reload(); }}><option value="open">مفتوحة</option><option value="pending">بانتظار العميل</option><option value="resolved">محلولة</option><option value="closed">مغلقة</option></select></td>
    <td><button className="btn sm ghost" onClick={() => setOpen(t.id)}>فتح</button></td></tr>)}</Tbl>}</Async>
    {open ? <Thread id={open} subject={s.data?.find((t) => t.id === open)?.subject || ''} onClose={() => { setOpen(null); s.reload(); }} /> : null}</>;
}

function Activity() {
  const s = useLoad(() => api.activity(undefined, 100), []);
  return <><PageHead title="سجل النشاط" /><Async s={s}>{(l) => <Tbl head={['الإجراء', 'الكيان', 'التفاصيل', 'الوقت']}>{l.map((a) => <tr key={a.id}><td><code>{a.action}</code></td><td>{a.entity_type || '—'}</td><td className="muted ltr" style={{ fontSize: 12 }}>{JSON.stringify(a.meta_json).slice(0, 80)}</td><td>{fmtDate(a.created_at)}</td></tr>)}</Tbl>}</Async></>;
}
