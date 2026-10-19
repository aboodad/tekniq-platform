import { Link } from '../core/router';
import { useSession } from './session';

export function Landing() {
  const { user } = useSession();
  return (
    <div className="auth"><div className="authbox" style={{ width: 'min(560px,100%)', textAlign: 'center' }}>
      <div className="logo"><img src="/logo.webp" alt="تكنيك" /></div>
      <div className="card" style={{ padding: 32 }}>
        <h1 style={{ fontSize: 30 }}>أنشئ متجرك الإلكتروني بالكامل بصرياً</h1>
        <p className="muted" style={{ margin: '12px 0 22px' }}>اختر قالباً، عدّل الألوان والصفحات وشكل البطاقات، وانشر متجرك خلال دقائق.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {user ? <Link to="/dashboard" className="btn">لوحة التحكم</Link> : <><Link to="/signup" className="btn">ابدأ مجاناً</Link><Link to="/login" className="btn ghost">تسجيل الدخول</Link></>}
        </div>
      </div>
    </div></div>
  );
}
