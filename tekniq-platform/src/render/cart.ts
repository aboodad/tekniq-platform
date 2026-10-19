import { createStore, useStore } from '../core/store';

export interface CartLine { variantId: string; productId: string; slug: string; title: string; image?: string; price: number; qty: number; options: Record<string, string>; }
interface CartState { lines: CartLine[]; }

const stores = new Map<string, ReturnType<typeof createStore<CartState>>>();
function load(storeId: string): CartLine[] { try { return JSON.parse(localStorage.getItem('tk_cart_' + storeId) || '[]'); } catch { return []; } }
function persist(storeId: string, lines: CartLine[]) { try { localStorage.setItem('tk_cart_' + storeId, JSON.stringify(lines)); } catch { /* storage unavailable */ } }

export function cartStore(storeId: string) {
  let s = stores.get(storeId);
  if (!s) { s = createStore<CartState>({ lines: load(storeId) }); stores.set(storeId, s); }
  return s;
}
export function useCart(storeId: string) {
  const st = cartStore(storeId);
  const lines = useStore(st, (v) => v.lines);
  const set = (l: CartLine[]) => { st.set({ lines: l }); persist(storeId, l); };
  return {
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0),
    add(line: CartLine) {
      const cur = st.get().lines; const i = cur.findIndex((l) => l.variantId === line.variantId);
      set(i >= 0 ? cur.map((l, j) => (j === i ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l)) : [...cur, line]);
    },
    setQty(variantId: string, qty: number) { set(qty <= 0 ? st.get().lines.filter((l) => l.variantId !== variantId) : st.get().lines.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(99, qty) } : l))); },
    remove(variantId: string) { set(st.get().lines.filter((l) => l.variantId !== variantId)); },
    clear() { set([]); },
  };
}
