import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../backend';
import { cfg } from '../backend/config';
import { def } from '../core/registry';
import type { Draft, Snapshot, StoreInfo } from '../core/types';
import { debounce } from '../core/util';
import { Link, navigate } from '../core/router';
import { Storefront } from '../render/Storefront';
import { mockAdapter } from '../render/adapters/mock';
import { parsePath, SYSTEM_HREF } from '../render/ctx';
import { useSession } from '../app/session';
import { Modal, Spinner, Field, useAction, useUi } from '../app/ui';
import { errText } from '../app/errors';
import { SettingsForm } from './Inspector';
import { CardsPanel, Layers, MenusPanel, PagesPanel, sectionActions, ThemePanel } from './Panels';
import { currentPage, es, findSection, initial, mutate, redo, undo, useE, type Device } from './state';
import './editor.css';

const TABS: [string, string, string][] = [['layers', '☰', 'الأقسام'], ['theme', '🎨', 'التصميم'], ['cards', '🃏', 'البطاقات'], ['pages', '📄', 'الصفحات'], ['menus', '🔗', 'القوائم']];
const WIDTH: Record<Device, number | string> = { desktop: '100%', tablet: 820, mobile: 390 };

export function toSnapshot(d: Draft, st: { id: string; name: string; slug: string; default_locale: string; direction: 'rtl' | 'ltr'; currency: string; logo_url?: string | null; favicon_url?: string | null }): Snapshot {
  const store: StoreInfo = { id: st.id, name: st.name, slug: st.slug, locale: st.default_locale, direction: st.direction, currency: st.currency, dataMode: 'mock', logoUrl: st.logo_url, faviconUrl: st.favicon_url };
  return { ...d, version: 0, store };
}

export function Editor({ storeId }: { storeId: string }) {
  const { user, loading } = useSession(); const ui = useUi();
  const [store, setStore] = useState<any>(null); const [fail, setFail] = useState<string | null>(null);
  const [tab, setTab] = useState('layers'); const [pub, setPub] = useState(false); const [mobilePanel, setMobilePanel] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    if (loading) return; if (!user) { navigate('/login?next=' + encodeURIComponent(location.pathname), true); return; }
    es.replace(initial()); let live = true;
    Promise.all([api.getStore(storeId), api.getDraft(storeId)]).then(([s, d]) => {
      if (!live) return; setStore(s);
      es.set({ draft: d.draft, rev: d.rev, pageId: d.draft.pages.find((p) => p.type === 'home')?.id ?? d.draft.pages[0]?.id ?? null });
    }).catch((e) => live && setFail(errText(e)));
    return () => { live = false; };
  }, [storeId, user, loading]);

  const canEdit = store && store.myRole !== 'viewer';
  const saveNow = useCallback(async (): Promise<boolean> => {
    const s = es.get(); if (!s.draft || !s.dirty || s.conflict) return !s.conflict; if (s.saving) return false;
    es.set({ saving: true, error: null }); const snap = s.draft;
    try {
      const rev = await api.saveDraft(storeId, snap, s.rev);
      es.set({ rev, saving: false, lastSaved: Date.now(), dirty: es.get().draft !== snap }); return true;
    } catch (e) {
      const m = String((e as any)?.message); es.set({ saving: false, conflict: m === 'draft_conflict', error: errText(e) }); return false;
    }
  }, [storeId]);
  const auto = useMemo(() => debounce(() => { void saveNow(); }, 1500), [saveNow]);
  const dirty = useE((s) => s.dirty); const draft = useE((s) => s.draft);
  useEffect(() => { if (dirty && canEdit) auto(); }, [draft, dirty, canEdit, auto]);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (es.get().dirty) { e.preventDefault(); e.returnValue = ''; } }; addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const m = e.metaKey || e.ctrlKey; const tag = (e.target as HTMLElement)?.tagName;
      if (m && e.key.toLowerCase() === 's') { e.preventDefault(); auto.cancel(); void saveNow(); }
      else if (m && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [saveNow, auto]);

  if (fail) return <div className="auth"><div className="card" style={{ textAlign: 'center' }}><h2>تعذّر فتح المحرر</h2><p className="muted" style={{ margin: '10px 0' }}>{fail}</p><Link to="/dashboard" className="btn">العودة</Link></div></div>;
  if (!store || !draft) return <Spinner label="جارٍ تحميل المحرر…" />;
  return (
    <div className="ed">
      <TopBar store={store} canEdit={!!canEdit} onPublish={async () => { auto.cancel(); if (await saveNow() || !es.get().dirty) setPub(true); else ui.toast(es.get().error || 'تعذّر الحفظ', 'err'); }} onSave={() => { auto.cancel(); void saveNow(); }} onLeft={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')} onRight={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')} />
      <ConflictBanner />
      <div className="ed-body">
        <aside className={'ed-left ' + (mobilePanel === 'left' ? 'open' : '')}>
          <nav className="ed-tabs">{TABS.map(([k, ic, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{ic}</span>{l}</button>)}</nav>
          <div className={'ed-scroll ' + (canEdit ? '' : 'ro')}>{tab === 'layers' ? <Layers storeId={storeId} /> : tab === 'theme' ? <ThemePanel storeId={storeId} /> : tab === 'cards' ? <CardsPanel storeId={storeId} /> : tab === 'pages' ? <PagesPanel storeId={storeId} /> : <MenusPanel storeId={storeId} />}</div>
        </aside>
        <Canvas store={store} />
        <aside className={'ed-right ' + (mobilePanel === 'right' ? 'open' : '')}><div className={'ed-scroll ' + (canEdit ? '' : 'ro')}><Inspector storeId={storeId} /></div></aside>
      </div>
      {pub ? <PublishDialog store={store} onClose={() => setPub(false)} /> : null}
    </div>
  );
}

function TopBar({ store, canEdit, onPublish, onSave, onLeft, onRight }: { store: any; canEdit: boolean; onPublish(): void; onSave(): void; onLeft(): void; onRight(): void }) {
  const draft = useE((s) => s.draft)!; const pageId = useE((s) => s.pageId); const device = useE((s) => s.device); const past = useE((s) => s.past.length); const fut = useE((s) => s.future.length);
  const saving = useE((s) => s.saving); const dirty = useE((s) => s.dirty); const err = useE((s) => s.error); const saved = useE((s) => s.lastSaved);
  return (
    <header className="ed-top">
      <button className="icon mob" aria-label="الأقسام" onClick={onLeft}>☰</button>
      <Link to={'/dashboard/stores/' + store.id} className="icon" title="رجوع">→</Link>
      <b className="ed-name">{store.name}</b>
      <select className="ed-page" value={currentPage(draft, pageId)?.id} onChange={(e) => es.set({ pageId: e.target.value, selected: null, selectedBlock: null })}>{draft.pages.map((p) => <option key={p.id} value={p.id}>{p.title}{p.enabled ? '' : ' (مخفية)'}</option>)}</select>
      <div className="ed-dev">{([['desktop', '🖥'], ['tablet', '▭'], ['mobile', '📱']] as [Device, string][]).map(([k, i]) => <button key={k} className={'icon ' + (device === k ? 'on' : '')} aria-label={k} onClick={() => es.set({ device: k })}>{i}</button>)}</div>
      <span className="grow" />
      <button className="icon" title="تراجع (Ctrl+Z)" disabled={!past} onClick={undo}>↶</button><button className="icon" title="إعادة" disabled={!fut} onClick={redo}>↷</button>
      <span className={'ed-status ' + (err ? 'bad' : '')}>{err ? 'خطأ في الحفظ' : saving ? 'جارٍ الحفظ…' : dirty ? 'غير محفوظ' : saved ? 'تم الحفظ ✓' : ''}</span>
      <Link to={'/preview/' + store.id} className="btn ghost sm hide-sm">معاينة</Link>
      {canEdit ? <><button className="btn ghost sm hide-sm" onClick={onSave} disabled={!dirty || saving}>حفظ</button><button className="btn sm" onClick={onPublish}>نشر</button></> : <span className="badge amber">للقراءة فقط</span>}
      <button className="icon mob" aria-label="الخصائص" onClick={onRight}>⚙</button>
    </header>
  );
}

function ConflictBanner() {
  const c = useE((s) => s.conflict); if (!c) return null;
  return <div className="notice err" style={{ margin: 8 }}>تم تعديل هذا المتجر من مكان آخر، لذلك أُوقف الحفظ التلقائي لحماية عملك. <button className="btn sm" onClick={() => location.reload()}>إعادة التحميل</button></div>;
}

function Canvas({ store }: { store: any }) {
  const draft = useE((s) => s.draft)!; const pageId = useE((s) => s.pageId); const device = useE((s) => s.device); const selected = useE((s) => s.selected);
  const snap = useMemo(() => toSnapshot(draft, store), [draft, store]); const adapter = useMemo(() => mockAdapter(store.currency), [store.currency]);
  const page = currentPage(draft, pageId)!;
  const path = page.type === 'custom' ? '/p/' + page.slug : page.type === 'product' ? '/product/__first' : page.type === 'article' ? '/blog/x' : SYSTEM_HREF[page.type] || '/';
  const editor = useMemo(() => ({ selected, select: (id: string | null) => es.set({ selected: id, selectedBlock: null }) }), [selected]);
  const go = useCallback((p: string) => { const r = parsePath(snap, p); if (r.page) es.set({ pageId: r.page.id, selected: null }); }, [snap]);
  return (
    <div className="ed-canvas" onClick={() => editor.select(null)}>
      <div className={'ed-frame ' + device} style={{ width: WIDTH[device] }}><Storefront snap={snap} adapter={adapter} mode="editor" path={path} onNavigate={go} editor={editor} /></div>
    </div>
  );
}

function Inspector({ storeId }: { storeId: string }) {
  const draft = useE((s) => s.draft)!; const selId = useE((s) => s.selected); const blkId = useE((s) => s.selectedBlock);
  const s = findSection(draft, selId);
  if (!s) return <div className="panel-body"><div className="empty"><h3>اختر عنصراً</h3><p>اضغط على أي قسم في المعاينة أو من قائمة الأقسام لتعديل خصائصه.</p></div></div>;
  const d = def(s.type); const act = sectionActions(s.id); const blk = s.blocks.find((b) => b.id === blkId) || null; const bd = blk ? def(blk.type) : null;
  const setS = (k: string, v: any) => mutate((x) => { const t = findSection(x, s.id)!; t.settings[k] = v; }, s.id + k);
  const setB = (k: string, v: any) => mutate((x) => { findSection(x, s.id)!.blocks.find((b) => b.id === blk!.id)!.settings[k] = v; }, blk!.id + k);
  return (
    <div className="panel-body">
      <div className="row sp" style={{ marginBottom: 8 }}><b>{d?.icon} {d?.name || s.type}</b>
        {d?.region === 'content' ? <div className="row" style={{ gap: 2 }}><button className="icon" title="تكرار" disabled={d.singleton} onClick={act.duplicate}>⧉</button><button className="icon" title="حذف" disabled={d.system && d.singleton} onClick={act.remove}>🗑</button></div> : null}</div>
      {blk && bd ? <>
        <button className="btn sm ghost" onClick={() => es.set({ selectedBlock: null })}>← رجوع للقسم</button>
        <div className="insp-group">{bd.name}</div>
        <SettingsForm typeKey={blk.type} settings={blk.settings} onChange={setB} storeId={storeId} draft={draft} />
      </> : <>
        <SettingsForm typeKey={s.type} settings={s.settings} onChange={setS} storeId={storeId} draft={draft} />
        {d?.blocks ? <>
          <div className="insp-group">{d.blocks.label}</div>
          {s.blocks.map((b, i) => <div key={b.id} className="lyr" onClick={() => es.set({ selectedBlock: b.id })}><span className="grow">{def(b.type)?.icon} {def(b.type)?.name} <small className="muted">{String(b.settings.title || b.settings.text || b.settings.label || b.settings.name || '').slice(0, 18)}</small></span>
            <button className="icon" disabled={i === 0} onClick={(e) => { e.stopPropagation(); act.moveBlock(b.id, -1); }}>↑</button><button className="icon" disabled={i === s.blocks.length - 1} onClick={(e) => { e.stopPropagation(); act.moveBlock(b.id, 1); }}>↓</button>
            <button className="icon" onClick={(e) => { e.stopPropagation(); act.toggleBlock(b.id); }}>{b.visible ? '👁' : '⊘'}</button><button className="icon" onClick={(e) => { e.stopPropagation(); act.removeBlock(b.id); }}>✕</button></div>)}
          {(!d.blocks.max || s.blocks.length < d.blocks.max) ? <div className="row" style={{ marginTop: 8 }}>{d.blocks.allowed.map((t) => <button key={t} className="btn sm ghost" onClick={() => act.addBlock(t)}>＋ {def(t)?.name}</button>)}</div> : null}
        </> : null}
      </>}
    </div>
  );
}

function PublishDialog({ store, onClose }: { store: any; onClose(): void }) {
  const { busy, run } = useAction(); const [note, setNote] = useState(''); const [done, setDone] = useState<number | null>(null);
  const url = `${location.origin}/s/${store.slug}`;
  return (
    <Modal title="نشر المتجر" onClose={onClose} footer={done === null ? <><button className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy} onClick={async () => { const r = await run(() => api.publish(store.id, note)); if (r) setDone(r.versionNo); }}>{busy ? 'جارٍ النشر…' : 'نشر الآن'}</button></> : <button className="btn" onClick={onClose}>إغلاق</button>}>
      {done === null ? <>
        <p className="muted" style={{ marginBottom: 12 }}>سيصبح التصميم الحالي هو النسخة التي يراها الزوار. يمكنك الرجوع لأي نسخة سابقة لاحقاً.</p>
        <Field label="ملاحظة (اختياري)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: تحديث الغلاف" /></Field></>
        : <div className="stack"><div className="notice">تم نشر النسخة رقم {done} بنجاح 🎉</div><div className="row"><a className="btn sm" href={url} target="_blank" rel="noreferrer">فتح المتجر</a><code>{url}</code></div>
          <p className="muted" style={{ fontSize: 13 }}>النطاق: {store.slug}.{cfg().ROOT_DOMAIN}</p></div>}
    </Modal>
  );
}
