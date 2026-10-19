import { match, Link, navigate, Redirect } from '../../core/router';
import { Shell, type NavGroup } from '../shell';
import { Home, NewStore } from './Home';
import { StoreView } from './StoreView';
import { Support, Account } from './Misc';

const NAV: NavGroup[] = [
  { items: [{ to: '/dashboard', label: 'متاجري', icon: '🏬', exact: true }, { to: '/dashboard/new', label: 'متجر جديد', icon: '＋' }] },
  { title: 'المساعدة', items: [{ to: '/dashboard/support', label: 'الدعم الفني', icon: '🎧' }, { to: '/dashboard/account', label: 'حسابي', icon: '👤' }] },
];

export function Dashboard({ path }: { path: string }) {
  let m: Record<string, string> | null; let body;
  if (path === '/dashboard') body = <Home />;
  else if (path === '/dashboard/new') body = <NewStore />;
  else if (path === '/dashboard/support') body = <Support />;
  else if (path === '/dashboard/account') body = <Account />;
  else if ((m = match('/dashboard/stores/:id/*', path)) || (m = match('/dashboard/stores/:id', path))) body = <StoreView id={m.id} tab={(m['*'] || 'overview').split('/')[0]} />;
  else body = <Redirect to="/dashboard" />;
  return <Shell nav={NAV}>{body}</Shell>;
}
export { Link, navigate };
