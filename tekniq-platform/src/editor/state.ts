import type { Block, Draft, Page, Section } from '../core/types';
import { clone } from '../core/util';
import { createStore, useStore } from '../core/store';

export type Device = 'desktop' | 'tablet' | 'mobile';
export interface EState {
  draft: Draft | null; rev: number; pageId: string | null; selected: string | null; selectedBlock: string | null;
  device: Device; past: Draft[]; future: Draft[]; dirty: boolean; saving: boolean; error: string | null; conflict: boolean; lastSaved: number | null;
}
export const initial = (): EState => ({ draft: null, rev: 0, pageId: null, selected: null, selectedBlock: null, device: 'desktop', past: [], future: [], dirty: false, saving: false, error: null, conflict: false, lastSaved: null });
export const es = createStore<EState>(initial());
export const useE = <S,>(sel: (s: EState) => S) => useStore(es, sel);

let lastKey = ''; let lastAt = 0;
/** Apply a change to the draft. Edits with the same `key` within 800ms (typing, dragging a slider) share one undo step. */
export function mutate(fn: (d: Draft) => void, key = '') {
  const s = es.get(); if (!s.draft) return;
  const next = clone(s.draft); fn(next);
  const merge = key && key === lastKey && Date.now() - lastAt < 800;
  lastKey = key; lastAt = Date.now();
  es.set({ draft: next, past: merge ? s.past : [...s.past.slice(-60), s.draft], future: [], dirty: true });
}
export function undo() { const s = es.get(); if (!s.past.length || !s.draft) return; es.set({ draft: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.draft, ...s.future], dirty: true }); lastKey = ''; }
export function redo() { const s = es.get(); if (!s.future.length || !s.draft) return; es.set({ draft: s.future[0], future: s.future.slice(1), past: [...s.past, s.draft], dirty: true }); lastKey = ''; }

export const allSections = (d: Draft): Section[] => [...d.layout.announcement, ...d.layout.header, ...d.layout.footer, ...d.pages.flatMap((p) => p.sections)];
export function findSection(d: Draft, id: string | null): Section | null { return id ? allSections(d).find((s) => s.id === id) ?? null : null; }
/** The array that holds a given section (a page's sections or a layout region). */
export function listOf(d: Draft, id: string): Section[] | null {
  for (const l of [d.layout.announcement, d.layout.header, d.layout.footer]) if (l.some((s) => s.id === id)) return l;
  for (const p of d.pages) if (p.sections.some((s) => s.id === id)) return p.sections;
  return null;
}
export const currentPage = (d: Draft | null, id: string | null): Page | null => d?.pages.find((p) => p.id === id) ?? d?.pages[0] ?? null;
export const findBlock = (s: Section | null, id: string | null): Block | null => (s && id ? s.blocks.find((b) => b.id === id) ?? null : null);
