import { useSyncExternalStore } from 'react';

export interface Store<T> { get(): T; set(p: Partial<T> | ((s: T) => Partial<T>)): void; subscribe(fn: () => void): () => void; replace(v: T): void; }
export function createStore<T extends object>(init: T): Store<T> {
  let state = init; const subs = new Set<() => void>();
  return {
    get: () => state,
    set(p) { const patch = typeof p === 'function' ? p(state) : p; state = { ...state, ...patch }; subs.forEach((f) => f()); },
    replace(v) { state = v; subs.forEach((f) => f()); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
export function useStore<T, S>(s: Store<T>, sel: (v: T) => S): S {
  return useSyncExternalStore(s.subscribe, () => sel(s.get()), () => sel(s.get()));
}
