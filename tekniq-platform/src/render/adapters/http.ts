import type { DataAdapter } from '../../core/types';

// Contract for the company's own API (data_mode = 'http'). All endpoints are relative to data_api_url, JSON, GET unless noted:
//   GET  /products?collection=&sort=&limit=&offset=&search=&badge=   -> { items: Product[], total }
//   GET  /products/:slug            -> Product | 404
//   GET  /collections               -> Collection[]        GET /collections/:slug -> Collection | 404
//   GET  /posts?limit=              -> Post[]              GET /posts/:slug       -> Post | 404
//   GET  /products/:id/reviews      -> Review[]            GET /shipping          -> ShippingMethod[]
//   POST /discounts/validate {code,subtotal} -> DiscountResult   POST /orders {OrderInput} -> OrderResult
// Shapes are the TypeScript types in src/core/types.ts.
export function httpAdapter(baseUrl: string): DataAdapter {
  const b = baseUrl.replace(/\/+$/, '');
  const get = async <T,>(p: string, allow404 = false): Promise<T> => {
    const r = await fetch(b + p, { headers: { Accept: 'application/json' } });
    if (r.status === 404 && allow404) return null as any;
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  };
  const post = async <T,>(p: string, body: unknown): Promise<T> => {
    const r = await fetch(b + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'http_' + r.status);
    return r.json();
  };
  const qs = (o: Record<string, any>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v)); const s = p.toString(); return s ? '?' + s : ''; };
  return {
    products: (q) => get('/products' + qs({ collection: q.collection, sort: q.sort, limit: q.limit, offset: q.offset, search: q.search, badge: q.badge })),
    product: (s) => get('/products/' + encodeURIComponent(s), true),
    collections: () => get('/collections'),
    collection: (s) => get('/collections/' + encodeURIComponent(s), true),
    posts: (l = 6) => get('/posts' + qs({ limit: l })),
    post: (s) => get('/posts/' + encodeURIComponent(s), true),
    reviews: (id) => get(`/products/${encodeURIComponent(id)}/reviews`),
    shipping: () => get('/shipping'),
    validateDiscount: (code, subtotal) => post('/discounts/validate', { code, subtotal }),
    placeOrder: (o) => post('/orders', o),
  };
}
