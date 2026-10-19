import type { CardPreset, CardSettings, Draft, Menu, Page, PageType, Section, ThemeTokens } from './types';
import { newSection } from './registry';
import { uid } from './util';

export const DEFAULT_THEME: ThemeTokens = {
  colors: { bg: '#ffffff', surface: '#f6f6f8', text: '#15151c', muted: '#6b6b7a', primary: '#5b3df5', primaryText: '#ffffff', accent: '#ff6a3d', border: '#e6e6ec', sale: '#e5484d' },
  fonts: { heading: 'Cairo', body: 'Cairo' }, radius: 12, container: 1200, density: 'normal', buttonStyle: 'solid', buttonShape: 'rounded',
};
export const FONT_CHOICES = ['Cairo', 'Tajawal', 'IBM Plex Sans Arabic', 'Almarai', 'Readex Pro', 'system-ui'];

export const DEFAULT_CARD: CardSettings = {
  ratio: '4/5', imageFit: 'cover', hoverEffect: 'zoom', align: 'start', showPrice: true, showBadge: true, showRating: false, showAddToCart: true, showBrand: false, border: false, shadow: 'none', radius: 12,
};

export const THEME_PRESETS: { name: string; theme: Partial<ThemeTokens> & { colors: ThemeTokens['colors'] } }[] = [
  { name: 'بنفسجي حيوي', theme: { colors: DEFAULT_THEME.colors } },
  { name: 'أسود أنيق', theme: { colors: { bg: '#ffffff', surface: '#f4f4f4', text: '#111111', muted: '#6f6f6f', primary: '#111111', primaryText: '#ffffff', accent: '#c8a45c', border: '#e4e4e4', sale: '#d93025' } } },
  { name: 'أخضر طازج', theme: { colors: { bg: '#fcfdf9', surface: '#f0f6e8', text: '#17251a', muted: '#5f6f62', primary: '#1f9d55', primaryText: '#ffffff', accent: '#f59e0b', border: '#dfe9d5', sale: '#dc2626' } } },
  { name: 'ليلي', theme: { colors: { bg: '#0d0d14', surface: '#171722', text: '#f2f2f7', muted: '#9a9ab0', primary: '#7c5cff', primaryText: '#ffffff', accent: '#2dd4bf', border: '#26263a', sale: '#fb7185' } } },
  { name: 'أزرق نقي', theme: { colors: { bg: '#ffffff', surface: '#f1f6ff', text: '#0f1b33', muted: '#5b6b88', primary: '#1d6bff', primaryText: '#ffffff', accent: '#ff7a1a', border: '#dde7fb', sale: '#e5484d' } } },
  { name: 'وردي ناعم', theme: { colors: { bg: '#fffafb', surface: '#fff0f3', text: '#2a1520', muted: '#86616f', primary: '#e11d74', primaryText: '#ffffff', accent: '#8b5cf6', border: '#f6dce4', sale: '#be123c' } } },
];

const cards = (): CardPreset[] => [
  { id: uid(), kind: 'product', name: 'منتج — افتراضي', settings: { ...DEFAULT_CARD }, isDefault: true },
  { id: uid(), kind: 'product', name: 'منتج — بسيط', settings: { ...DEFAULT_CARD, ratio: '1/1', hoverEffect: 'none', showAddToCart: false, align: 'center', border: false }, isDefault: false },
  { id: uid(), kind: 'product', name: 'منتج — بطاقة', settings: { ...DEFAULT_CARD, border: true, shadow: 'sm', radius: 16, showRating: true }, isDefault: false },
  { id: uid(), kind: 'collection', name: 'قسم — افتراضي', settings: { ...DEFAULT_CARD, ratio: '1/1', showPrice: false, showAddToCart: false, align: 'center' }, isDefault: true },
  { id: uid(), kind: 'blog', name: 'مقال — افتراضي', settings: { ...DEFAULT_CARD, ratio: '16/9', showPrice: false, showAddToCart: false }, isDefault: true },
];

const menus = (): Menu[] => [
  { handle: 'main', title: 'القائمة الرئيسية', items: [
    { label: 'الرئيسية', linkType: 'url', linkRef: '/', children: [] },
    { label: 'المتجر', linkType: 'url', linkRef: '/collection/all', children: [] },
    { label: 'المدونة', linkType: 'url', linkRef: '/blog', children: [] },
    { label: 'تواصل معنا', linkType: 'page', linkRef: 'contact', children: [] }] },
  { handle: 'footer', title: 'قائمة التذييل', items: [
    { label: 'سياسة الاسترجاع', linkType: 'page', linkRef: 'returns', children: [] },
    { label: 'الشروط والأحكام', linkType: 'page', linkRef: 'terms', children: [] },
    { label: 'تواصل معنا', linkType: 'page', linkRef: 'contact', children: [] }] },
];

const SYSTEM: { type: PageType; title: string; slug: string; main: string }[] = [
  { type: 'collection', title: 'القسم', slug: 'collection', main: 'collection-main' },
  { type: 'product', title: 'المنتج', slug: 'product', main: 'product-main' },
  { type: 'cart', title: 'السلة', slug: 'cart', main: 'cart-main' },
  { type: 'checkout', title: 'إتمام الطلب', slug: 'checkout', main: 'checkout-main' },
  { type: 'search', title: 'البحث', slug: 'search', main: 'search-main' },
  { type: 'blog', title: 'المدونة', slug: 'blog', main: 'blog-main' },
  { type: 'article', title: 'المقال', slug: 'article', main: 'article-main' },
  { type: 'account', title: 'حسابي', slug: 'account', main: 'account-main' },
];

const page = (type: PageType, title: string, slug: string, sections: Section[], system = true): Page =>
  ({ id: uid(), type, title, slug, enabled: true, system, seo: {}, sections });

function systemPages(): Page[] {
  return SYSTEM.map((s) => {
    const secs = [newSection(s.main)];
    if (s.type === 'product') secs.push(newSection('product-reviews'), newSection('related-products'));
    return page(s.type, s.title, s.slug, secs);
  });
}
function textPage(title: string, slug: string, text: string): Page {
  return page('custom', title, slug, [newSection('rich-text', { title, text })], false);
}
function extraPages(contact: string): Page[] {
  return [
    textPage('تواصل معنا', 'contact', contact),
    textPage('سياسة الاسترجاع', 'returns', 'يمكنك استرجاع المنتج خلال 7 أيام من الاستلام بشرط أن يكون بحالته الأصلية.'),
    textPage('الشروط والأحكام', 'terms', 'باستخدامك المتجر فإنك توافق على الشروط والأحكام الموضحة هنا.'),
  ];
}
function layout(announce: string, headerOver: Record<string, any> = {}, footerOver: Record<string, any> = {}) {
  return {
    announcement: [newSection('announcement-bar', { text: announce })],
    header: [newSection('header', headerOver)],
    footer: [newSection('footer', footerOver)],
  };
}

export interface TemplateDef { slug: string; name: string; category: string; description: string; sort: number; premium?: boolean; build: () => Draft; }

export const TEMPLATES: TemplateDef[] = [
  {
    slug: 'blank', name: 'صفحة بيضاء', category: 'general', sort: 0, description: 'ابدأ من الصفر: ترويسة وتذييل وصفحات النظام فقط.',
    build: () => ({
      theme: { ...DEFAULT_THEME }, cardPresets: cards(), menus: menus(), layout: layout('مرحباً بكم في متجرنا'),
      pages: [page('home', 'الرئيسية', 'home', [newSection('hero'), newSection('featured-products')]), ...systemPages(), ...extraPages('راسلنا وسنرد عليك قريباً.')],
    }),
  },
  {
    slug: 'elegance', name: 'أناقة', category: 'fashion', sort: 1, description: 'متجر أزياء بصور كبيرة وبطاقات هادئة.',
    build: () => ({
      theme: { ...DEFAULT_THEME, colors: THEME_PRESETS[1].theme.colors, radius: 4, buttonShape: 'square', density: 'airy' },
      cardPresets: cards().map((c) => (c.kind === 'product' && c.isDefault ? { ...c, settings: { ...c.settings, ratio: '3/4', hoverEffect: 'swap', align: 'center', radius: 2 } } : c)),
      menus: menus(), layout: layout('توصيل مجاني للطلبات فوق 100$', { layout: 'logo-center' }),
      pages: [
        page('home', 'الرئيسية', 'home', [
          newSection('slideshow'), newSection('collection-list', { title: 'تسوّق حسب القسم' }), newSection('featured-products', { title: 'وصل حديثاً', sort: 'newest' }),
          newSection('image-with-text', { title: 'تفاصيل تصنع الفرق', text: 'نختار الأقمشة والخياطة بعناية لنقدم قطعاً تدوم.', cta: 'اكتشف المزيد', href: '/collection/all' }),
          newSection('testimonials'), newSection('newsletter')]),
        ...systemPages(), ...extraPages('راسلنا على البريد أو واتساب وسنرد خلال 24 ساعة.'),
      ],
    }),
  },
  {
    slug: 'techno', name: 'تقنو', category: 'electronics', sort: 2, description: 'داكن وحديث للإلكترونيات والأجهزة.',
    build: () => ({
      theme: { ...DEFAULT_THEME, colors: THEME_PRESETS[3].theme.colors, radius: 14, buttonShape: 'pill' },
      cardPresets: cards().map((c) => (c.kind === 'product' && c.isDefault ? { ...c, settings: { ...c.settings, ratio: '1/1', imageFit: 'contain', border: true, showRating: true } } : c)),
      menus: menus(), layout: layout('عروض الأسبوع على الأجهزة الذكية', { tone: 'surface' }),
      pages: [
        page('home', 'الرئيسية', 'home', [
          newSection('hero', { title: 'أحدث التقنيات بين يديك', text: 'أجهزة أصلية بضمان معتمد وتوصيل سريع.', eyebrow: 'جديد' }), newSection('features'),
          newSection('featured-products', { title: 'الأكثر طلباً', sort: 'best', columns: '4' }), newSection('countdown'), newSection('product-carousel', { title: 'وصل حديثاً', sort: 'newest' }), newSection('faq')]),
        ...systemPages(), ...extraPages('فريق الدعم متاح يومياً.'),
      ],
    }),
  },
  {
    slug: 'fresh', name: 'طازج', category: 'grocery', sort: 3, description: 'بقالة وأغذية: ألوان خضراء وبطاقات مدمجة.',
    build: () => ({
      theme: { ...DEFAULT_THEME, colors: THEME_PRESETS[2].theme.colors, radius: 16, density: 'compact' },
      cardPresets: cards().map((c) => (c.kind === 'product' && c.isDefault ? { ...c, settings: { ...c.settings, ratio: '1/1', border: true, shadow: 'sm', radius: 16 } } : c)),
      menus: menus(), layout: layout('توصيل خلال ساعتين داخل المدينة'),
      pages: [
        page('home', 'الرئيسية', 'home', [
          newSection('image-banner', { title: 'منتجات طازجة كل يوم', text: 'من المزرعة إلى باب بيتك', cta: 'اطلب الآن' }), newSection('collection-list', { title: 'الأقسام', columns: '4' }),
          newSection('featured-products', { title: 'عروض اليوم', columns: '5', limit: 10 }), newSection('features'), newSection('cta-banner', { title: 'وفّر أكثر مع الاشتراك الأسبوعي' })]),
        ...systemPages(), ...extraPages('اتصل بنا لأي استفسار.'),
      ],
    }),
  },
];

export function templateDraft(slug: string): Draft {
  return (TEMPLATES.find((t) => t.slug === slug) ?? TEMPLATES[0]).build();
}
