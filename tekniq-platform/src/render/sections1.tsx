import { useEffect, useMemo, useState } from 'react';
import type { Block, Section } from '../core/types';
import { safeUrl } from '../core/util';
import { CollectionCard, PostCard, ProductCard } from './cards';
import { useAsync, useStoreCtx } from './ctx';
import { A, Icon, Img, Skeleton, Title } from './ui';

export interface SP { s: Section; st: Record<string, any>; blocks: Block[]; }
const vis = (s: Section) => s.blocks.filter((b) => b.visible);
export const cols = (v: any, d = 4) => ({ ['--cols' as any]: Number(v) || d });

export function Hero({ st }: SP) {
  return (
    <div className={`sf-hero h-${st.height || 'md'} ${st.align === 'center' ? 'center' : ''}`}>
      <div className="bg">{st.image ? <img src={safeUrl(st.image)} alt="" loading="eager" /> : <div className="sf-ph" style={{ width: '100%', height: '100%' }} />}</div>
      <div className="shade" style={{ opacity: (st.overlay ?? 35) / 100 }} />
      <div className="body">
        {st.eyebrow ? <span className="sf-eyebrow">{st.eyebrow}</span> : null}
        <h1>{st.title}</h1>{st.text ? <p>{st.text}</p> : null}
        <div className="sf-btns">{st.cta ? <A to={st.href || '/'} className="sf-btn light">{st.cta}</A> : null}{st.cta2 ? <A to={st.href2 || '/'} className="sf-btn hollow">{st.cta2}</A> : null}</div>
      </div>
    </div>
  );
}

export function Slideshow({ s, st, blocks }: SP) {
  const [i, setI] = useState(0); const n = blocks.length;
  const ed = useStoreCtx().mode === 'editor';
  useEffect(() => { if (!st.autoplay || n < 2 || ed) return; const t = setInterval(() => setI((x) => (x + 1) % n), Math.max(2, st.interval || 5) * 1000); return () => clearInterval(t); }, [st.autoplay, st.interval, n, ed]);
  if (!n) return <div className="sf-empty">أضف شرائح من لوحة التحرير</div>;
  return (
    <div className="sf-slides">
      <div className="sf-slide-track" style={{ transform: `translateX(${i * 100}%)` }}>
        {blocks.map((b) => (
          <div className="sf-slide" key={b.id}>
            <Hero s={s} blocks={[]} st={{ image: b.settings.image, title: b.settings.title, text: b.settings.text, cta: b.settings.cta, href: b.settings.href, height: st.height, overlay: 35, align: 'start' }} />
          </div>))}
      </div>
      {n > 1 ? <div className="sf-dots">{blocks.map((b, k) => <button key={b.id} className={k === i ? 'on' : ''} aria-label={'شريحة ' + (k + 1)} onClick={() => setI(k)} />)}</div> : null}
    </div>
  );
}

export function ImageBanner({ st }: SP) {
  return <Hero s={null as any} blocks={[]} st={{ ...st, height: 'sm', eyebrow: '' }} />;
}
export function CtaBanner({ st }: SP) {
  return <div className="sf-cta"><h2 className="sf-title" style={{ margin: 0 }}>{st.title}</h2>{st.text ? <p>{st.text}</p> : null}{st.cta ? <A to={st.href || '/'} className="sf-btn">{st.cta}</A> : null}</div>;
}
export function RichText({ st }: SP) {
  return <div className={`sf-rt ${st.maxw === 'wide' ? '' : 'narrow'} ${st.align === 'center' ? 'center' : ''}`}>{st.title ? <h2 className="sf-title" style={{ margin: 0 }}>{st.title}</h2> : null}<p className="p">{st.text}</p></div>;
}
export function PageContent({ st }: SP) { return <RichText s={null as any} blocks={[]} st={{ ...st, maxw: 'narrow' }} />; }
export function ImageWithText({ st }: SP) {
  return (
    <div className={`sf-iwt ${st.side === 'end' ? 'end' : ''}`}>
      <div className="m sf-ratio" style={{ aspectRatio: st.ratio || '4/5', borderRadius: 'var(--radius)' }}><Img src={st.image} alt={st.title} /></div>
      <div className="txt"><h2 className="sf-title" style={{ margin: 0 }}>{st.title}</h2><p className="p">{st.text}</p>{st.cta ? <A to={st.href || '/'} className="sf-btn">{st.cta}</A> : null}</div>
    </div>
  );
}
export function Features({ st, blocks }: SP) {
  return (<><Title>{st.title}</Title><div className="sf-grid" style={cols(st.columns, 4)}>{blocks.map((b) => (
    <div key={b.id} className={'sf-feat ' + (st.style === 'card' ? 'card' : '')}><div className="ic"><Icon n={b.settings.icon} /></div><h3>{b.settings.title}</h3><p>{b.settings.text}</p></div>))}</div></>);
}
export function CollectionList({ st }: SP) {
  const { adapter } = useStoreCtx(); const { data, loading } = useAsync(() => adapter.collections(), [adapter]);
  return (<><Title>{st.title}</Title>{loading ? <Skeleton n={4} cols={Number(st.columns) || 4} /> : <div className="sf-grid" style={cols(st.columns, 4)}>{(data || []).slice(0, st.limit || 4).map((c) => <CollectionCard key={c.id} c={c} />)}</div>}</>);
}
function useProducts(st: Record<string, any>, extra: Record<string, any> = {}) {
  const { adapter } = useStoreCtx();
  return useAsync(() => adapter.products({ collection: st.collection || undefined, sort: st.sort, limit: st.limit || 8, ...extra }), [adapter, st.collection, st.sort, st.limit, JSON.stringify(extra)]);
}
export function FeaturedProducts({ st }: SP) {
  const { data, loading } = useProducts(st);
  return (<><Title more={st.cta ? <A to={st.href || '/collection/all'} className="sf-more">{st.cta} ←</A> : null}>{st.title}</Title>
    {loading ? <Skeleton n={Math.min(st.limit || 4, 8)} cols={Number(st.columns) || 4} /> : !data?.items.length ? <div className="sf-empty">لا توجد منتجات بعد</div> :
      <div className="sf-grid" style={cols(st.columns, 4)}>{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}</>);
}
export function ProductCarousel({ st }: SP) {
  const { data, loading } = useProducts(st);
  return (<><Title>{st.title}</Title>{loading ? <Skeleton n={4} /> : <div className="sf-scroll">{(data?.items || []).map((p) => <ProductCard key={p.id} p={p} />)}</div>}</>);
}
export function RelatedProducts({ st }: SP) {
  const { product } = useStoreCtx();
  const { data, loading } = useProducts({ limit: st.limit || 4, sort: 'best' }, { excludeId: product?.id, collection: product?.collections?.[0] });
  if (!loading && !data?.items.length) return null;
  return (<><Title>{st.title}</Title>{loading ? <Skeleton n={4} cols={Number(st.columns) || 4} /> : <div className="sf-grid" style={cols(st.columns, 4)}>{data!.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}</>);
}
export function Testimonials({ st, blocks }: SP) {
  return (<><Title>{st.title}</Title><div className="sf-grid one-sm" style={cols(st.columns, 3)}>{blocks.map((b) => (
    <div className="sf-quote" key={b.id}><span className="sf-stars">{'★'.repeat(Math.max(1, Math.min(5, b.settings.rating || 5)))}</span><p className="q">“{b.settings.quote}”</p><div className="who">{b.settings.name} <span>{b.settings.role}</span></div></div>))}</div></>);
}
export function Faq({ st, blocks }: SP) {
  return (<><Title>{st.title}</Title><div className="sf-faq">{blocks.map((b) => <details key={b.id}><summary>{b.settings.q}</summary><div className="a">{b.settings.a}</div></details>)}</div></>);
}
export function Newsletter({ st }: SP) {
  const [done, setDone] = useState(false);
  return (<div className="sf-news"><h2 className="sf-title" style={{ margin: 0 }}>{st.title}</h2><p className="sf-muted">{st.text}</p>
    {done ? <div className="sf-ok">شكراً لاشتراكك!</div> : <form onSubmit={(e) => { e.preventDefault(); setDone(true); }}><input className="sf-input" type="email" required placeholder="بريدك الإلكتروني" /><button className="sf-btn">{st.button}</button></form>}</div>);
}
export function Countdown({ st }: SP) {
  const end = st.endsAt ? new Date(st.endsAt).getTime() : Date.now() + 3 * 864e5;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = Math.max(0, end - now); const u = [['يوم', Math.floor(d / 864e5)], ['ساعة', Math.floor(d / 36e5) % 24], ['دقيقة', Math.floor(d / 6e4) % 60], ['ثانية', Math.floor(d / 1e3) % 60]] as const;
  return (<div className="sf-count"><h2 className="sf-title" style={{ margin: 0 }}>{st.title}</h2><div className="nums">{u.map(([l, v]) => <div className="n" key={l}><b>{String(v).padStart(2, '0')}</b><small>{l}</small></div>)}</div>{st.cta ? <A to={st.href || '/'} className="sf-btn">{st.cta}</A> : null}</div>);
}
export function BrandLogos({ st, blocks }: SP) {
  return (<><Title>{st.title}</Title><div className={'sf-logos ' + (st.grayscale ? 'gray' : '')}>{blocks.map((b) => b.settings.src ? <img key={b.id} src={safeUrl(b.settings.src)} alt={b.settings.alt} loading="lazy" /> : <span className="l" key={b.id}>{b.settings.alt}</span>)}</div></>);
}
export function VideoSection({ st }: SP) {
  const u = String(st.url || ''); const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  return (<>{st.title ? <Title>{st.title}</Title> : null}<div className="sf-video" style={{ aspectRatio: st.ratio || '16/9' }}>
    {yt ? <iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} title={st.title || 'video'} allowFullScreen loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" /> : safeUrl(u) ? <video src={safeUrl(u)} poster={safeUrl(st.poster)} controls playsInline preload="none" /> : <div className="sf-ph" style={{ width: '100%', height: '100%' }} />}</div></>);
}
export function Gallery({ st, blocks }: SP) {
  return (<><Title>{st.title}</Title><div className="sf-grid" style={cols(st.columns, 3)}>{blocks.map((b) => <div key={b.id} className="sf-ratio" style={{ aspectRatio: st.ratio || '1/1', borderRadius: 'var(--radius)' }}><Img src={b.settings.src} alt={b.settings.alt} /></div>)}</div></>);
}
export function ContactForm({ st }: SP) {
  const [done, setDone] = useState(false);
  return (<div className="sf-contact"><div className="info"><h2 className="sf-title" style={{ margin: 0 }}>{st.title}</h2><p className="sf-muted">{st.text}</p>{st.phone ? <p>📞 {st.phone}</p> : null}{st.email ? <p>✉ {st.email}</p> : null}{st.address ? <p>📍 {st.address}</p> : null}</div>
    {done ? <div className="sf-ok">تم إرسال رسالتك، شكراً لك.</div> : <form onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
      <div className="sf-field"><label>الاسم</label><input className="sf-input" required /></div><div className="sf-field"><label>البريد أو الهاتف</label><input className="sf-input" required /></div>
      <div className="sf-field"><label>الرسالة</label><textarea className="sf-input" rows={4} required /></div><button className="sf-btn">إرسال</button></form>}</div>);
}
export function Stats({ st, blocks }: SP) {
  return (<>{st.title ? <Title>{st.title}</Title> : null}<div className="sf-stats">{blocks.map((b) => <div key={b.id}><b>{b.settings.value}</b><span>{b.settings.label}</span></div>)}</div></>);
}
export function BlogPosts({ st }: SP) {
  const { adapter } = useStoreCtx(); const { data, loading } = useAsync(() => adapter.posts(st.limit || 3), [adapter, st.limit]);
  return (<><Title>{st.title}</Title>{loading ? <Skeleton n={3} cols={3} /> : <div className="sf-grid one-sm" style={cols(3)}>{(data || []).map((p) => <PostCard key={p.id} p={p} />)}</div>}</>);
}
export function Spacer({ st }: SP) { return <div className="sf-in"><div style={{ height: st.height || 40, display: 'flex', alignItems: 'center' }}>{st.line ? <hr style={{ width: '100%', border: 0, borderTop: '1px solid var(--border)' }} /> : null}</div></div>; }
export { vis };
void useMemo;
