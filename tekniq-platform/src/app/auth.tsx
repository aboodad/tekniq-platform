import { useState, type FormEvent } from 'react';
import { api } from '../backend';
import { isDemo } from '../backend/config';
import { Link, navigate, Redirect } from '../core/router';
import { useSession } from './session';
import { Field, useAction, useUi } from './ui';

function AuthFrame({ title, sub, children, alt }: { title: string; sub?: string; children: React.ReactNode; alt?: React.ReactNode }) {
  return (
    <div className="auth"><div className="authbox">
      <div className="logo"><img src="/logo.webp" alt="تكنيك" /></div>
      <div className="card"><h1>{title}</h1>{sub ? <p className="muted" style={{ marginBottom: 16 }}>{sub}</p> : null}{children}</div>
      {isDemo() ? <div className="notice warn" style={{ fontSize: 13 }}>وضع تجريبي محلي (بدون Supabase): البيانات محفوظة في متصفحك. حساب المدير: <code>admin@tekniq.demo</code> / <code>admin123</code></div> : null}
      {alt ? <div className="alt">{alt}</div> : null}
    </div></div>
  );
}

const next = () => new URLSearchParams(location.search).get('next') || '/dashboard';

export function Login() {
  const { user, refresh } = useSession(); const { busy, run } = useAction(); const [email, setE] = useState(''); const [pw, setP] = useState('');
  if (user) return <Redirect to={next()} />;
  const submit = async (e: FormEvent) => { e.preventDefault(); const ok = await run(async () => { await api.signIn(email, pw); await refresh(); return true; }); if (ok) navigate(next()); };
  return (
    <AuthFrame title="تسجيل الدخول" sub="أهلاً بعودتك" alt={<>ليس لديك حساب؟ <Link to="/signup">أنشئ حساباً</Link></>}>
      <form onSubmit={submit}>
        <Field label="البريد الإلكتروني"><input type="email" required autoComplete="email" dir="ltr" value={email} onChange={(e) => setE(e.target.value)} /></Field>
        <Field label="كلمة المرور"><input type="password" required autoComplete="current-password" dir="ltr" value={pw} onChange={(e) => setP(e.target.value)} /></Field>
        <button className="btn block" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
        <p style={{ textAlign: 'center', marginTop: 14 }}><Link to="/forgot" className="muted">نسيت كلمة المرور؟</Link></p>
      </form>
    </AuthFrame>
  );
}

export function Signup() {
  const { user, refresh } = useSession(); const { busy, run } = useAction(); const ui = useUi();
  const [f, setF] = useState({ name: '', email: '', phone: '', pw: '' }); const [sent, setSent] = useState(false);
  if (user) return <Redirect to="/dashboard" />;
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => api.signUp(f.email, f.pw, f.name, f.phone));
    if (!r) return;
    if (r.needsConfirm) { setSent(true); ui.toast('تم إنشاء الحساب'); } else { await refresh(); navigate('/dashboard/new'); }
  };
  if (sent) return <AuthFrame title="تحقق من بريدك" sub={`أرسلنا رابط التفعيل إلى ${f.email}. بعد التفعيل سجّل الدخول.`} alt={<Link to="/login">العودة لتسجيل الدخول</Link>}><span /></AuthFrame>;
  return (
    <AuthFrame title="إنشاء حساب" sub="ابدأ متجرك خلال دقائق" alt={<>لديك حساب؟ <Link to="/login">سجّل الدخول</Link></>}>
      <form onSubmit={submit}>
        <Field label="الاسم الكامل"><input required minLength={2} autoComplete="name" value={f.name} onChange={set('name')} /></Field>
        <Field label="البريد الإلكتروني"><input type="email" required autoComplete="email" dir="ltr" value={f.email} onChange={set('email')} /></Field>
        <Field label="رقم الهاتف (اختياري)"><input type="tel" autoComplete="tel" dir="ltr" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="كلمة المرور" hint="8 أحرف على الأقل"><input type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={f.pw} onChange={set('pw')} /></Field>
        <button className="btn block" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button>
      </form>
    </AuthFrame>
  );
}

export function Forgot() {
  const { busy, run } = useAction(); const [email, setE] = useState(''); const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); if ((await run(async () => { await api.recover(email); return true; })) ) setDone(true); };
  return (
    <AuthFrame title="استعادة كلمة المرور" sub="سنرسل لك رابطاً لإعادة التعيين" alt={<Link to="/login">العودة لتسجيل الدخول</Link>}>
      {done ? <div className="notice">إن كان البريد مسجلاً فستصلك رسالة بالرابط خلال دقائق.</div> : (
        <form onSubmit={submit}><Field label="البريد الإلكتروني"><input type="email" required dir="ltr" value={email} onChange={(e) => setE(e.target.value)} /></Field><button className="btn block" disabled={busy}>إرسال الرابط</button></form>)}
    </AuthFrame>
  );
}

export function Reset() {
  const { user } = useSession(); const { busy, run } = useAction(); const [pw, setP] = useState(''); const ui = useUi();
  const submit = async (e: FormEvent) => { e.preventDefault(); if (await run(async () => { await api.updatePassword(pw); return true; })) { ui.toast('تم تغيير كلمة المرور'); navigate('/dashboard'); } };
  if (!user) return <AuthFrame title="الرابط غير صالح" sub="انتهت صلاحية الرابط أو استُخدم مسبقاً." alt={<Link to="/forgot">اطلب رابطاً جديداً</Link>}><span /></AuthFrame>;
  return <AuthFrame title="كلمة مرور جديدة"><form onSubmit={submit}><Field label="كلمة المرور الجديدة" hint="8 أحرف على الأقل"><input type="password" required minLength={8} dir="ltr" value={pw} onChange={(e) => setP(e.target.value)} /></Field><button className="btn block" disabled={busy}>حفظ</button></form></AuthFrame>;
}
