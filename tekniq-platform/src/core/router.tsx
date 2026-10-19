import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const listeners = new Set<() => void>();
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === location.pathname + location.search) return;
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', to);
  listeners.forEach((f) => f());
  window.scrollTo?.(0, 0);
}
addEventListener('popstate', () => listeners.forEach((f) => f()));

const Ctx = createContext('');
export function useLocation(): string { return useContext(Ctx); }
export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(location.pathname + location.search);
  useEffect(() => { const f = () => setLoc(location.pathname + location.search); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return <Ctx.Provider value={loc}>{children}</Ctx.Provider>;
}
export function useNav() { return useCallback((to: string, replace = false) => navigate(to, { replace }), []); }

export function Link({ to, children, className, style, onClick, title }: { to: string; children: ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void; title?: string }) {
  return <a href={to} className={className} style={style} title={title} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); onClick?.(); navigate(to); }}>{children}</a>;
}
export function Redirect({ to }: { to: string }) { useEffect(() => navigate(to, { replace: true }), [to]); return null; }

/** Match "/a/:id/b" against a path. Returns params or null. A trailing "*" matches the rest. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean); const sp = path.split('?')[0].split('/').filter(Boolean);
  const out: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i] === '*') { out['*'] = sp.slice(i).join('/'); return out; }
    if (i >= sp.length) return null;
    if (pp[i].startsWith(':')) out[pp[i].slice(1)] = decodeURIComponent(sp[i]); else if (pp[i] !== sp[i]) return null;
  }
  return pp.length === sp.length ? out : null;
}
