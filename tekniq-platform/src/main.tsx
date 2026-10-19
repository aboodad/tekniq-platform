import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { cfg } from './backend/config';
import { Router } from './core/router';
import { App } from './app/App';
import { lazy, Suspense } from 'react';
const Live = lazy(() => import('./app/Live').then((m) => ({ default: m.Live })));
import { SessionProvider } from './app/session';
import { UiProvider } from './app/ui';

/** Is this hostname a store (<slug>.ROOT_DOMAIN or a custom domain) rather than the platform app? */
function storeHost(): string | null {
  const h = location.hostname.toLowerCase(); const c = cfg();
  if (c.PLATFORM_HOSTS.map((x) => x.toLowerCase()).includes(h)) return null;
  if (h === c.ROOT_DOMAIN || h === 'www.' + c.ROOT_DOMAIN) return null;
  if (/\.(vercel\.app|netlify\.app|pages\.dev)$/.test(h) && !h.endsWith('.' + c.ROOT_DOMAIN)) return null;
  return h;
}

const host = storeHost();
createRoot(document.getElementById('root')!).render(
  host ? <Suspense fallback={null}><Live host={host} /></Suspense> : (
    <Router><UiProvider><SessionProvider><App /></SessionProvider></UiProvider></Router>
  ),
);
