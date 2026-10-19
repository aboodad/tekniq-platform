import { match, Redirect, useLocation, Link } from '../core/router';
import { Forgot, Login, Reset, Signup } from './auth';
import { lazy, Suspense } from 'react';
import { Spinner } from './ui';
const Dashboard = lazy(() => import('./dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Editor = lazy(() => import('../editor/Editor').then((m) => ({ default: m.Editor })));
const Preview = lazy(() => import('../editor/Preview').then((m) => ({ default: m.Preview })));
const Admin = lazy(() => import('../admin/Admin').then((m) => ({ default: m.Admin })));
const Live = lazy(() => import('./Live').then((m) => ({ default: m.Live })));
import { Landing } from './Landing';

export function App() { return <Suspense fallback={<Spinner />}><Routes /></Suspense>; }
function Routes() {
  const loc = useLocation(); const path = loc.split('?')[0];
  let m: Record<string, string> | null;
  if (path === '/') return <Landing />;
  if (path === '/login') return <Login />;
  if (path === '/signup') return <Signup />;
  if (path === '/forgot') return <Forgot />;
  if (path === '/reset') return <Reset />;
  if ((m = match('/s/:slug/*', path)) || (m = match('/s/:slug', path))) return <Live slug={m.slug} base={'/s/' + m.slug} />;
  if ((m = match('/editor/:id', path))) return <Editor storeId={m.id} />;
  if ((m = match('/preview/:id/*', path)) || (m = match('/preview/:id', path))) return <Preview storeId={m.id} />;
  if (path.startsWith('/dashboard')) return <Dashboard path={path} />;
  if (path.startsWith('/admin')) return <Admin path={path} />;
  return <div className="auth"><div className="card" style={{ textAlign: 'center' }}><h2>الصفحة غير موجودة</h2><Link to="/dashboard" className="btn" >لوحة التحكم</Link></div></div>;
}
export { Redirect };
