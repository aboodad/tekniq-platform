import { useState } from 'react';
import { api } from '../backend';
import { REGISTRY, type Field as F } from '../core/registry';
import type { Draft, MediaRow } from '../core/types';
import { Async, Modal, useAction, useLoad } from '../app/ui';
import { SYSTEM_HREF } from '../render/ctx';

export function MediaPicker({ storeId, onPick, onClose }: { storeId: string; onPick(url: string): void; onClose(): void }) {
  const ml = useLoad(() => api.media(storeId), [storeId]); const { busy, run } = useAction();
  const up = async (f: File | undefined) => { if (!f) return; const m = await run(() => api.uploadMedia(storeId, f)); if (m) { onPick(m.url); } };
  return (
    <Modal title="اختيار صورة" wide onClose={onClose} footer={<label className="btn" style={{ cursor: 'pointer' }}>{busy ? 'جارٍ الرفع…' : 'رفع صورة جديدة'}<input type="file" hidden accept="image/*" onChange={(e) => up(e.target.files?.[0])} /></label>}>
      <Async s={ml}>{(l: MediaRow[]) => l.filter((m) => m.type === 'image').length === 0 ? <p className="muted">لا توجد صور بعد. ارفع صورة جديدة.</p> :
        <div className="mediagrid">{l.filter((m) => m.type === 'image').map((m) => <button key={m.id} className="mediaitem" onClick={() => onPick(m.url)}><img src={m.url} alt={m.file_name} /></button>)}</div>}</Async>
    </Modal>
  );
}

export function FieldInput({ f, value, onChange, storeId, draft }: { f: F; value: any; onChange(v: any): void; storeId: string; draft: Draft }) {
  const [pick, setPick] = useState(false); const v = value ?? f.default ?? '';
  let input;
  switch (f.type) {
    case 'textarea': input = <textarea value={v} onChange={(e) => onChange(e.target.value)} />; break;
    case 'number': input = <input type="number" value={v} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />; break;
    case 'range': input = <div className="row" style={{ flexWrap: 'nowrap' }}><input type="range" min={f.min} max={f.max} step={f.step} value={v} onChange={(e) => onChange(Number(e.target.value))} /><b style={{ minWidth: 30, textAlign: 'end' }}>{v}</b></div>; break;
    case 'select': input = <select value={String(v)} onChange={(e) => onChange(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; break;
    case 'color': input = <div className="row" style={{ flexWrap: 'nowrap' }}><input type="color" value={v || '#000000'} onChange={(e) => onChange(e.target.value)} style={{ width: 52 }} /><input dir="ltr" value={v} onChange={(e) => onChange(e.target.value)} /></div>; break;
    case 'toggle': input = <label className="row"><input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} /><span>{v ? 'مفعّل' : 'معطّل'}</span></label>; break;
    case 'datetime': input = <input type="datetime-local" dir="ltr" value={v} onChange={(e) => onChange(e.target.value)} />; break;
    case 'image': input = (
      <div className="stack" style={{ gap: 8 }}>
        {v ? <img src={v} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 10 }} /> : null}
        <div className="row"><button type="button" className="btn sm ghost" onClick={() => setPick(true)}>{v ? 'تغيير' : 'اختيار صورة'}</button>{v ? <button type="button" className="btn sm ghost" onClick={() => onChange('')}>إزالة</button> : null}</div>
        <input dir="ltr" placeholder="أو الصق رابط صورة" value={v.startsWith('data:') ? '' : v} onChange={(e) => onChange(e.target.value)} />
        {pick ? <MediaPicker storeId={storeId} onClose={() => setPick(false)} onPick={(u) => { onChange(u); setPick(false); }} /> : null}
      </div>); break;
    case 'link': input = (
      <div className="stack" style={{ gap: 6 }}>
        <input dir="ltr" value={v} placeholder="/collection/all أو https://…" onChange={(e) => onChange(e.target.value)} />
        <select value="" onChange={(e) => e.target.value && onChange(e.target.value)}><option value="">اختر صفحة…</option>
          {draft.pages.filter((p) => p.enabled).map((p) => { const h = p.type === 'custom' ? '/p/' + p.slug : SYSTEM_HREF[p.type]; return h ? <option key={p.id} value={h}>{p.title}</option> : null; })}</select>
      </div>); break;
    default: input = <input value={v} onChange={(e) => onChange(e.target.value)} />;
  }
  return <label className="field"><span>{f.label}</span>{input}{f.help ? <small>{f.help}</small> : null}</label>;
}

/** Schema-driven form for a section or block, grouped by Field.group. */
export function SettingsForm({ typeKey, settings, onChange, storeId, draft }: { typeKey: string; settings: Record<string, any>; onChange(key: string, v: any): void; storeId: string; draft: Draft }) {
  const d = REGISTRY[typeKey]; if (!d) return <p className="muted">مكوّن غير معروف</p>;
  const groups: Record<string, F[]> = {}; for (const f of d.fields) (groups[f.group || 'المحتوى'] ||= []).push(f);
  return <>{Object.entries(groups).map(([g, fs]) => <div key={g}><div className="insp-group">{g}</div>{fs.map((f) => <FieldInput key={f.key} f={f} value={settings[f.key]} onChange={(v) => onChange(f.key, v)} storeId={storeId} draft={draft} />)}</div>)}</>;
}
