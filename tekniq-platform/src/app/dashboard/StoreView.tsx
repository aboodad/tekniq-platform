import { useRef, useState } from 'react';
import { api } from '../../backend';
import { cfg } from '../../backend/config';
import { Link, navigate } from '../../core/router';
import { fmtDate, money } from '../../core/util';
import type { MediaRow } from '../../core/types';
import { Async, Badge, Empty, Field, PageHead, useAction, useLoad, useUi } from '../ui';
import { STATUS } from './Home';

const TABS: [string, string][] = [['overview', 'نظرة عامة'], ['media', 'الوسائط'], ['domains', 'النطاقات'], ['team', 'الفريق'], ['billing', 'الاشتراك'], ['versions', 'النسخ'], ['settings', 'الإعدادات']];

export function StoreView({ id, tab }: { id: string; tab: string }) {
  const st = useLoad(() => api.getStore(id), [id]);
  return (
    <Async s={st}>{(s) => (
      <>
        <PageHead title={s.name} sub={`${s.slug}.${cfg().ROOT_DOMAIN}`} actions={<>
          <Badge tone={STATUS[s.status][1]}>{STATUS[s.status][0]}</Badge>
          <Link to={'/preview/' + id} className="btn ghost sm">معاينة</Link>
          {s.myRole !== 'viewer' ? <Link to={'/editor/' + id} className="btn sm">فتح المحرر</Link> : null}</>} />
        <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => navigate(`/dashboard/stores/${id}/${k}`)}>{l}</button>)}</div>
        {tab === 'overview' ? <Overview id={id} s={s} /> : tab === 'media' ? <Media id={id} canEdit={s.myRole !== 'viewer'} />
          : tab === 'domains' ? <Domains id={id} owner={s.myRole === 'owner'} /> : tab === 'team' ? <Team id={id} owner={s.myRole === 'owner'} />
          : tab === 'billing' ? <Billing id={id} owner={s.myRole === 'owner'} /> : tab === 'versions' ? <Versions id={id} canEdit={s.myRole !== 'viewer'} />
          : <Settings s={s} reload={st.reload} />}
      </>)}</Async>
  );
}

function Overview({ id, s }: { id: string; s: any }) {
  const u = useLoad(() => api.usage(id), [id]); const sub = useLoad(() => api.subscription(id).catch(() => null), [id]); const act = useLoad(() => api.activity(id, 8).catch(() => []), [id]);
  return (
    <div className="stack">
      {s.status === 'ready_for_integration' ? <div className="notice">متجرك منشور بتصميمه وجاهز. سيتم ربط البيانات والعمليات (المنتجات والطلبات) من قِبل فريق الشركة.</div> : null}
      {s.status === 'draft' ? <div className="notice">لم تنشر متجرك بعد. افتح المحرر واضغط «نشر».</div> : null}
      <div className="grid g4">{[['الصفحات', u.data?.pages], ['أعضاء الفريق', u.data?.members], ['النطاقات المخصصة', u.data?.domains], ['الوسائط (MB)', u.data?.mediaMb]].map(([l, v]) =>
        <div className="card statcard" key={String(l)}><b>{v ?? '—'}</b><span>{l}</span></div>)}</div>
      <div className="grid g2">
        <div className="card"><h3>الاشتراك</h3>{sub.data ? <dl className="kv"><dt>الحالة</dt><dd>{sub.data.status}</dd><dt>الدورة</dt><dd>{sub.data.billing_cycle === 'yearly' ? 'سنوي' : 'شهري'}</dd><dt>التجربة حتى</dt><dd>{fmtDate(sub.data.trial_ends_at)}</dd></dl> : <span className="muted">—</span>}</div>
        <div className="card"><h3>آخر النشاط</h3><div className="timeline">{(act.data || []).map((a) => <div key={a.id}><span className="grow">{a.action}</span><span className="muted">{fmtDate(a.created_at)}</span></div>)}{!act.data?.length ? <span className="muted">لا يوجد نشاط</span> : null}</div></div>
      </div>
    </div>
  );
}

function Media({ id, canEdit }: { id: string; canEdit: boolean }) {
  const ml = useLoad(() => api.media(id), [id]); const { busy, run } = useAction(); const ui = useUi(); const ref = useRef<HTMLInputElement>(null);
  const up = async (files: FileList | null) => { if (!files) return; for (const f of Array.from(files)) await run(() => api.uploadMedia(id, f)); ml.reload(); };
  return (
    <div className="stack">
      {canEdit ? <div className="drop" onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); up(e.dataTransfer.files); }}>
        {busy ? 'جارٍ الرفع…' : 'اسحب الصور هنا أو اضغط للاختيار (حتى 5MB للملف)'}<input ref={ref} type="file" hidden multiple accept="image/*,video/mp4,video/webm" onChange={(e) => { up(e.target.files); e.target.value = ''; }} /></div> : null}
      <Async s={ml}>{(l: MediaRow[]) => l.length === 0 ? <Empty title="لا توجد وسائط" /> : <div className="mediagrid">{l.map((m) => (
        <div className="mediaitem" key={m.id}>{m.type === 'video' ? <video src={m.url} /> : <img src={m.url} alt={m.file_name} loading="lazy" />}
          {canEdit ? <button className="x icon" aria-label="حذف" onClick={async () => { if (await ui.confirm('حذف هذا الملف؟', { danger: true, ok: 'حذف' })) { await run(() => api.deleteMedia(m)); ml.reload(); } }}>✕</button> : null}</div>))}</div>}</Async>
    </div>
  );
}

function Domains({ id, owner }: { id: string; owner: boolean }) {
  const dl = useLoad(() => api.domains(id), [id]); const { busy, run } = useAction(); const ui = useUi(); const [h, setH] = useState('');
  return (
    <div className="stack">
      {owner ? <form className="card row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.addDomain(id, h), 'تمت الإضافة')) { setH(''); dl.reload(); } }}>
        <input className="grow" dir="ltr" placeholder="shop.example.com" value={h} onChange={(e) => setH(e.target.value)} required /><button className="btn" disabled={busy}>إضافة نطاق</button></form> : null}
      <Async s={dl}>{(l) => <div className="stack">{l.map((d) => (
        <div className="card stack" key={d.id}>
          <div className="row sp"><div className="row"><b className="ltr">{d.hostname}</b>{d.is_primary ? <Badge tone="violet">أساسي</Badge> : null}
            <Badge tone={d.verification_status === 'verified' ? 'green' : d.verification_status === 'failed' ? 'red' : 'amber'}>{d.verification_status === 'verified' ? 'موثّق' : d.verification_status === 'failed' ? 'فشل' : 'بانتظار التوثيق'}</Badge>
            <Badge tone={d.ssl_status === 'active' ? 'green' : 'gray'}>SSL {d.ssl_status === 'active' ? 'فعّال' : 'قيد التفعيل'}</Badge></div>
            {owner && d.type === 'custom' ? <div className="row">{d.verification_status !== 'verified' ? <button className="btn sm" onClick={async () => { const r = await run(() => api.verifyDomain(d.id)); if (r) { ui.toast(r.status === 'verified' ? 'تم توثيق النطاق ✓' : 'لم تظهر سجلات DNS بعد، حاول بعد دقائق', r.status === 'verified' ? 'ok' : 'err'); dl.reload(); } }}>تحقق الآن</button> : null}{!d.is_primary && d.verification_status === 'verified' ? <button className="btn sm ghost" onClick={async () => { await run(() => api.setPrimaryDomain(d.id)); dl.reload(); }}>اجعله أساسياً</button> : null}
              <button className="btn sm danger" onClick={async () => { if (await ui.confirm('حذف النطاق؟', { danger: true, ok: 'حذف' })) { await run(() => api.removeDomain(d.id)); dl.reload(); } }}>حذف</button></div> : null}</div>
          {d.type === 'custom' && d.verification_status !== 'verified' ? <div className="notice">أضف السجلات التالية عند مزوّد النطاق، وسيتم التوثيق تلقائياً بعد انتشارها:
            <div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>النوع</th><th>الاسم</th><th>القيمة</th></tr></thead><tbody>{d.dns_records_json.map((r, i) => <tr key={i}><td>{r.type}</td><td><code>{r.name}</code></td><td><code>{r.value}</code></td></tr>)}</tbody></table></div></div> : null}
        </div>))}</div>}</Async>
    </div>
  );
}

function Team({ id, owner }: { id: string; owner: boolean }) {
  const tl = useLoad(() => api.members(id), [id]); const { busy, run } = useAction(); const ui = useUi(); const [em, setEm] = useState(''); const [rl, setRl] = useState<'editor' | 'viewer'>('editor');
  const RL: Record<string, string> = { owner: 'مالك', editor: 'محرر', viewer: 'مشاهد' };
  return (
    <div className="stack">
      {owner ? <form className="card row" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api.invite(id, em, rl)); if (r) { ui.toast(r.status === 'added' ? 'تمت إضافة العضو' : 'سيُضاف عند تسجيله بهذا البريد'); setEm(''); tl.reload(); } }}>
        <input className="grow" type="email" dir="ltr" placeholder="email@example.com" required value={em} onChange={(e) => setEm(e.target.value)} />
        <select style={{ width: 130 }} value={rl} onChange={(e) => setRl(e.target.value as any)}><option value="editor">محرر</option><option value="viewer">مشاهد</option></select><button className="btn" disabled={busy}>دعوة</button></form> : null}
      <Async s={tl}>{(d) => <div className="tablewrap"><table><thead><tr><th>العضو</th><th>الدور</th><th /></tr></thead><tbody>
        {d.members.map((m) => <tr key={m.userId}><td>{m.name || m.email}<div className="muted ltr" style={{ fontSize: 12 }}>{m.email}</div></td>
          <td>{owner && m.role !== 'owner' ? <select value={m.role} style={{ width: 120 }} onChange={async (e) => { await run(() => api.setMemberRole(id, m.userId, e.target.value as any)); tl.reload(); }}><option value="editor">محرر</option><option value="viewer">مشاهد</option></select> : RL[m.role]}</td>
          <td>{owner && m.role !== 'owner' ? <button className="btn sm danger" onClick={async () => { if (await ui.confirm('إزالة العضو؟', { danger: true })) { await run(() => api.removeMember(id, m.userId)); tl.reload(); } }}>إزالة</button> : null}</td></tr>)}
        {d.invites.map((i) => <tr key={i.id}><td>{i.email} <Badge tone="amber">دعوة معلّقة</Badge></td><td>{RL[i.role]}</td><td>{owner ? <button className="btn sm ghost" onClick={async () => { await run(() => api.cancelInvite(i.id)); tl.reload(); }}>إلغاء</button> : null}</td></tr>)}
      </tbody></table></div>}</Async>
    </div>
  );
}

function Billing({ id, owner }: { id: string; owner: boolean }) {
  const plans = useLoad(() => api.plans(), []); const sub = useLoad(() => api.subscription(id).catch(() => null), [id]); const inv = useLoad(() => api.invoices(id).catch(() => []), [id]);
  const { busy, run } = useAction(); const [cy, setCy] = useState<'monthly' | 'yearly'>('monthly'); const ui = useUi();
  if (!owner) return <div className="notice">صفحة الاشتراك متاحة لمالك المتجر فقط.</div>;
  return (
    <div className="stack">
      <div className="row"><button className={'btn sm ' + (cy === 'monthly' ? '' : 'ghost')} onClick={() => setCy('monthly')}>شهري</button><button className={'btn sm ' + (cy === 'yearly' ? '' : 'ghost')} onClick={() => setCy('yearly')}>سنوي (وفّر شهرين)</button></div>
      <Async s={plans}>{(l) => <div className="grid g3">{l.map((p) => { const cur = sub.data?.plan_id === p.id; const price = cy === 'yearly' ? p.price_yearly : p.price_monthly; return (
        <div key={p.id} className={'card plan ' + (cur ? 'on' : '')}><h3>{p.name}</h3><div className="price">{price ? money(price, p.currency) : 'مجاني'}<small className="muted" style={{ fontSize: 13 }}>{price ? (cy === 'yearly' ? ' / سنة' : ' / شهر') : ''}</small></div>
          <p className="muted">{p.description}</p>
          <ul><li>{p.limits_json.stores} متجر</li><li>{p.limits_json.custom_pages} صفحة مخصصة</li><li>{p.limits_json.seats} أعضاء فريق</li><li>{p.limits_json.domains} نطاق مخصص</li><li>{p.limits_json.media_mb}MB وسائط</li></ul>
          {cur ? <Badge tone="violet">باقتك الحالية</Badge> : <button className="btn" disabled={busy} onClick={async () => { if (await ui.confirm(`التحويل إلى باقة ${p.name}؟`)) { await run(() => api.changePlan(id, p.id, cy), 'تم تغيير الباقة'); sub.reload(); inv.reload(); } }}>اختيار</button>}</div>); })}</div>}</Async>
      <div className="card"><h3>الفواتير</h3><Async s={inv}>{(l) => l.length === 0 ? <span className="muted">لا توجد فواتير</span> : <div className="tablewrap"><table><thead><tr><th>الرقم</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>
        {l.map((i) => <tr key={i.id}><td className="ltr">{i.number}</td><td>{money(i.amount, i.currency)}</td><td><Badge tone={i.status === 'paid' ? 'green' : 'amber'}>{i.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</Badge></td><td>{fmtDate(i.issued_at)}</td></tr>)}</tbody></table></div>}</Async>
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>تُسوّى الفواتير غير المدفوعة عبر فريق الشركة أو بوابة الدفع بعد ربطها.</p></div>
    </div>
  );
}

function Versions({ id, canEdit }: { id: string; canEdit: boolean }) {
  const vl = useLoad(() => api.versions(id), [id]); const { run } = useAction(); const ui = useUi();
  return <Async s={vl}>{(l) => l.length === 0 ? <Empty title="لا توجد نسخ منشورة بعد" /> : <div className="tablewrap"><table><thead><tr><th>#</th><th>الملاحظة</th><th>بواسطة</th><th>التاريخ</th><th /></tr></thead><tbody>
    {l.map((v) => <tr key={v.id}><td>{v.version_no} {v.is_current ? <Badge tone="green">الحالية</Badge> : null}</td><td>{v.note || '—'}</td><td>{v.author || '—'}</td><td>{fmtDate(v.published_at)}</td>
      <td>{canEdit && !v.is_current ? <div className="row"><button className="btn sm ghost" onClick={async () => { if (await ui.confirm('استرجاع هذه النسخة كمسودة؟ ستحل محل مسودتك الحالية.')) await run(() => api.restore(id, v.id), 'تم الاسترجاع كمسودة'); }}>استرجاع</button>
        <button className="btn sm" onClick={async () => { if (await ui.confirm('استرجاع ونشر هذه النسخة مباشرة؟')) { await run(() => api.restore(id, v.id, true), 'تم الاسترجاع والنشر'); vl.reload(); } }}>استرجاع ونشر</button></div> : null}</td></tr>)}
  </tbody></table></div>}</Async>;
}

function Settings({ s, reload }: { s: any; reload(): void }) {
  const { busy, run } = useAction(); const ui = useUi(); const [f, setF] = useState({ name: s.name, currency: s.currency, direction: s.direction, default_locale: s.default_locale });
  const owner = s.myRole === 'owner';
  return (
    <div className="stack">
      <form className="card" onSubmit={async (e) => { e.preventDefault(); await run(() => api.updateStore(s.id, f), 'تم الحفظ'); reload(); }}>
        <h3>إعدادات المتجر</h3><div className="grid g2">
          <Field label="اسم المتجر"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="العملة"><select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{['USD', 'SAR', 'AED', 'YER', 'EGP', 'KWD', 'QAR', 'EUR'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="الاتجاه"><select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="rtl">من اليمين لليسار</option><option value="ltr">من اليسار لليمين</option></select></Field>
          <Field label="اللغة"><select value={f.default_locale} onChange={(e) => setF({ ...f, default_locale: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></select></Field>
        </div><button className="btn" disabled={busy || s.myRole === 'viewer'}>حفظ</button></form>
      {owner ? <div className="card"><h3>منطقة الخطر</h3><p className="muted" style={{ marginBottom: 12 }}>أرشفة المتجر تُخفيه من الموقع وتوقف التعديل عليه.</p>
        <button className="btn danger" onClick={async () => { if (await ui.confirm('أرشفة هذا المتجر؟', { danger: true, ok: 'أرشفة' })) { await run(() => api.archiveStore(s.id), 'تمت الأرشفة'); navigate('/dashboard'); } }}>أرشفة المتجر</button></div> : null}
    </div>
  );
}
