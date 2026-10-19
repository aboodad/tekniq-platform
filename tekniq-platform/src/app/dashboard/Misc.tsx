import { useState } from 'react';
import { api } from '../../backend';
import { fmtDate } from '../../core/util';
import { useSession } from '../session';
import { Async, Badge, Empty, Field, Modal, PageHead, useAction, useLoad } from '../ui';

export function Account() {
  const { user, refresh } = useSession(); const { busy, run } = useAction();
  const [n, setN] = useState(user?.full_name || ''); const [ph, setPh] = useState(user?.phone || ''); const [pw, setPw] = useState('');
  return (
    <>
      <PageHead title="حسابي" />
      <div className="grid g2">
        <form className="card" onSubmit={async (e) => { e.preventDefault(); await run(async () => { await api.updateProfile({ full_name: n, phone: ph }); await refresh(); }, 'تم الحفظ'); }}>
          <h3>البيانات الشخصية</h3>
          <Field label="البريد"><input value={user?.email} disabled dir="ltr" /></Field>
          <Field label="الاسم"><input value={n} onChange={(e) => setN(e.target.value)} /></Field>
          <Field label="الهاتف"><input dir="ltr" value={ph} onChange={(e) => setPh(e.target.value)} /></Field>
          <button className="btn" disabled={busy}>حفظ</button>
        </form>
        <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await run(async () => { await api.updatePassword(pw); return true; }, 'تم تغيير كلمة المرور')) setPw(''); }}>
          <h3>كلمة المرور</h3>
          <Field label="كلمة مرور جديدة" hint="8 أحرف على الأقل"><input type="password" minLength={8} required dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <button className="btn" disabled={busy}>تغيير</button>
        </form>
      </div>
    </>
  );
}

const TS: Record<string, [string, 'green' | 'amber' | 'gray' | 'blue']> = { open: ['مفتوحة', 'amber'], pending: ['بانتظار ردك', 'blue'], resolved: ['تم الحل', 'green'], closed: ['مغلقة', 'gray'] };

export function Support() {
  const stores = useLoad(() => api.myStores(), []); const tk = useLoad(() => api.tickets(), []);
  const [open, setOpen] = useState<string | null>(null); const [nw, setNw] = useState(false);
  return (
    <>
      <PageHead title="الدعم الفني" sub="تذاكرك وردود فريقنا" actions={<button className="btn" onClick={() => setNw(true)}>＋ تذكرة جديدة</button>} />
      <Async s={tk}>{(l) => l.length === 0 ? <Empty title="لا توجد تذاكر" text="إذا واجهت مشكلة افتح تذكرة وسنرد عليك." /> :
        <div className="tablewrap"><table><thead><tr><th>الموضوع</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>
          {l.map((t) => <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(t.id)}><td>{t.subject}</td><td><Badge tone={TS[t.status][1]}>{TS[t.status][0]}</Badge></td><td>{fmtDate(t.created_at)}</td></tr>)}
        </tbody></table></div>}</Async>
      {nw && stores.data ? <NewTicket stores={stores.data.map((s) => ({ id: s.id, name: s.name }))} onClose={(ok) => { setNw(false); if (ok) tk.reload(); }} /> : null}
      {open ? <Thread id={open} subject={tk.data?.find((t) => t.id === open)?.subject || ''} onClose={() => { setOpen(null); tk.reload(); }} /> : null}
    </>
  );
}

function NewTicket({ stores, onClose }: { stores: { id: string; name: string }[]; onClose(ok: boolean): void }) {
  const { busy, run } = useAction(); const [s, setS] = useState(stores[0]?.id || ''); const [sub, setSub] = useState(''); const [body, setBody] = useState(''); const [pr, setPr] = useState<'low' | 'normal' | 'high'>('normal');
  return (
    <Modal title="تذكرة جديدة" onClose={() => onClose(false)} footer={<><button className="btn ghost" onClick={() => onClose(false)}>إلغاء</button>
      <button className="btn" disabled={busy || !sub || !body || !s} onClick={async () => { if (await run(() => api.createTicket(s, sub, body, pr), 'تم إرسال التذكرة')) onClose(true); }}>إرسال</button></>}>
      <Field label="المتجر"><select value={s} onChange={(e) => setS(e.target.value)}>{stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field label="الموضوع"><input value={sub} onChange={(e) => setSub(e.target.value)} /></Field>
      <Field label="الأولوية"><select value={pr} onChange={(e) => setPr(e.target.value as any)}><option value="low">منخفضة</option><option value="normal">عادية</option><option value="high">عالية</option></select></Field>
      <Field label="التفاصيل"><textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
    </Modal>
  );
}

export function Thread({ id, subject, onClose }: { id: string; subject: string; onClose(): void }) {
  const ms = useLoad(() => api.ticketMessages(id), [id]); const { busy, run } = useAction(); const [t, setT] = useState('');
  return (
    <Modal title={subject} wide onClose={onClose} footer={<div className="row grow" style={{ flexWrap: 'nowrap', width: '100%' }}><input value={t} placeholder="اكتب ردك…" onChange={(e) => setT(e.target.value)} />
      <button className="btn" disabled={busy || !t.trim()} onClick={async () => { if (await run(() => api.reply(id, t))) { setT(''); ms.reload(); } }}>إرسال</button></div>}>
      <Async s={ms}>{(l) => <div className="stack">{l.map((m) => <div key={m.id} className={'msg ' + (m.is_staff ? 'staff' : '')}><small>{m.is_staff ? 'فريق الدعم' : 'أنت'} · {fmtDate(m.created_at)}</small>{m.body}</div>)}</div>}</Async>
    </Modal>
  );
}
