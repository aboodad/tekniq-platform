import { useEffect, useState, type ReactNode } from 'react';
import { Link, Redirect, useLocation } from '../core/router';
import { useSession } from './session';
import { Spinner, cx } from './ui';
import type { UserRole } from '../core/types';

export interface NavItem { to: string; label: string; icon: string; exact?: boolean }
export interface NavGroup { title?: string; items: NavItem[] }

export function Shell({ nav, children, roles, title }: { nav: NavGroup[]; children: ReactNode; roles?: UserRole[]; title?: string }) {
  const { user, loading, signOut } = useSession(); const loc = useLocation(); const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc]);
  if (loading) return <Spinner label="جارٍ التحميل…" />;
  if (!user) return <Redirect to={'/login?next=' + encodeURIComponent(loc)} />;
  if (roles && !roles.includes(user.role)) return <Redirect to="/dashboard" />;
  const path = loc.split('?')[0];
  return (
    <div className="shell">
      {open ? <div className="sidemask" onClick={() => setOpen(false)} /> : null}
      <aside className={cx('side', open && 'open')}>
        <Link to="/dashboard" className="brand"><img src="/mark.webp" alt="" /><span>{title || 'تكنيك'}</span></Link>
        {nav.map((g, i) => (
          <div key={i}>{g.title ? <div className="sec">{g.title}</div> : null}
            {g.items.map((n) => <Link key={n.to} to={n.to} className={cx('nav', (n.exact ? path === n.to : path === n.to || path.startsWith(n.to + '/')) && 'on')}><span aria-hidden>{n.icon}</span>{n.label}</Link>)}</div>))}
        <div className="foot">
          <div><b>{user.full_name || user.email}</b><div className="muted ltr" style={{ fontSize: 12 }}>{user.email}</div></div>
          {user.role !== 'merchant' ? <Link to="/admin" className="btn ghost sm">لوحة الشركة</Link> : null}
          <Link to="/dashboard/account" className="btn ghost sm">حسابي</Link>
          <button className="btn ghost sm" onClick={signOut}>تسجيل الخروج</button>
        </div>
      </aside>
      <div>
        <div className="topbar"><button className="icon" aria-label="القائمة" onClick={() => setOpen(true)}>☰</button><b>{title || 'تكنيك'}</b></div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
