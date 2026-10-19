import { Component, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { Collection, DataAdapter, Product, Section, Snapshot } from '../core/types';
import { REGISTRY } from '../core/registry';
import { useCart } from './cart';
import { StoreCtx, parsePath, resolveLink, useStoreCtx, type Ctx } from './ctx';
import { ensureFonts, themeVars } from './theme';
import * as S1 from './sections1';
import * as S2 from './sections2';
import './storefront.css';

const COMPONENTS: Record<string, ComponentType<S1.SP>> = {
  hero: S1.Hero, slideshow: S1.Slideshow, 'image-banner': S1.ImageBanner, 'cta-banner': S1.CtaBanner, 'rich-text': S1.RichText, 'page-content': S1.PageContent,
  'image-with-text': S1.ImageWithText, features: S1.Features, 'collection-list': S1.CollectionList, 'featured-products': S1.FeaturedProducts, 'product-carousel': S1.ProductCarousel,
  'related-products': S1.RelatedProducts, testimonials: S1.Testimonials, faq: S1.Faq, newsletter: S1.Newsletter, countdown: S1.Countdown, 'brand-logos': S1.BrandLogos,
  video: S1.VideoSection, gallery: S1.Gallery, 'contact-form': S1.ContactForm, stats: S1.Stats, 'blog-posts': S1.BlogPosts, spacer: S1.Spacer,
  'collection-main': S2.CollectionMain, 'product-main': S2.ProductMain, 'product-reviews': S2.ProductReviews, 'cart-main': S2.CartMain, 'checkout-main': S2.CheckoutMain,
  'search-main': S2.SearchMain, 'blog-main': S2.BlogMain, 'article-main': S2.ArticleMain, 'account-main': S2.AccountMain,
};

class Boundary extends Component<{ children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch(e: unknown) { console.error('section failed', e); }
  render() { return this.state.bad ? <div className="sf-empty">تعذّر عرض هذا القسم</div> : this.props.children; }
}

function SectionView({ s }: { s: Section }) {
  const ctx = useStoreCtx(); const ed = ctx.editor;
  if (!s.visible && !ed) return null;
  const C = COMPONENTS[s.type]; const st = s.settings || {}; const blocks = s.blocks.filter((b) => b.visible || ed);
  if (!C) return ed ? <div className="sf-empty">مكوّن غير معروف: {s.type}</div> : null;
  const label = REGISTRY[s.type]?.name || s.type;
  return (
    <section id={'s-' + s.id} className={`sf-sec pad-${st.padY || 'md'} bg-${st.bg || 'none'} w-${st.width || 'container'} ${ed && !s.visible ? 'hidden-sec' : ''} ${ed?.selected === s.id ? 'selected' : ''}`} data-sid={s.id} data-label={label}
      onClick={ed ? (e) => { e.stopPropagation(); ed.select(s.id); } : undefined}>
      <div className="sf-in"><Boundary key={s.id + JSON.stringify(st).length}><C s={s} st={st} blocks={blocks} /></Boundary></div>
    </section>
  );
}

function Chrome({ s, kind }: { s: Section; kind: 'announcement' | 'header' | 'footer' }) {
  const ed = useStoreCtx().editor;
  if (!s.visible && !ed) return null;
  const st = s.settings || {}; const blocks = s.blocks.filter((b) => b.visible);
  const el = kind === 'announcement' ? <S2.Announcement st={st} /> : kind === 'header' ? <S2.Header st={st} /> : <S2.Footer s={s} st={st} blocks={blocks} />;
  return <div className={`sf-hdr-wrap ${ed?.selected === s.id ? 'selected' : ''}`} data-sid={s.id} data-label={REGISTRY[s.type]?.name || kind} onClick={ed ? (e) => { e.stopPropagation(); ed.select(s.id); } : undefined}>{el}</div>;
}

export interface StorefrontProps {
  snap: Snapshot; adapter: DataAdapter; mode: 'live' | 'preview' | 'editor'; path: string; onNavigate: (path: string) => void; base?: string;
  editor?: Ctx['editor']; seo?: boolean;
}

export function Storefront({ snap, adapter, mode, path, onNavigate, base = '', editor, seo }: StorefrontProps) {
  const cart = useCart(snap.store.id);
  const route = useMemo(() => parsePath(snap, path), [snap, path]);
  const [product, setProduct] = useState<Product | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);

  useEffect(() => { ensureFonts(snap.theme); }, [snap.theme.fonts.heading, snap.theme.fonts.body]);
  useEffect(() => {
    let live = true; setProduct(null); setCollection(null);
    if (route.type === 'product') {
      (route.slug && !(mode === 'editor' && route.slug === '__first') ? adapter.product(route.slug) : adapter.products({ limit: 1 }).then((r) => r.items[0] ?? null)).then((p) => live && setProduct(p)).catch(() => undefined);
    } else if (route.type === 'collection') adapter.collection(route.slug || 'all').then((c) => live && setCollection(c)).catch(() => undefined);
    return () => { live = false; };
  }, [adapter, route.type, route.slug, mode]);

  // editor has no URL: product/collection pages preview the first product / all products
  const effRoute = route;
  const ctx: Ctx = {
    snap, adapter, mode, base, route: effRoute, go: onNavigate, href: (p) => base + (p || '/'),
    linkFor: (m) => resolveLink(snap, m), menu: (h) => snap.menus.find((m) => m.handle === h), cart, product, collection, editor,
  };

  useEffect(() => {
    if (!seo) return;
    const pg = route.page; const t = pg?.seo?.title || (product?.title ?? collection?.title ?? pg?.title);
    document.title = t && route.type !== 'home' ? `${t} — ${snap.store.name}` : snap.store.name;
    const d = pg?.seo?.description || product?.description?.slice(0, 160) || '';
    let m = document.querySelector('meta[name=description]') as HTMLMetaElement | null;
    if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
    m.content = d;
    if (snap.store.faviconUrl) { const l = (document.querySelector('link[rel=icon]') as HTMLLinkElement) || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' })); l.href = snap.store.faviconUrl; }
  }, [seo, route.page?.id, product?.id, collection?.id, snap.store.name]);

  useEffect(() => { if (mode === 'live') window.scrollTo?.(0, 0); }, [path, mode]);

  const page = route.page;
  const th = snap.theme;
  return (
    <StoreCtx.Provider value={ctx}>
      <div className={'sf ' + (editor ? 'sf-edit' : '')} dir={snap.store.direction} data-density={th.density} data-btn={th.buttonStyle} style={themeVars(th) as any} onClick={editor ? () => editor.select(null) : undefined}>
        {snap.layout.announcement.map((s) => <Chrome key={s.id} s={s} kind="announcement" />)}
        {snap.layout.header.map((s) => <Chrome key={s.id} s={s} kind="header" />)}
        <main>
          {page ? page.sections.map((s) => <SectionView key={s.id} s={s} />) : (
            <div className="sf-empty" style={{ padding: '90px 20px' }}><h2>الصفحة غير موجودة</h2><a className="sf-btn" href={base + '/'} onClick={(e) => { e.preventDefault(); onNavigate('/'); }}>الرئيسية</a></div>)}
        </main>
        {snap.layout.footer.map((s) => <Chrome key={s.id} s={s} kind="footer" />)}
      </div>
    </StoreCtx.Provider>
  );
}
