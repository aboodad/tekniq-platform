import type { Collection, CardSettings, Post, Product } from '../core/types';
import { DEFAULT_CARD } from '../core/templates';
import { safeUrl } from '../core/util';
import { useStoreCtx } from './ctx';
import { A, Img, Price, Stars } from './ui';

export function useCardSettings(kind: 'product' | 'collection' | 'blog', presetId?: string): CardSettings {
  const { snap } = useStoreCtx();
  const list = snap.cardPresets.filter((c) => c.kind === kind);
  return { ...DEFAULT_CARD, ...((list.find((c) => c.id === presetId) ?? list.find((c) => c.isDefault) ?? list[0])?.settings ?? {}) };
}
const cls = (s: CardSettings) => `sf-card hv-${s.hoverEffect} ${s.align === 'center' ? 'center' : ''} ${s.border ? 'bordered' : ''} ${s.shadow !== 'none' ? 'sh-' + s.shadow : ''}`;
const vars = (s: CardSettings) => ({ ['--card-r' as any]: s.radius + 'px', ['--fit' as any]: s.imageFit });

export function ProductCard({ p, preset }: { p: Product; preset?: string }) {
  const s = useCardSettings('product', preset); const { cart } = useStoreCtx();
  const sold = p.badge === 'soldout' || p.variants.every((v) => v.stock <= 0);
  const quick = () => {
    const v = p.variants.find((x) => x.stock > 0); if (!v) return;
    cart.add({ variantId: v.id, productId: p.id, slug: p.slug, title: p.title, image: p.images[0], price: v.price, qty: 1, options: v.options });
  };
  return (
    <article className={cls(s)} style={vars(s)}>
      <A to={'/product/' + p.slug}>
        <div className="sf-ratio" style={{ aspectRatio: s.ratio }}>
          {s.showBadge && p.badge ? <span className={'sf-badge ' + p.badge}>{{ new: 'جديد', sale: 'خصم', soldout: 'نفد' }[p.badge]}</span> : null}
          <Img src={p.images[0]} alt={p.title} />
          {s.hoverEffect === 'swap' && p.images[1] ? <img className="sf-img alt" style={{ position: 'absolute', inset: 0 }} src={safeUrl(p.images[1])} alt="" loading="lazy" /> : null}
        </div>
      </A>
      <div className="info">
        {s.showBrand && p.brand ? <span className="brand">{p.brand}</span> : null}
        <A to={'/product/' + p.slug} className="t">{p.title}</A>
        {s.showRating && p.rating ? <Stars v={p.rating} /> : null}
        {s.showPrice ? <Price price={p.price} compareAt={p.compareAt} /> : null}
        {s.showAddToCart ? <button className="sf-btn sm" disabled={sold} onClick={quick} style={{ marginTop: 6 }}>{sold ? 'غير متوفر' : 'أضف للسلة'}</button> : null}
      </div>
    </article>
  );
}

export function CollectionCard({ c, preset }: { c: Collection; preset?: string }) {
  const s = useCardSettings('collection', preset);
  return (
    <A to={'/collection/' + c.slug} className={'sf-ccard ' + (s.align === 'center' ? 'center' : '')} style={vars(s)}>
      <div className="sf-ratio" style={{ aspectRatio: s.ratio }}><Img src={c.image || ''} alt={c.title} /></div>
      <div className="over">{c.title}</div>
    </A>
  );
}

export function PostCard({ p, preset }: { p: Post; preset?: string }) {
  const s = useCardSettings('blog', preset);
  return (
    <article className={cls(s)} style={vars(s)}>
      <A to={'/blog/' + p.slug}><div className="sf-ratio" style={{ aspectRatio: s.ratio }}><Img src={p.cover || ''} alt={p.title} /></div></A>
      <div className="info"><span className="brand">{p.date ? new Date(p.date).toLocaleDateString('ar-EG-u-nu-latn') : ''}</span><A to={'/blog/' + p.slug} className="t">{p.title}</A><p className="sf-muted" style={{ fontSize: 14 }}>{p.excerpt}</p></div>
    </article>
  );
}
