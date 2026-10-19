import type { Collection, DataAdapter, DiscountResult, OrderInput, OrderResult, Post, Product, ProductQuery, Review, ShippingMethod } from '../../core/types';

// Inline SVG placeholder so demo products need no external images.
export function placeholder(seed: number, label = ''): string {
  const hues = [255, 18, 160, 200, 330, 40, 280, 100];
  const h = hues[seed % hues.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 62%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360} 70% 38%)"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/><circle cx="${120 + (seed % 5) * 40}" cy="170" r="90" fill="#fff" opacity=".14"/><rect x="60" y="300" width="280" height="120" rx="24" fill="#fff" opacity=".12"/>${label ? `<text x="200" y="372" font-family="sans-serif" font-size="30" fill="#fff" text-anchor="middle" opacity=".85">${label.replace(/[<&]/g, '')}</text>` : ''}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const COLLECTIONS: Collection[] = [
  { id: 'c1', slug: 'new', title: 'وصل حديثاً', description: 'أحدث ما وصل إلى المتجر', count: 6 },
  { id: 'c2', slug: 'men', title: 'رجالي', description: 'ملابس وإكسسوارات رجالية', count: 5 },
  { id: 'c3', slug: 'women', title: 'نسائي', description: 'تشكيلة نسائية عصرية', count: 5 },
  { id: 'c4', slug: 'accessories', title: 'إكسسوارات', description: 'تفاصيل تكمل إطلالتك', count: 4 },
].map((c, i) => ({ ...c, image: placeholder(i + 2, c.title) }));

const NAMES: [string, number, string, string[]][] = [
  ['قميص قطني كلاسيك', 24, 'men', ['new']], ['حذاء رياضي خفيف', 59, 'men', []], ['ساعة يد أنيقة', 89, 'accessories', ['new']], ['حقيبة جلدية', 74, 'women', []],
  ['فستان صيفي', 48, 'women', ['new']], ['سترة شتوية', 96, 'men', []], ['نظارة شمسية', 32, 'accessories', []], ['وشاح حرير', 21, 'women', ['new']],
  ['بنطال جينز', 39, 'men', []], ['حذاء كعب', 66, 'women', []], ['محفظة جلد', 28, 'accessories', []], ['قبعة صيفية', 18, 'accessories', ['new']],
  ['بلوزة كتان', 34, 'women', []], ['جاكيت جلد', 140, 'men', ['new']], ['عباءة مطرزة', 120, 'women', []], ['حزام جلد', 19, 'men', []],
];
const badge = (i: number): Product['badge'] => (i % 5 === 0 ? 'sale' : i % 7 === 0 ? 'soldout' : i % 4 === 0 ? 'new' : null);

const PRODUCTS: Product[] = NAMES.map(([title, price, col, extra], i) => {
  const sizes = ['S', 'M', 'L'];
  const compare = i % 5 === 0 ? Math.round(price * 1.3) : null;
  return {
    id: 'p' + (i + 1), slug: 'item-' + (i + 1), title, price, compareAt: compare, brand: i % 3 === 0 ? 'تكنيك' : null,
    images: [placeholder(i, title), placeholder(i + 3, title), placeholder(i + 5)],
    badge: badge(i), description: `${title}: خامة عالية الجودة وتصميم عملي يناسب الاستخدام اليومي.\n\nمتوفر بعدة مقاسات وألوان مع إمكانية الاسترجاع خلال 7 أيام.`,
    options: [{ name: 'المقاس', values: sizes }],
    variants: sizes.map((s, j) => ({ id: `v${i + 1}-${j}`, options: { المقاس: s }, price: price + j * 2, compareAt: compare, stock: badge(i) === 'soldout' ? 0 : 8 - j })),
    rating: 3.5 + ((i * 7) % 15) / 10, reviewCount: 3 + (i % 9), collections: [col, ...extra], tags: [col],
  };
});
const POSTS: Post[] = [
  { id: 'b1', slug: 'style-guide', title: 'دليلك لاختيار الإطلالة المناسبة', excerpt: 'نصائح بسيطة لتنسيق قطعك المفضلة.', author: 'فريق المتجر', date: '2026-05-01', content: 'محتوى المقال التجريبي.\n\nيمكنك تعديل المقالات من لوحة التحكم عند ربط قاعدة البيانات.' },
  { id: 'b2', slug: 'care-tips', title: 'كيف تحافظ على ملابسك أطول', excerpt: 'خطوات صغيرة تطيل عمر القطع.', author: 'فريق المتجر', date: '2026-04-12', content: 'محتوى المقال التجريبي.' },
  { id: 'b3', slug: 'new-season', title: 'وصل موسم جديد', excerpt: 'تعرّف على أبرز ما وصل.', author: 'فريق المتجر', date: '2026-03-20', content: 'محتوى المقال التجريبي.' },
].map((p, i) => ({ ...p, cover: placeholder(i + 1) }));
const REVIEWS: Review[] = [
  { id: 'r1', author: 'أحمد', rating: 5, title: 'ممتاز', body: 'جودة رائعة وسرعة في التوصيل.', date: '2026-05-02' },
  { id: 'r2', author: 'منى', rating: 4, title: 'جيد جداً', body: 'مطابق للوصف.', date: '2026-04-21' },
  { id: 'r3', author: 'سالم', rating: 5, title: '', body: 'أنصح به.', date: '2026-04-02' },
];
const SHIPPING: ShippingMethod[] = [
  { id: 'sh1', name: 'توصيل عادي', price: 4, estDays: '3-5 أيام', type: 'flat', minOrder: 100 },
  { id: 'sh2', name: 'توصيل سريع', price: 9, estDays: '1-2 يوم', type: 'flat' },
  { id: 'sh3', name: 'استلام من المتجر', price: 0, estDays: 'اليوم', type: 'pickup' },
];

export function mockAdapter(currency = 'USD'): DataAdapter {
  return {
    async products(q: ProductQuery) {
      let l = PRODUCTS.slice();
      if (q.collection && q.collection !== 'all') l = l.filter((p) => p.collections?.includes(q.collection!));
      if (q.search) { const s = q.search.toLowerCase(); l = l.filter((p) => p.title.toLowerCase().includes(s) || (p.tags || []).some((t) => t.includes(s))); }
      if (q.badge) l = l.filter((p) => p.badge === q.badge);
      if (q.ids) l = l.filter((p) => q.ids!.includes(p.id));
      if (q.excludeId) l = l.filter((p) => p.id !== q.excludeId);
      if (q.sort === 'price_asc') l.sort((a, b) => a.price - b.price);
      else if (q.sort === 'price_desc') l.sort((a, b) => b.price - a.price);
      else if (q.sort === 'newest') l.sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1)));
      else if (q.sort === 'best') l.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
      const total = l.length; const off = q.offset ?? 0;
      return { items: l.slice(off, off + (q.limit ?? 24)), total };
    },
    async product(slug) { return PRODUCTS.find((p) => p.slug === slug) ?? null; },
    async collections() { return COLLECTIONS; },
    async collection(slug) {
      if (slug === 'all') return { id: 'all', slug: 'all', title: 'كل المنتجات', description: 'تصفّح كل المنتجات', count: PRODUCTS.length };
      return COLLECTIONS.find((c) => c.slug === slug) ?? null;
    },
    async posts(limit = 6) { return POSTS.slice(0, limit); },
    async post(slug) { return POSTS.find((p) => p.slug === slug) ?? null; },
    async reviews() { return REVIEWS; },
    async shipping() { return SHIPPING; },
    async validateDiscount(code, subtotal): Promise<DiscountResult> {
      if (code.trim().toUpperCase() === 'WELCOME10') return { code: 'WELCOME10', type: 'percent', value: 10, amount: Math.round(subtotal * 10) / 100, freeShipping: false };
      throw new Error('invalid_code');
    },
    async placeOrder(o: OrderInput): Promise<OrderResult> {
      let sub = 0;
      for (const it of o.items) { const v = PRODUCTS.flatMap((p) => p.variants).find((x) => x.id === it.variantId); if (!v) throw new Error('item_unavailable'); sub += v.price * it.qty; }
      const sh = SHIPPING.find((s) => s.id === o.shippingMethodId);
      const ship = sh ? (sh.minOrder && sub >= sh.minOrder ? 0 : sh.price) : 0;
      return { orderNumber: 'DEMO-' + Math.floor(10000 + Math.random() * 89999), total: sub + ship, currency };
    },
  };
}
