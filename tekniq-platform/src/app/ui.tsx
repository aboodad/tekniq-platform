import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { errText } from './errors';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

// ---------- toast + confirm ----------
interface T { id: number; kind: 'ok' | 'err'; text: string }
const ToastCtx = createContext<{ toast(t: string, kind?: 'ok' | 'err'): void; error(e: unknown): void; confirm(msg: string, opt?: { danger?: boolean; ok?: string }): Promise<boolean> }>(null as any);
export const useUi = () => useContext(ToastCtx);
export function UiProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([]); const [cf, setCf] = useState<{ msg: string; danger?: boolean; ok?: string; res(v: boolean): void } | null>(null);
  const toast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => { const id = Math.random(); setList((l) => [...l, { id, kind, text }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4200); }, []);
  const error = useCallback((e: unknown) => toast(errText(e), 'err'), [toast]);
  const confirm = useCallback((msg: string, opt: { danger?: boolean; ok?: string } = {}) => new Promise<boolean>((res) => setCf({ msg, ...opt, res })), []);
  return (
    <ToastCtx.Provider value={{ toast, error, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{list.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}</div>
      {cf ? <Modal title="تأكيد" onClose={() => { cf.res(false); setCf(null); }} footer={<><button className="btn ghost" onClick={() => { cf.res(false); setCf(null); }}>إلغاء</button><button className={'btn ' + (cf.danger ? 'danger' : '')} autoFocus onClick={() => { cf.res(true); setCf(null); }}>{cf.ok || 'تأكيد'}</button></>}><p>{cf.msg}</p></Modal> : null}
    </ToastCtx.Provider>
  );
}

export function Modal({ title, children, footer, onClose, wide }: { title: string; children: ReactNode; footer?: ReactNode; onClose(): void; wide?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button className="icon" aria-label="إغلاق" onClick={onClose}>✕</button></header>
        <div className="body">{children}</div>{footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}{error ? <small className="err">{error}</small> : null}</label>;
}
export const Spinner = ({ label }: { label?: string }) => <div className="spin-wrap"><div className="spin" />{label ? <span>{label}</span> : null}</div>;
export const Badge = ({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'violet'; children: ReactNode }) => <span className={'badge ' + tone}>{children}</span>;
export const Empty = ({ title, text, action }: { title: string; text?: string; action?: ReactNode }) => <div className="empty"><h3>{title}</h3>{text ? <p>{text}</p> : null}{action}</div>;
export const PageHead = ({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) => <div className="pagehead"><div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div><div className="acts">{actions}</div></div>;

/** Loads data with loading/error state and a reload() */
export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []): { data: T | null; loading: boolean; error: string | null; reload(): void; set(v: T): void } {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [n, setN] = useState(0); const my = useRef(0);
  useEffect(() => { const id = ++my.current; setLoading(true); setError(null); fn().then((d) => id === my.current && (setData(d), setLoading(false))).catch((e) => id === my.current && (setError(errText(e)), setLoading(false))); return () => { my.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, loading, error, reload: () => setN((x) => x + 1), set: setData };
}
export function Async<T>({ s, children }: { s: ReturnType<typeof useLoad<T>>; children: (d: T) => ReactNode }) {
  if (s.loading && !s.data) return <Spinner />;
  if (s.error) return <div className="notice err">{s.error} <button className="btn sm ghost" onClick={s.reload}>إعادة المحاولة</button></div>;
  return <>{s.data !== null ? children(s.data) : null}</>;
}

export function useAction() {
  const ui = useUi(); const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) ui.toast(okMsg); return r; } catch (e) { ui.error(e); return undefined; } finally { setBusy(false); }
  }, [ui]);
  return { busy, run };
}
