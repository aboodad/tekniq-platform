import { useEffect, useMemo, useState } from 'react';
import type { MenuItem } from '../core/types';
import { money, safeUrl } from '../core/util';
import { ProductCard, PostCard } from './cards';
import { useAsync, useStoreCtx } from './ctx';
import { A, Icon, Img, Price, Skeleton, Stars } from './ui';
import { cols, type SP } from './sections1';

// ---------- announcement / header / footer ----------
export function Announcement({ st }: { st: Record<string, any> }) {
  const [open, setOpen] = useState(true);
  if (!open || !st.text) return null;
  const inner = <>{st.text}</>;
  return <div className={'sf-ann ' + (st.tone === 'primary' ? 'primary' : st.tone === 'accent' ? 'accent' : '')}>{st.href ? <A to={st.href}>{inner}</A> : inner}{st.closable ? <button className="x" aria-label="إغلاق" onClick={() => setOpen(false)}>×</button> : null}</div>;
}

function NavItem({ it }: { it: MenuItem }) {
  const c = useStoreCtx(); const to = c.linkFor(it);
  if (!it.children?.length) return <A to={to} newTab={it.newTab}>{it.label}</A>;
  return <span className="dd"><A to={to}>{it.label} ▾</A><span className="menu">{it.children.map((ch, i) => <A key={i} to={c.linkFor(ch)}>{ch.label}</A>)}</span></span>;
}

export function Header({ st }: { st: Record<string, any> }) {
  const c = useStoreCtx(); const { store } = c.snap; const [mobile, setMobile] = useState(false); const [search, setSearch] = useState(false); const [q, setQ] = useState('');
  const menu = c.menu(st.menu || 'main');
  const logo = <A to="/" className="sf-logo">{store.logoUrl ? <img src={safeUrl(store.logoUrl)} alt={store.name} /> : null}<span>{store.name}</span></A>;
  return (
    <header className={`sf-header ${st.sticky ? 'sticky' : ''} ${st.tone === 'primary' ? 'primary' : st.tone === 'transparent' ? 'transparent' : ''} ${st.layout === 'logo-center' ? 'logo-center' : ''}`}>
      <div className="row">
        <button className="sf-icon-btn sf-burger" aria-label="القائمة" onClick={() => setMobile((v) => !v)}><Icon n="menu" /></button>
        {logo}
        <nav className="sf-nav">{menu?.items.map((it, i) => <NavItem key={i} it={it} />)}</nav>
        <div className="sf-actions" style={{ marginInlineStart: 'auto' }}>
          {st.showSearch ? <button className="sf-icon-btn" aria-label="بحث" onClick={() => setSearch((v) => !v)}><Icon n="search" /></button> : null}
          {st.showCart ? <A to="/cart" className="sf-icon-btn"><Icon n="cart" />{c.cart.count ? <span className="badge">{c.cart.count}</span> : null}</A> : null}
        </div>
      </div>
      {search ? <form className="sf-searchbar" onSubmit={(e) => { e.preventDefault(); setSearch(false); c.go('/search?q=' + encodeURIComponent(q)); }}><input className="sf-input" autoFocus placeholder="ابحث عن منتج…" value={q} onChange={(e) => setQ(e.target.value)} /></form> : null}
      <div className={'sf-mobile-menu ' + (mobile ? 'open' : '')}>{menu?.items.map((it, i) => <div key={i}><A to={c.linkFor(it)}>{it.label}</A>{it.children?.length ? <div className="sub">{it.children.map((ch, k) => <A key={k} to={c.linkFor(ch)}>{ch.label}</A>)}</div> : null}</div>)}</div>
    </header>
  );
}

const SOCIAL: Record<string, string> = { instagram: 'IG', facebook: 'f', x: 'X', tiktok: 'TT', whatsapp: 'WA', snapchat: 'SC' };
export function Footer({ st, blocks }: SP) {
  const c = useStoreCtx(); const { store } = c.snap;
  const social = blocks.filter((b) => b.type === 'social');
  return (
    <footer className="sf-footer"><div className="sf-in">
      <div className="cols">
        {blocks.filter((b) => b.type !== 'social').map((b, i) => b.type === 'footer-text'
          ? <div className="about" key={b.id}><h4>{b.settings.title || store.name}</h4><p>{b.settings.text}</p>{social.length ? <div className="sf-social" style={{ marginTop: 14 }}>{social.map((s) => <A key={s.id} to={s.settings.href || '#'} newTab>{SOCIAL[s.settings.network] || '•'}</A>)}</div> : null}</div>
          : <div key={b.id}><h4>{b.settings.title}</h4><ul>{c.menu(b.settings.menu || 'footer')?.items.map((it, k) => <li key={k}><A to={c.linkFor(it)}>{it.label}</A></li>)}</ul></div>)}
      </div>
      <div className="bar"><span>{st.copyright || `© ${store.name}`}</span>{st.showPayments ? <div className="sf-pay"><span>COD</span><span>VISA</span><span>MADA</span></div> : null}</div>
    </div></footer>
  );
}

// ---------- catalog ----------
export function CollectionMain({ st }: SP) {
  const { adapter, collection, mode } = useStoreCtx();
  const [sort, setSort] = useState<any>('manual'); const [q, setQ] = useState(''); const [page, setPage] = useState(0); const per = st.perPage || 12;
  const slug = collection?.slug;
  useEffect(() => setPage(0), [slug, sort, q]);
  const { data, loading } = useAsync(() => adapter.products({ collection: slug, sort, search: q || undefined, limit: per, offset: page * per }), [adapter, slug, sort, q, page, per]);
  const pages = Math.ceil((data?.total ?? 0) / per);
  return (
    <>
      {st.showBanner !== false && collection ? <div className="sf-collhead"><div className="sf-crumbs"><A to="/">الرئيسية</A> / {collection.title}</div><h1>{collection.title}</h1>{collection.description ? <p className="sf-muted">{collection.description}</p> : null}</div> : null}
      {st.showFilters !== false ? <div className="sf-toolbar"><span className="sf-muted">{data ? `${data.total} منتج` : ''}</span><div style={{ display: 'flex', gap: 8 }}>
        <input className="sf-input" placeholder="بحث في القسم" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="sf-input" value={sort} onChange={(e) => setSort(e.target.value)}><option value="manual">الترتيب</option><option value="newest">الأحدث</option><option value="price_asc">السعر: الأقل</option><option value="price_desc">السعر: الأعلى</option><option value="best">الأكثر طلباً</option></select></div></div> : null}
      {loading ? <Skeleton n={8} cols={Number(st.columns) || 4} /> : !data?.items.length ? <div className="sf-empty"><h3>لا توجد منتجات</h3></div> : <div className="sf-grid" style={cols(st.columns, 4)}>{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
      {pages > 1 ? <div className="sf-pager">{Array.from({ length: pages }, (_, i) => <button key={i} className={'sf-chip ' + (i === page ? 'on' : '')} onClick={() => setPage(i)}>{i + 1}</button>)}</div> : null}
      {mode === 'editor' ? null : null}
    </>
  );
}

export function ProductMain({ st }: SP) {
  const c = useStoreCtx(); const p = c.product; const [img, setImg] = useState(0); const [sel, setSel] = useState<Record<string, string>>({}); const [qty, setQty] = useState(1); const [added, setAdded] = useState(false);
  useEffect(() => { setImg(0); setQty(1); setSel(p ? Object.fromEntries(p.options.map((o) => [o.name, (p.variants.find((v) => v.stock > 0) ?? p.variants[0])?.options[o.name] ?? o.values[0]])) : {}); }, [p?.id]);
  const variant = useMemo(() => p?.variants.find((v) => Object.entries(sel).every(([k, val]) => v.options[k] === val)) ?? p?.variants[0], [p, sel]);
  if (!p) return <Skeleton n={2} cols={2} />;
  const sold = !variant || variant.stock <= 0;
  const price = variant?.price ?? p.price;
  const add = () => { if (!variant) return; c.cart.add({ variantId: variant.id, productId: p.id, slug: p.slug, title: p.title, image: p.images[0], price: variant.price, qty, options: variant.options }); setAdded(true); setTimeout(() => setAdded(false), 1800); };
  const has = (name: string, val: string) => p.variants.some((v) => v.options[name] === val && v.stock > 0);
  const imgs = p.images.length ? p.images : [''];
  return (
    <div className="sf-pdp">
      <div className="sf-gal">
        {st.gallery === 'stack' ? imgs.map((u, i) => <div key={i} className="sf-ratio main" style={{ aspectRatio: '4/5' }}><Img src={u} alt={p.title} /></div>) : (<>
          <div className="sf-ratio main" style={{ aspectRatio: '4/5' }}><Img src={imgs[img]} alt={p.title} /></div>
          {imgs.length > 1 ? <div className="sf-thumbs">{imgs.map((u, i) => <button key={i} className={i === img ? 'on' : ''} onClick={() => setImg(i)} aria-label={'صورة ' + (i + 1)}><img src={safeUrl(u)} alt="" /></button>)}</div> : null}</>)}
      </div>
      <div className="info">
        <div className="sf-crumbs"><A to="/">الرئيسية</A> / <A to="/collection/all">المتجر</A> / {p.title}</div>
        {p.brand ? <span className="sf-muted">{p.brand}</span> : null}
        <h1>{p.title}</h1>
        {p.rating ? <div><Stars v={p.rating} /> <span className="sf-muted" style={{ fontSize: 13 }}>({p.reviewCount})</span></div> : null}
        <div className="price"><Price price={price} compareAt={variant?.compareAt} /></div>
        {p.options.map((o) => <div className="sf-opt" key={o.name}><b>{o.name}</b><div className="sf-vals">{o.values.map((v) => <button key={v} className={'sf-val ' + (sel[o.name] === v ? 'on' : '')} disabled={!has(o.name, v)} onClick={() => setSel({ ...sel, [o.name]: v })}>{v}</button>)}</div></div>)}
        <div className="sf-buy"><div className="sf-qty"><button aria-label="إنقاص" onClick={() => setQty(Math.max(1, qty - 1))}>−</button><span>{qty}</span><button aria-label="زيادة" onClick={() => setQty(Math.min(variant?.stock || 99, qty + 1))}>+</button></div>
          <button className="sf-btn" disabled={sold} onClick={add}>{sold ? 'غير متوفر' : added ? 'تمت الإضافة ✓' : 'أضف للسلة'}</button></div>
        {!sold ? <button className="sf-btn ghost block" onClick={() => { add(); c.go('/checkout'); }}>اشترِ الآن</button> : null}
        {variant?.stock && variant.stock < 6 ? <span style={{ color: 'var(--sale)', fontSize: 13, fontWeight: 700 }}>متبقي {variant.stock} فقط</span> : null}
        {st.showSku && variant?.sku ? <span className="sf-muted">SKU: {variant.sku}</span> : null}
        {p.description ? <p className="sf-desc">{p.description}</p> : null}
      </div>
    </div>
  );
}

export function ProductReviews({ st }: SP) {
  const { adapter, product } = useStoreCtx(); const { data, loading } = useAsync(() => (product ? adapter.reviews(product.id) : Promise.resolve([])), [adapter, product?.id]);
  return (<><h2 className="sf-title">{st.title}</h2>{loading ? <div className="sf-skel" /> : !data?.length ? <p className="sf-muted">لا توجد تقييمات بعد.</p> : data.map((r) => <div className="sf-rev" key={r.id}><div><Stars v={r.rating} /> <b>{r.author}</b></div>{r.title ? <b>{r.title}</b> : null}<p className="sf-muted">{r.body}</p></div>)}</>);
}

export function SearchMain({ st }: SP) {
  const { adapter, route } = useStoreCtx(); const q = route.query.get('q') || '';
  const { data, loading } = useAsync(() => (q ? adapter.products({ search: q, limit: 24 }) : Promise.resolve({ items: [], total: 0 })), [adapter, q]);
  return (<><h1 className="sf-title">{q ? `نتائج البحث عن «${q}»` : 'ابحث عن منتج'}</h1>{loading ? <Skeleton n={4} /> : !data?.items.length ? <div className="sf-empty">{q ? 'لا توجد نتائج مطابقة' : 'اكتب كلمة في شريط البحث'}</div> : <div className="sf-grid" style={cols(st.columns, 4)}>{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}</>);
}

export function BlogMain({ st }: SP) {
  const { adapter } = useStoreCtx(); const { data, loading } = useAsync(() => adapter.posts(24), [adapter]);
  return (<><h1 className="sf-title">المدونة</h1>{loading ? <Skeleton n={3} cols={3} /> : !data?.length ? <div className="sf-empty">لا توجد مقالات</div> : <div className="sf-grid one-sm" style={cols(st.columns, 3)}>{data.map((p) => <PostCard key={p.id} p={p} />)}</div>}</>);
}
export function ArticleMain() {
  const { adapter, route } = useStoreCtx(); const { data, loading } = useAsync(() => adapter.post(route.slug || ''), [adapter, route.slug]);
  if (loading) return <div className="sf-skel" />;
  if (!data) return <div className="sf-empty"><h3>المقال غير موجود</h3><A to="/blog" className="sf-btn">العودة للمدونة</A></div>;
  return <article className="sf-article"><div className="sf-ratio" style={{ aspectRatio: '16/9', borderRadius: 'var(--radius)' }}><Img src={data.cover || ''} alt={data.title} /></div><h1>{data.title}</h1><span className="sf-muted">{data.author} · {data.date ? new Date(data.date).toLocaleDateString('ar-EG-u-nu-latn') : ''}</span><div className="body">{data.content}</div></article>;
}
export function AccountMain({ st }: SP) {
  return <div className="sf-empty"><Icon n="user" size={42} /><h2>حسابي</h2><p>{st.text}</p><span className="sf-muted">ميزة حسابات العملاء تُفعَّل بعد ربط قاعدة بيانات المتجر.</span></div>;
}

// ---------- cart / checkout ----------
export function CartMain({ st }: SP) {
  const c = useStoreCtx(); const { cart } = c; const cur = c.snap.store;
  if (!cart.lines.length) return <div className="sf-empty"><Icon n="cart" size={46} /><h2>{st.emptyText || 'سلتك فارغة'}</h2><A to="/collection/all" className="sf-btn">متابعة التسوق</A></div>;
  return (
    <div className="sf-cart">
      <div><h1 className="sf-title">سلة التسوق</h1>{cart.lines.map((l) => (
        <div className="sf-line" key={l.variantId}>
          <A to={'/product/' + l.slug} className="im"><img src={safeUrl(l.image)} alt="" /></A>
          <div className="meta"><A to={'/product/' + l.slug}><b>{l.title}</b></A><small>{Object.values(l.options).join(' / ')}</small><span>{money(l.price, cur.currency, cur.locale)}</span>
            <button className="rm" onClick={() => cart.remove(l.variantId)}>حذف</button></div>
          <div className="sf-qty"><button aria-label="إنقاص" onClick={() => cart.setQty(l.variantId, l.qty - 1)}>−</button><span>{l.qty}</span><button aria-label="زيادة" onClick={() => cart.setQty(l.variantId, l.qty + 1)}>+</button></div>
        </div>))}</div>
      <div className="sf-sum"><h3>ملخص الطلب</h3><div className="r"><span>المجموع</span><b>{money(cart.subtotal, cur.currency, cur.locale)}</b></div><p className="sf-muted" style={{ fontSize: 13 }}>الشحن والخصم يُحتسبان في الخطوة التالية.</p><A to="/checkout" className="sf-btn block">إتمام الطلب</A></div>
    </div>
  );
}

export function CheckoutMain({ st }: SP) {
  const c = useStoreCtx(); const { cart, adapter, mode } = c; const cur = c.snap.store;
  const ship = useAsync(() => adapter.shipping(), [adapter]);
  const [f, setF] = useState({ name: '', phone: '', email: '', city: '', district: '', street: '', notes: '' });
  const [shipId, setShipId] = useState(''); const [pay, setPay] = useState<'cod' | 'bank_transfer'>('cod');
  const [code, setCode] = useState(''); const [disc, setDisc] = useState<{ code: string; amount: number; freeShipping: boolean } | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ orderNumber: string; total: number } | null>(null);
  useEffect(() => { if (!shipId && ship.data?.length) setShipId(ship.data[0].id); }, [ship.data]);
  const method = ship.data?.find((s) => s.id === shipId);
  const shipCost = disc?.freeShipping ? 0 : method ? (method.minOrder && cart.subtotal >= method.minOrder ? 0 : method.price) : 0;
  const total = Math.max(cart.subtotal - (disc?.amount ?? 0) + shipCost, 0);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const apply = async () => { setErr(''); try { setDisc(await adapter.validateDiscount(code, cart.subtotal)); } catch (e: any) { setDisc(null); setErr(e.message === 'min_order_not_met' ? 'قيمة الطلب أقل من الحد الأدنى للكود' : 'كود الخصم غير صالح'); } };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (mode !== 'live' && mode !== 'preview') return; setErr(''); setBusy(true);
    try {
      const r = await adapter.placeOrder({ customer: { name: f.name, phone: f.phone, email: f.email || undefined }, address: { city: f.city, district: f.district, street: f.street, notes: f.notes }, items: cart.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })), shippingMethodId: shipId || undefined, discountCode: disc?.code, paymentMethod: pay, notes: f.notes });
      cart.clear(); setDone(r);
    } catch (e: any) { const m = String(e.message || ''); setErr(m.startsWith('out_of_stock') ? 'إحدى القطع نفدت من المخزون: ' + m.split(':')[1] : m === 'item_unavailable' ? 'منتج في السلة لم يعد متوفراً' : 'تعذّر إتمام الطلب، حاول مرة أخرى'); } finally { setBusy(false); }
  };
  if (done) return <div className="sf-done"><div className="ck">✓</div><h2>شكراً لك!</h2><p>{st.successText}</p><p>رقم الطلب: <b>{done.orderNumber}</b> — الإجمالي {money(done.total, cur.currency, cur.locale)}</p><A to="/" className="sf-btn">العودة للمتجر</A></div>;
  if (!cart.lines.length && mode !== 'editor') return <div className="sf-empty"><h2>لا توجد منتجات للدفع</h2><A to="/collection/all" className="sf-btn">تسوّق الآن</A></div>;
  const lines = cart.lines.length ? cart.lines : [{ variantId: 'x', title: 'منتج تجريبي', qty: 1, price: 25, options: {}, image: '', slug: '', productId: '' }];
  return (
    <form className="sf-cart" onSubmit={submit}>
      <div><h1 className="sf-title">إتمام الطلب</h1>
        <div className="sf-grid2"><div className="sf-field"><label>الاسم الكامل</label><input className="sf-input" required minLength={2} value={f.name} onChange={set('name')} /></div><div className="sf-field"><label>رقم الهاتف</label><input className="sf-input" required minLength={5} inputMode="tel" dir="ltr" value={f.phone} onChange={set('phone')} /></div></div>
        {st.askEmail ? <div className="sf-field"><label>البريد الإلكتروني</label><input className="sf-input" type="email" dir="ltr" value={f.email} onChange={set('email')} /></div> : null}
        <div className="sf-grid2"><div className="sf-field"><label>المدينة</label><input className="sf-input" required value={f.city} onChange={set('city')} /></div><div className="sf-field"><label>الحي</label><input className="sf-input" value={f.district} onChange={set('district')} /></div></div>
        <div className="sf-field"><label>العنوان التفصيلي</label><input className="sf-input" required value={f.street} onChange={set('street')} /></div>
        {st.askNotes ? <div className="sf-field"><label>ملاحظات</label><textarea className="sf-input" rows={2} value={f.notes} onChange={set('notes')} /></div> : null}
        <h3 style={{ margin: '18px 0 10px' }}>طريقة الشحن</h3><div style={{ display: 'grid', gap: 8 }}>{(ship.data || []).map((s) => <label key={s.id} className={'sf-radio ' + (s.id === shipId ? 'on' : '')}><input type="radio" name="ship" checked={s.id === shipId} onChange={() => setShipId(s.id)} /><span className="g">{s.name}<small>{s.estDays}</small></span><b>{s.price ? money(s.price, cur.currency, cur.locale) : 'مجاني'}</b></label>)}</div>
        <h3 style={{ margin: '18px 0 10px' }}>طريقة الدفع</h3><div style={{ display: 'grid', gap: 8 }}>{([['cod', 'الدفع عند الاستلام'], ['bank_transfer', 'تحويل بنكي']] as const).map(([k, l]) => <label key={k} className={'sf-radio ' + (pay === k ? 'on' : '')}><input type="radio" name="pay" checked={pay === k} onChange={() => setPay(k)} /><span className="g">{l}</span></label>)}</div>
      </div>
      <div className="sf-sum"><h3>ملخص الطلب</h3>
        {lines.map((l) => <div className="r" key={l.variantId}><span>{l.title} × {l.qty}</span><span>{money(l.price * l.qty, cur.currency, cur.locale)}</span></div>)}
        <div style={{ display: 'flex', gap: 8 }}><input className="sf-input" placeholder="كود خصم" value={code} onChange={(e) => setCode(e.target.value)} /><button type="button" className="sf-btn ghost sm" onClick={apply}>تطبيق</button></div>
        <div className="r"><span>المجموع</span><span>{money(cart.subtotal || 25, cur.currency, cur.locale)}</span></div>
        {disc ? <div className="r" style={{ color: 'var(--primary)' }}><span>خصم ({disc.code})</span><span>−{money(disc.amount, cur.currency, cur.locale)}</span></div> : null}
        <div className="r"><span>الشحن</span><span>{shipCost ? money(shipCost, cur.currency, cur.locale) : 'مجاني'}</span></div>
        <div className="r tot"><span>الإجمالي</span><span>{money(total || 25, cur.currency, cur.locale)}</span></div>
        {err ? <div className="sf-err">{err}</div> : null}
        <button className="sf-btn block" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'تأكيد الطلب'}</button>
      </div>
    </form>
  );
}
