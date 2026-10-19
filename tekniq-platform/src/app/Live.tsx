import { useEffect, useMemo, useState } from 'react';
import { api } from '../backend';
import { Storefront } from '../render/Storefront';
import { makeAdapter } from '../render/adapters';
import type { Snapshot } from '../core/types';
import { Spinner } from './ui';

/** A published storefront. Served from a store hostname (host) or from /s/<slug> on the platform domain (slug). */
export function Live({ host, slug, base = '' }: { host?: string; slug?: string; base?: string }) {
  const [snap, setSnap] = useState<Snapshot | null | undefined>(undefined);
  const [path, setPath] = useState(() => strip(location.pathname + location.search, base));
  useEffect(() => { api.getPublished({ host, slug }).then(setSnap).catch(() => setSnap(null)); }, [host, slug]);
  useEffect(() => { const f = () => setPath(strip(location.pathname + location.search, base)); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, [base]);
  const adapter = useMemo(() => (snap ? makeAdapter(snap.store) : null), [snap]);
  if (snap === undefined) return <Spinner />;
  if (!snap || !adapter) return <div className="auth"><div className="card" style={{ textAlign: 'center' }}><h2>المتجر غير متاح</h2><p className="muted">لم يُنشر هذا المتجر بعد أو الرابط غير صحيح.</p></div></div>;
  return <Storefront snap={snap} adapter={adapter} mode="live" seo base={base} path={path} onNavigate={(p) => { history.pushState(null, '', base + p); setPath(p); }} />;
}
const strip = (p: string, base: string) => (base && p.startsWith(base) ? p.slice(base.length) || '/' : p);
