import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Collection, DataAdapter, Menu, Page, PageType, Product, Snapshot } from '../core/types';
import { safeUrl } from '../core/util';
import { useCart } from './cart';

export interface Route { type: PageType; page: Page | null; slug?: string; query: URLSearchParams; }
export interface Ctx {
  snap: Snapshot; adapter: DataAdapter; mode: 'live' | 'preview' | 'editor'; base: string; route: Route;
  go(path: string): void; href(path: string): string; linkFor(m: { linkType: string; linkRef: string }): string;
  menu(handle: string): Menu | undefined; cart: ReturnType<typeof useCart>;
  product: Product | null; collection: Collection | null;
  editor?: { selected: string | null; select(id: string | null): void };
}
export const StoreCtx = createContext<Ctx>(null as any);
export const useStoreCtx = () => useContext(StoreCtx);

export function useAsync<T>(fn: () => Promise<T>, deps: any[]): { data: T | undefined; loading: boolean; error: string | null } {
  const [st, setSt] = useState<{ data: T | undefined; loading: boolean; error: string | null }>({ data: undefined, loading: true, error: null });
  const tick = useRef(0);
  useEffect(() => {
    const my = ++tick.current;
    setSt((s) => ({ ...s, loading: true, error: null }));
    fn().then((d) => { if (my === tick.current) setSt({ data: d, loading: false, error: null }); })
        .catch((e) => { if (my === tick.current) setSt({ data: undefined, loading: false, error: String(e?.message || e) }); });
    return () => { tick.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return st;
}

export const SYSTEM_HREF: Record<string, string> = { home: '/', collection: '/collection/all', cart: '/cart', checkout: '/checkout', search: '/search', blog: '/blog', account: '/account' };

export function resolveLink(snap: Snapshot, m: { linkType: string; linkRef: string }): string {
  if (m.linkType === 'collection') return '/collection/' + m.linkRef;
  if (m.linkType === 'product') return '/product/' + m.linkRef;
  if (m.linkType === 'page') {
    const p = snap.pages.find((x) => x.slug === m.linkRef);
    if (p && p.type !== 'custom') return SYSTEM_HREF[p.type] ?? '/p/' + p.slug;
    return '/p/' + m.linkRef;
  }
  return m.linkRef;
}

export function parsePath(snap: Snapshot, full: string): Route {
  const [pathname, qs = ''] = full.split('?');
  const query = new URLSearchParams(qs);
  const seg = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const byType = (t: PageType) => snap.pages.find((p) => p.type === t && p.enabled) ?? null;
  let type: PageType = 'home'; let slug: string | undefined;
  if (seg.length === 0) type = 'home';
  else if (seg[0] === 'collection') { type = 'collection'; slug = seg[1] || 'all'; }
  else if (seg[0] === 'product' && seg[1]) { type = 'product'; slug = seg[1]; }
  else if (seg[0] === 'cart') type = 'cart';
  else if (seg[0] === 'checkout') type = 'checkout';
  else if (seg[0] === 'search') type = 'search';
  else if (seg[0] === 'blog') { type = seg[1] ? 'article' : 'blog'; slug = seg[1]; }
  else if (seg[0] === 'account') type = 'account';
  else { type = 'custom'; slug = seg[0] === 'p' ? seg[1] : seg[0]; }
  if (type === 'custom') return { type, slug, query, page: snap.pages.find((p) => p.type === 'custom' && p.slug === slug && p.enabled) ?? null };
  return { type, slug, query, page: byType(type) };
}

export const AUTH_SAFE = safeUrl;
