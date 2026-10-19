import { useState } from 'react';
import { CATEGORY_LABELS, def, newBlock, newSection, PAGE_TYPE_LABELS, sectionsAddable } from '../core/registry';
import { DEFAULT_CARD, FONT_CHOICES, THEME_PRESETS } from '../core/templates';
import type { CardKind, CardSettings, Menu, MenuItem, Page, Section, ThemeTokens } from '../core/types';
import { arrMove, slugify, uid } from '../core/util';
import { Modal } from '../app/ui';
import { FieldInput } from './Inspector';
import { currentPage, es, listOf, mutate, useE } from './state';

const Eye = ({ on }: { on: boolean }) => <span aria-hidden>{on ? '👁' : '⊘'}</span>;

// ---------------- Layers ----------------
export function Layers({ storeId }: { storeId: string }) {
  const draft = useE((s) => s.draft)!; const pageId = useE((s) => s.pageId); const sel = useE((s) => s.selected); const [add, setAdd] = useState(false);
  const page = currentPage(draft, pageId)!; const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null);
  const pick = (id: string) => es.set({ selected: id, selectedBlock: null });
  const move = (id: string, to: number) => mutate((d) => { const l = listOf(d, id)!; const i = l.findIndex((s) => s.id === id); const n = arrMove(l, i, to); l.splice(0, l.length, ...n); });
  const drop = (targetId: string) => { if (!drag || drag === targetId) return; const l = page.sections; const to = l.findIndex((s) => s.id === targetId); if (l.some((s) => s.id === drag)) move(drag, to); setDrag(null); setOver(null); };
  const row = (s: Section, list: Section[], dnd: boolean) => {
    const d = def(s.type); const i = list.findIndex((x) => x.id === s.id);
    return (
      <div key={s.id} className={'lyr ' + (sel === s.id ? 'on ' : '') + (over === s.id ? 'over' : '')} draggable={dnd} onDragStart={() => setDrag(s.id)} onDragOver={(e) => { if (dnd) { e.preventDefault(); setOver(s.id); } }} onDrop={() => dnd && drop(s.id)} onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => pick(s.id)}>
        <span className="grip">{dnd ? '⋮⋮' : ''}</span><span className="grow">{d?.icon} {d?.name || s.type}</span>
        {dnd ? <><button className="icon" title="أعلى" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(s.id, i - 1); }}>↑</button><button className="icon" title="أسفل" disabled={i === list.length - 1} onClick={(e) => { e.stopPropagation(); move(s.id, i + 1); }}>↓</button></> : null}
        <button className="icon" title="إظهار/إخفاء" onClick={(e) => { e.stopPropagation(); mutate((x) => { const t = listOf(x, s.id)!.find((q) => q.id === s.id)!; t.visible = !t.visible; }); }}><Eye on={s.visible} /></button>
      </div>);
  };
  return (
    <div className="panel-body">
      <div className="insp-group">الترويسة</div>
      {draft.layout.announcement.map((s) => row(s, draft.layout.announcement, false))}{draft.layout.header.map((s) => row(s, draft.layout.header, false))}
      <div className="insp-group">محتوى الصفحة: {page.title}</div>
      {page.sections.length === 0 ? <p className="muted" style={{ padding: '6px 4px' }}>الصفحة فارغة. أضف قسماً.</p> : null}
      {page.sections.map((s) => row(s, page.sections, true))}
      <button className="btn block" style={{ marginTop: 10 }} onClick={() => setAdd(true)}>＋ إضافة قسم</button>
      <div className="insp-group">التذييل</div>
      {draft.layout.footer.map((s) => row(s, draft.layout.footer, false))}
      {add ? <AddSection page={page} onClose={() => setAdd(false)} /> : null}
      <span hidden>{storeId}</span>
    </div>
  );
}

function AddSection({ page, onClose }: { page: Page; onClose(): void }) {
  const list = sectionsAddable(page.type); const cats = [...new Set(list.map((d) => d.category))];
  const have = new Set(page.sections.map((s) => s.type));
  const add = (type: string) => { const s = newSection(type); mutate((d) => { const p = d.pages.find((x) => x.id === page.id)!; p.sections.push(s); }); es.set({ selected: s.id, selectedBlock: null }); onClose(); setTimeout(() => document.getElementById('s-' + s.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); };
  return (
    <Modal title="إضافة قسم" wide onClose={onClose}>
      {cats.map((c) => <div key={c}><div className="insp-group">{CATEGORY_LABELS[c] || c}</div><div className="grid g3">{list.filter((d) => d.category === c).map((d) => {
        const dis = !!d.singleton && have.has(d.key);
        return <button key={d.key} disabled={dis} className="tpl" style={{ padding: 12, gap: 4, opacity: dis ? .45 : 1 }} onClick={() => add(d.key)}><span style={{ fontSize: 22 }}>{d.icon}</span><b>{d.name}</b>{dis ? <small>موجود مسبقاً</small> : null}</button>; })}</div></div>)}
    </Modal>
  );
}

// ---------------- Section / block inspector header actions ----------------
export function sectionActions(id: string) {
  return {
    duplicate: () => { let nid = ''; mutate((d) => { const l = listOf(d, id)!; const i = l.findIndex((s) => s.id === id); const c = JSON.parse(JSON.stringify(l[i])) as Section; c.id = nid = uid(); c.blocks.forEach((b) => (b.id = uid())); l.splice(i + 1, 0, c); }); es.set({ selected: nid }); },
    remove: () => { mutate((d) => { const l = listOf(d, id)!; l.splice(l.findIndex((s) => s.id === id), 1); }); es.set({ selected: null, selectedBlock: null }); },
    addBlock: (type: string) => { const b = newBlock(type); mutate((d) => { listOf(d, id)!.find((s) => s.id === id)!.blocks.push(b); }); es.set({ selectedBlock: b.id }); },
    removeBlock: (bid: string) => { mutate((d) => { const s = listOf(d, id)!.find((x) => x.id === id)!; s.blocks = s.blocks.filter((b) => b.id !== bid); }); es.set({ selectedBlock: null }); },
    moveBlock: (bid: string, dir: -1 | 1) => mutate((d) => { const s = listOf(d, id)!.find((x) => x.id === id)!; const i = s.blocks.findIndex((b) => b.id === bid); const j = i + dir; if (j < 0 || j >= s.blocks.length) return; s.blocks = arrMove(s.blocks, i, j); }),
    toggleBlock: (bid: string) => mutate((d) => { const b = listOf(d, id)!.find((x) => x.id === id)!.blocks.find((x) => x.id === bid)!; b.visible = !b.visible; }),
  };
}

// ---------------- Theme ----------------
const COLOR_LABELS: [keyof ThemeTokens['colors'], string][] = [['primary', 'اللون الأساسي'], ['primaryText', 'نص الأساسي'], ['accent', 'لون مميز'], ['bg', 'الخلفية'], ['surface', 'السطح'], ['text', 'النص'], ['muted', 'نص ثانوي'], ['border', 'الحدود'], ['sale', 'التخفيض']];
export function ThemePanel({ storeId }: { storeId: string }) {
  const draft = useE((s) => s.draft)!; const th = draft.theme;
  const set = (fn: (t: ThemeTokens) => void, key: string) => mutate((d) => fn(d.theme), key);
  const sel = (label: string, key: 'density' | 'buttonStyle' | 'buttonShape', opts: [string, string][]) => <FieldInput storeId={storeId} draft={draft} f={{ key, label, type: 'select', options: opts.map(([value, label]) => ({ value, label })) }} value={th[key]} onChange={(v) => set((t) => ((t as any)[key] = v), key)} />;
  return (
    <div className="panel-body">
      <div className="insp-group">أنماط جاهزة</div>
      <div className="presets">{THEME_PRESETS.map((p) => <button key={p.name} className="preset" title={p.name} onClick={() => mutate((d) => { d.theme.colors = { ...d.theme.colors, ...p.theme.colors }; })}>
        {[p.theme.colors.primary, p.theme.colors.accent, p.theme.colors.bg, p.theme.colors.text].map((c, i) => <i key={i} style={{ background: c }} />)}<span>{p.name}</span></button>)}</div>
      <div className="insp-group">الألوان</div>
      {COLOR_LABELS.map(([k, l]) => <FieldInput key={k} storeId={storeId} draft={draft} f={{ key: k, label: l, type: 'color' }} value={th.colors[k]} onChange={(v) => set((t) => (t.colors[k] = v), 'c' + k)} />)}
      <div className="insp-group">الخطوط</div>
      {(['heading', 'body'] as const).map((k) => <FieldInput key={k} storeId={storeId} draft={draft} f={{ key: k, label: k === 'heading' ? 'خط العناوين' : 'خط النص', type: 'select', options: FONT_CHOICES.map((x) => ({ value: x, label: x === 'system-ui' ? 'خط النظام (الأسرع)' : x })) }} value={th.fonts[k]} onChange={(v) => set((t) => (t.fonts[k] = v), 'f' + k)} />)}
      <div className="insp-group">الشكل</div>
      <FieldInput storeId={storeId} draft={draft} f={{ key: 'radius', label: 'استدارة الزوايا', type: 'range', min: 0, max: 28 }} value={th.radius} onChange={(v) => set((t) => (t.radius = v), 'radius')} />
      <FieldInput storeId={storeId} draft={draft} f={{ key: 'container', label: 'أقصى عرض للمحتوى', type: 'range', min: 960, max: 1440, step: 20 }} value={th.container} onChange={(v) => set((t) => (t.container = v), 'container')} />
      {sel('كثافة المسافات', 'density', [['compact', 'مضغوطة'], ['normal', 'عادية'], ['airy', 'واسعة']])}
      {sel('نمط الأزرار', 'buttonStyle', [['solid', 'ممتلئ'], ['outline', 'محدد'], ['soft', 'ناعم']])}
      {sel('شكل الأزرار', 'buttonShape', [['square', 'حاد'], ['rounded', 'مستدير'], ['pill', 'كبسولة']])}
    </div>
  );
}

// ---------------- Cards ----------------
export function CardsPanel({ storeId }: { storeId: string }) {
  const draft = useE((s) => s.draft)!; const [kind, setKind] = useState<CardKind>('product'); const [sid, setSid] = useState<string | null>(null);
  const list = draft.cardPresets.filter((c) => c.kind === kind); const cur = list.find((c) => c.id === sid) ?? list.find((c) => c.isDefault) ?? list[0];
  const upd = (k: keyof CardSettings, v: any) => cur && mutate((d) => { (d.cardPresets.find((c) => c.id === cur.id)!.settings as any)[k] = v; }, 'card' + k);
  const F = (k: keyof CardSettings, label: string, type: any, extra: any = {}) => cur ? <FieldInput storeId={storeId} draft={draft} f={{ key: k, label, type, ...extra }} value={cur.settings[k]} onChange={(v) => upd(k, v)} /> : null;
  return (
    <div className="panel-body">
      <div className="tabs" style={{ marginBottom: 10 }}>{([['product', 'المنتج'], ['collection', 'القسم'], ['blog', 'المقال']] as [CardKind, string][]).map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setSid(null); }}>{l}</button>)}</div>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={cur?.id} onChange={(e) => setSid(e.target.value)} className="grow">{list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isDefault ? ' (الافتراضي)' : ''}</option>)}</select>
        <button className="btn sm ghost" onClick={() => { const id = uid(); mutate((d) => d.cardPresets.push({ id, kind, name: 'نمط جديد', settings: { ...(cur?.settings || DEFAULT_CARD) }, isDefault: false })); setSid(id); }}>＋</button>
      </div>
      {cur ? <>
        <FieldInput storeId={storeId} draft={draft} f={{ key: 'n', label: 'اسم النمط', type: 'text' }} value={cur.name} onChange={(v) => mutate((d) => { d.cardPresets.find((c) => c.id === cur.id)!.name = v; }, 'cn')} />
        <div className="row" style={{ marginBottom: 12 }}>
          {!cur.isDefault ? <button className="btn sm ghost" onClick={() => mutate((d) => d.cardPresets.forEach((c) => { if (c.kind === kind) c.isDefault = c.id === cur.id; }))}>اجعله الافتراضي</button> : <span className="badge violet">الافتراضي</span>}
          {!cur.isDefault ? <button className="btn sm danger" onClick={() => { mutate((d) => { d.cardPresets = d.cardPresets.filter((c) => c.id !== cur.id); }); setSid(null); }}>حذف</button> : null}</div>
        <div className="insp-group">الصورة</div>
        {F('ratio', 'نسبة الصورة', 'select', { options: [['1/1', 'مربعة'], ['4/5', 'عمودية 4:5'], ['3/4', 'عمودية 3:4'], ['16/9', 'عريضة']].map(([value, label]) => ({ value, label })) })}
        {F('imageFit', 'ملاءمة الصورة', 'select', { options: [{ value: 'cover', label: 'تعبئة' }, { value: 'contain', label: 'احتواء' }] })}
        {F('hoverEffect', 'تأثير المرور', 'select', { options: [{ value: 'none', label: 'بدون' }, { value: 'zoom', label: 'تكبير' }, { value: 'swap', label: 'تبديل الصورة' }] })}
        <div className="insp-group">المحتوى</div>
        {F('align', 'المحاذاة', 'select', { options: [{ value: 'start', label: 'بداية' }, { value: 'center', label: 'وسط' }] })}
        {F('showPrice', 'السعر', 'toggle')}{F('showBadge', 'الشارة', 'toggle')}{F('showRating', 'التقييم', 'toggle')}{F('showAddToCart', 'زر الإضافة للسلة', 'toggle')}{F('showBrand', 'العلامة', 'toggle')}
        <div className="insp-group">الإطار</div>
        {F('border', 'حدود', 'toggle')}{F('shadow', 'الظل', 'select', { options: [{ value: 'none', label: 'بدون' }, { value: 'sm', label: 'خفيف' }, { value: 'md', label: 'متوسط' }] })}{F('radius', 'الاستدارة', 'range', { min: 0, max: 28 })}
      </> : null}
    </div>
  );
}

// ---------------- Pages ----------------
export function PagesPanel({ storeId }: { storeId: string }) {
  const draft = useE((s) => s.draft)!; const pageId = useE((s) => s.pageId); const [nw, setNw] = useState('');
  const page = currentPage(draft, pageId)!; const upd = (fn: (p: Page) => void, key = '') => mutate((d) => fn(d.pages.find((x) => x.id === page.id)!), key);
  return (
    <div className="panel-body">
      <div className="insp-group">الصفحات</div>
      {draft.pages.map((p) => <div key={p.id} className={'lyr ' + (p.id === page.id ? 'on' : '')} onClick={() => es.set({ pageId: p.id, selected: null, selectedBlock: null })}>
        <span className="grow">{p.title} <small className="muted">{p.system ? PAGE_TYPE_LABELS[p.type] : 'مخصصة'}</small></span>{!p.enabled ? <span className="badge amber">مخفية</span> : null}</div>)}
      <form className="row" style={{ marginTop: 10, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); const title = nw.trim(); if (!title) return; let slug = slugify(title) || 'page'; const taken = new Set(draft.pages.map((p) => p.slug)); const base = slug; let n = 2; while (taken.has(slug)) slug = base + '-' + n++;
        const sec = newSection('page-content'); const id = uid(); mutate((d) => d.pages.push({ id, type: 'custom', title, slug, enabled: true, system: false, seo: {}, sections: [sec] })); es.set({ pageId: id, selected: null }); setNw(''); }}>
        <input placeholder="عنوان صفحة جديدة" value={nw} onChange={(e) => setNw(e.target.value)} /><button className="btn sm">إضافة</button></form>
      <div className="insp-group">إعدادات الصفحة</div>
      <FieldInput storeId={storeId} draft={draft} f={{ key: 't', label: 'العنوان', type: 'text' }} value={page.title} onChange={(v) => upd((p) => (p.title = v), 'pt')} />
      {!page.system ? <FieldInput storeId={storeId} draft={draft} f={{ key: 's', label: 'الرابط (slug)', type: 'text', help: '/p/' + page.slug }} value={page.slug} onChange={(v) => upd((p) => (p.slug = slugify(v) || p.slug), 'ps')} /> : null}
      <FieldInput storeId={storeId} draft={draft} f={{ key: 'e', label: 'ظاهرة للزوار', type: 'toggle' }} value={page.enabled} onChange={(v) => upd((p) => (p.enabled = v))} />
      <div className="insp-group">تحسين محركات البحث</div>
      <FieldInput storeId={storeId} draft={draft} f={{ key: 'st', label: 'عنوان SEO', type: 'text' }} value={page.seo.title || ''} onChange={(v) => upd((p) => (p.seo.title = v), 'seot')} />
      <FieldInput storeId={storeId} draft={draft} f={{ key: 'sd', label: 'الوصف', type: 'textarea' }} value={page.seo.description || ''} onChange={(v) => upd((p) => (p.seo.description = v), 'seod')} />
      <FieldInput storeId={storeId} draft={draft} f={{ key: 'so', label: 'صورة المشاركة', type: 'image' }} value={page.seo.og || ''} onChange={(v) => upd((p) => (p.seo.og = v))} />
      {!page.system ? <button className="btn danger block" style={{ marginTop: 12 }} onClick={() => { mutate((d) => { d.pages = d.pages.filter((p) => p.id !== page.id); }); es.set({ pageId: null, selected: null }); }}>حذف الصفحة</button> : null}
    </div>
  );
}

// ---------------- Menus ----------------
export function MenusPanel({ storeId }: { storeId: string }) {
  const draft = useE((s) => s.draft)!; const [h, setH] = useState(draft.menus[0]?.handle || 'main');
  const menu = draft.menus.find((m) => m.handle === h) ?? draft.menus[0];
  const upd = (fn: (m: Menu) => void, key = '') => mutate((d) => { let m = d.menus.find((x) => x.handle === h); if (!m) { m = { handle: h, title: h, items: [] }; d.menus.push(m); } fn(m); }, key);
  const edit = (path: number[], fn: (i: MenuItem) => void, key = '') => upd((m) => { let l = m.items; for (let k = 0; k < path.length - 1; k++) l = l[path[k]].children; fn(l[path[path.length - 1]]); }, key);
  const remove = (path: number[]) => upd((m) => { let l = m.items; for (let k = 0; k < path.length - 1; k++) l = l[path[k]].children; l.splice(path[path.length - 1], 1); });
  const swap = (path: number[], dir: number) => upd((m) => { let l = m.items; for (let k = 0; k < path.length - 1; k++) l = l[path[k]].children; const i = path[path.length - 1]; const j = i + dir; if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; });
  const row = (it: MenuItem, path: number[]) => (
    <div key={path.join('-')} className="menuitem" style={{ marginInlineStart: (path.length - 1) * 16 }}>
      <input value={it.label} placeholder="النص" onChange={(e) => edit(path, (i) => (i.label = e.target.value), 'ml' + path)} />
      <select value={it.linkType} onChange={(e) => edit(path, (i) => { i.linkType = e.target.value as any; i.linkRef = ''; })}><option value="page">صفحة</option><option value="collection">قسم</option><option value="product">منتج</option><option value="url">رابط</option></select>
      {it.linkType === 'page' ? <select value={it.linkRef} onChange={(e) => edit(path, (i) => (i.linkRef = e.target.value))}><option value="">—</option>{draft.pages.filter((p) => p.enabled).map((p) => <option key={p.id} value={p.slug}>{p.title}</option>)}</select>
        : <input dir="ltr" value={it.linkRef} placeholder={it.linkType === 'url' ? 'https://…' : 'slug'} onChange={(e) => edit(path, (i) => (i.linkRef = e.target.value), 'mr' + path)} />}
      <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><button className="icon" onClick={() => swap(path, -1)}>↑</button><button className="icon" onClick={() => swap(path, 1)}>↓</button>
        {path.length < 2 ? <button className="icon" title="عنصر فرعي" onClick={() => edit(path, (i) => i.children.push({ id: uid(), label: 'فرعي', linkType: 'page', linkRef: '', children: [] }))}>＋</button> : null}<button className="icon" onClick={() => remove(path)}>✕</button></div>
      {it.children.map((c, k) => row(c, [...path, k]))}
    </div>);
  return (
    <div className="panel-body">
      <div className="row" style={{ marginBottom: 10 }}><select className="grow" value={h} onChange={(e) => setH(e.target.value)}>{['main', 'footer'].map((x) => <option key={x} value={x}>{x === 'main' ? 'القائمة الرئيسية' : 'قائمة التذييل'}</option>)}</select></div>
      {(menu?.items || []).map((it, i) => row(it, [i]))}
      <button className="btn block ghost" style={{ marginTop: 10 }} onClick={() => upd((m) => m.items.push({ id: uid(), label: 'رابط جديد', linkType: 'page', linkRef: '', children: [] }))}>＋ إضافة عنصر</button>
      <span hidden>{storeId}</span>
    </div>
  );
}
