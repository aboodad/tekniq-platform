export const uid = (): string =>
  typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function money(n: number, currency = 'USD', locale = 'ar'): string {
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : locale, {
      style: 'currency', currency, maximumFractionDigits: n % 1 ? 2 : 0,
    }).format(n);
  } catch { return `${n} ${currency}`; }
}

export function fmtDate(s?: string | null): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return s; }
}

export function debounce<F extends (...a: any[]) => void>(fn: F, ms: number): F & { cancel(): void; flush(): void } {
  let t: any, last: any[] | null = null;
  const d: any = (...a: any[]) => { last = a; clearTimeout(t); t = setTimeout(() => { last = null; fn(...a); }, ms); };
  d.cancel = () => { clearTimeout(t); last = null; };
  d.flush = () => { if (last) { clearTimeout(t); const a = last; last = null; fn(...a); } };
  return d;
}

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export function arrMove<T>(a: T[], from: number, to: number): T[] {
  const b = a.slice(); const [x] = b.splice(from, 1); b.splice(Math.max(0, Math.min(b.length, to)), 0, x); return b;
}

// Only allow safe URL schemes in user-provided links/images.
export function safeUrl(u?: string | null): string {
  if (!u) return '';
  const s = String(u).trim();
  if (/^(https?:|mailto:|tel:|\/|#|data:image\/(png|jpe?g|webp|gif|avif);base64,)/i.test(s)) return s;
  return '';
}
