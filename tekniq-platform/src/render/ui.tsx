import type { ReactNode } from 'react';
import { money, safeUrl } from '../core/util';
import { useStoreCtx } from './ctx';

const P: Record<string, string> = {
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  refresh: 'M4 12a8 8 0 0114-5l2-2v6h-6l2.2-2.2A5.5 5.5 0 006.5 12M20 12a8 8 0 01-14 5l-2 2v-6h6l-2.2 2.2A5.5 5.5 0 0017.5 12',
  headset: 'M4 14v-2a8 8 0 0116 0v2M4 14h3v5H5a1 1 0 01-1-1zM20 14h-3v5h2a1 1 0 001-1zM18 19c0 1.5-2 2-5 2',
  gift: 'M4 11h16v9H4zM3 8h18v3H3zM12 8v12M12 8S9 8 8.5 6 10 4 12 8zM12 8s3 0 3.5-2S14 4 12 8z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  heart: 'M12 20s-7-4.6-9-9.2C1.8 7.6 4 5 6.8 5c1.8 0 3.2 1 5.2 3 2-2 3.4-3 5.2-3 2.8 0 5 2.6 3.8 5.8C19 15.4 12 20 12 20z',
  search: 'M11 4a7 7 0 105 12l4 4M11 4', cart: 'M3 4h2l2.4 11h10.2L20 7H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z',
  menu: 'M4 7h16M4 12h16M4 17h16', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
};
export function Icon({ n, size = 22 }: { n: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n] || P.star} /></svg>;
}

export function A({ to, children, className, newTab, style }: { to: string; children: ReactNode; className?: string; newTab?: boolean; style?: React.CSSProperties }) {
  const c = useStoreCtx();
  const ext = /^(https?:|mailto:|tel:)/i.test(to);
  if (ext) { const u = safeUrl(to); return <a className={className} style={style} href={u || undefined} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}>{children}</a>; }
  const path = to || '/';
  return <a className={className} style={style} href={c.href(path)} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); c.go(path); }}>{children}</a>;
}

export function Img({ src, alt = '', ph }: { src?: string; alt?: string; ph?: boolean }) {
  const u = safeUrl(src);
  return u ? <img className="sf-img" src={u} alt={alt} loading="lazy" decoding="async" /> : ph === false ? null : <div className="sf-ph" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />;
}
export const Stars = ({ v }: { v: number }) => <span className="sf-stars" aria-label={`${v.toFixed(1)} / 5`}>{'★'.repeat(Math.round(v))}<i>{'★'.repeat(5 - Math.round(v))}</i></span>;
export function Price({ price, compareAt }: { price: number; compareAt?: number | null }) {
  const c = useStoreCtx().snap.store;
  return <span className="sf-price"><span>{money(price, c.currency, c.locale)}</span>{compareAt && compareAt > price ? <s>{money(compareAt, c.currency, c.locale)}</s> : null}</span>;
}
export const Skeleton = ({ n = 4, cols = 4 }: { n?: number; cols?: number }) => (
  <div className="sf-grid" style={{ ['--cols' as any]: cols }}>{Array.from({ length: n }, (_, i) => <div key={i} className="sf-skel" style={{ minHeight: 220 }} />)}</div>
);
export const Title = ({ children, more }: { children?: ReactNode; more?: ReactNode }) => (children || more ? <div className="sf-head"><h2 className="sf-title">{children}</h2>{more}</div> : null);
