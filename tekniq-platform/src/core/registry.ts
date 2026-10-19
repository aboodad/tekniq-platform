import type { Block, PageType, Section } from './types';
import { uid } from './util';

// ---------- field schema (drives the editor inspector) ----------
export type FieldType = 'text' | 'textarea' | 'number' | 'range' | 'select' | 'color' | 'toggle' | 'image' | 'link' | 'datetime';
export interface Field {
  key: string; label: string; type: FieldType; options?: { value: string; label: string }[];
  min?: number; max?: number; step?: number; help?: string; default?: any; group?: string;
}
export interface ComponentDef {
  key: string; kind: 'section' | 'block'; name: string; category: string; icon: string; fields: Field[];
  blocks?: { allowed: string[]; label: string; max?: number };
  defaults: { settings: Record<string, any>; blocks?: { type: string; settings: Record<string, any> }[] };
  pages: 'all' | PageType[];
  region?: 'content' | 'header' | 'footer' | 'announcement';
  dataSource?: string; system?: boolean; singleton?: boolean; premium?: boolean;
}

const t = (key: string, label: string, def = '', extra: Partial<Field> = {}): Field => ({ key, label, type: 'text', default: def, ...extra });
const ta = (key: string, label: string, def = ''): Field => ({ key, label, type: 'textarea', default: def });
const img = (key: string, label: string): Field => ({ key, label, type: 'image', default: '' });
const link = (key: string, label: string, def = ''): Field => ({ key, label, type: 'link', default: def });
const col = (key: string, label: string, def = ''): Field => ({ key, label, type: 'color', default: def });
const tog = (key: string, label: string, def = true): Field => ({ key, label, type: 'toggle', default: def });
const num = (key: string, label: string, def: number, min: number, max: number, step = 1): Field => ({ key, label, type: 'range', default: def, min, max, step });
const sel = (key: string, label: string, options: [string, string][], def: string): Field => ({
  key, label, type: 'select', default: def, options: options.map(([value, label]) => ({ value, label })),
});

// Appearance fields appended to every content section
const STYLE: Field[] = [
  sel('padY', 'المسافة الرأسية', [['none', 'بدون'], ['sm', 'صغيرة'], ['md', 'متوسطة'], ['lg', 'كبيرة']], 'md'),
  sel('bg', 'الخلفية', [['none', 'شفافة'], ['surface', 'سطح'], ['primary', 'اللون الأساسي'], ['dark', 'داكنة']], 'none'),
  sel('width', 'العرض', [['container', 'ضمن الحاوية'], ['full', 'كامل']], 'container'),
].map((f) => ({ ...f, group: 'المظهر' }));

const DEFAULT_STYLE = { padY: 'md', bg: 'none', width: 'container' };
const settingsOf = (fields: Field[], extra: Record<string, any> = {}) => {
  const o: Record<string, any> = {};
  for (const f of fields) if (f.default !== undefined) o[f.key] = f.default;
  return { ...o, ...extra };
};

const defs: ComponentDef[] = [];
function section(d: Omit<ComponentDef, 'kind' | 'defaults' | 'pages'> & { pages?: ComponentDef['pages']; style?: boolean; set?: Record<string, any>; blocks_?: { type: string; settings: Record<string, any> }[] }) {
  const fields = [...d.fields, ...(d.style === false ? [] : STYLE)];
  defs.push({
    ...d, kind: 'section', fields, pages: d.pages ?? 'all', region: d.region ?? 'content',
    defaults: { settings: settingsOf(fields, d.set), blocks: d.blocks_ },
  });
}
function block(key: string, name: string, icon: string, fields: Field[], set: Record<string, any> = {}) {
  defs.push({ key, kind: 'block', name, category: 'blocks', icon, fields, pages: 'all', defaults: { settings: settingsOf(fields, set) } });
}

// ---------- blocks ----------
block('heading', 'عنوان', 'H', [t('text', 'النص', 'عنوان جديد'), sel('size', 'الحجم', [['sm', 'صغير'], ['md', 'متوسط'], ['lg', 'كبير'], ['xl', 'ضخم']], 'lg')]);
block('text', 'نص', '¶', [ta('text', 'النص', 'اكتب هنا وصفاً قصيراً.')]);
block('button', 'زر', '▭', [t('label', 'نص الزر', 'تسوّق الآن'), link('href', 'الرابط', '/collection/all'), sel('style', 'النمط', [['solid', 'ممتلئ'], ['outline', 'محدد'], ['soft', 'ناعم']], 'solid')]);
block('image', 'صورة', '▣', [img('src', 'الصورة'), t('alt', 'نص بديل'), link('href', 'الرابط')]);
block('feature', 'ميزة', '★', [sel('icon', 'الأيقونة', [['truck', 'شحن'], ['shield', 'ضمان'], ['refresh', 'استرجاع'], ['headset', 'دعم'], ['gift', 'هدية'], ['card', 'دفع'], ['star', 'نجمة'], ['heart', 'قلب']], 'star'), t('title', 'العنوان', 'ميزة'), t('text', 'الوصف', 'وصف قصير للميزة')]);
block('slide', 'شريحة', '▤', [img('image', 'الصورة'), t('title', 'العنوان', 'عرض جديد'), t('text', 'النص', 'وصف الشريحة'), t('cta', 'نص الزر', 'اكتشف'), link('href', 'الرابط', '/collection/all')]);
block('testimonial', 'رأي عميل', '❝', [ta('quote', 'الرأي', 'تجربة رائعة وخدمة سريعة.'), t('name', 'الاسم', 'عميل'), t('role', 'الصفة', ''), num('rating', 'التقييم', 5, 1, 5)]);
block('faq-item', 'سؤال', '?', [t('q', 'السؤال', 'سؤال شائع؟'), ta('a', 'الجواب', 'الجواب هنا.')]);
block('logo', 'شعار', '◎', [img('src', 'الشعار'), t('alt', 'الاسم', 'علامة'), link('href', 'الرابط')]);
block('stat', 'رقم', '#', [t('value', 'القيمة', '+1000'), t('label', 'الوصف', 'عميل سعيد')]);
block('gallery-image', 'صورة معرض', '▦', [img('src', 'الصورة'), t('alt', 'نص بديل'), link('href', 'الرابط')]);
block('footer-column', 'عمود روابط', '☰', [t('title', 'العنوان', 'روابط'), sel('menu', 'القائمة', [['main', 'القائمة الرئيسية'], ['footer', 'قائمة التذييل']], 'footer')]);
block('footer-text', 'نص تعريفي', '¶', [t('title', 'العنوان', 'عن المتجر'), ta('text', 'النص', 'نبذة قصيرة عن متجرنا.')]);
block('social', 'حساب اجتماعي', '@', [sel('network', 'الشبكة', [['instagram', 'انستغرام'], ['facebook', 'فيسبوك'], ['x', 'X'], ['tiktok', 'تيك توك'], ['whatsapp', 'واتساب'], ['snapchat', 'سناب']], 'instagram'), link('href', 'الرابط', 'https://')]);

// ---------- layout sections ----------
section({ key: 'announcement-bar', name: 'شريط الإعلان', category: 'layout', icon: '📣', region: 'announcement', style: false, singleton: true,
  fields: [t('text', 'النص', 'شحن مجاني للطلبات فوق 50$'), link('href', 'الرابط'), sel('tone', 'اللون', [['primary', 'الأساسي'], ['dark', 'داكن'], ['accent', 'مميز']], 'dark'), tog('closable', 'قابل للإغلاق', true)] });
section({ key: 'header', name: 'الترويسة', category: 'layout', icon: '▔', region: 'header', style: false, singleton: true,
  fields: [sel('layout', 'التخطيط', [['logo-start', 'الشعار يمين'], ['logo-center', 'الشعار في الوسط']], 'logo-start'), sel('menu', 'القائمة', [['main', 'القائمة الرئيسية'], ['footer', 'قائمة التذييل']], 'main'),
    tog('showSearch', 'زر البحث', true), tog('showCart', 'أيقونة السلة', true), tog('sticky', 'تثبيت أعلى الصفحة', true), sel('tone', 'اللون', [['surface', 'سطح'], ['primary', 'الأساسي'], ['transparent', 'شفاف']], 'surface')] });
section({ key: 'footer', name: 'التذييل', category: 'layout', icon: '▁', region: 'footer', style: false, singleton: true,
  fields: [ta('copyright', 'حقوق النشر', '© جميع الحقوق محفوظة'), tog('showPayments', 'عرض وسائل الدفع', true), tog('showNewsletter', 'نموذج النشرة', true)],
  blocks: { allowed: ['footer-text', 'footer-column', 'social'], label: 'أعمدة التذييل', max: 6 },
  blocks_: [{ type: 'footer-text', settings: {} }, { type: 'footer-column', settings: {} }, { type: 'social', settings: { network: 'instagram' } }] });

// ---------- content sections (free) ----------
section({ key: 'hero', name: 'غلاف رئيسي', category: 'hero', icon: '🖼', pages: ['home', 'custom'],
  fields: [img('image', 'صورة الخلفية'), t('eyebrow', 'عنوان صغير', 'مجموعة جديدة'), t('title', 'العنوان', 'اكتشف أفضل المنتجات'), ta('text', 'النص', 'تشكيلة مختارة بعناية بأسعار مناسبة وتوصيل سريع.'),
    t('cta', 'نص الزر', 'تسوّق الآن'), link('href', 'رابط الزر', '/collection/all'), t('cta2', 'الزر الثاني', ''), link('href2', 'رابط الثاني', ''),
    sel('height', 'الارتفاع', [['sm', 'قصير'], ['md', 'متوسط'], ['lg', 'طويل']], 'md'), sel('align', 'المحاذاة', [['start', 'يمين'], ['center', 'وسط']], 'start'), num('overlay', 'تعتيم الصورة', 35, 0, 80, 5)],
  set: { padY: 'none', width: 'full' } });
section({ key: 'slideshow', name: 'عرض شرائح', category: 'hero', icon: '🎞', pages: ['home', 'custom'],
  fields: [tog('autoplay', 'تشغيل تلقائي', true), num('interval', 'مدة الشريحة (ثانية)', 5, 2, 12), sel('height', 'الارتفاع', [['sm', 'قصير'], ['md', 'متوسط'], ['lg', 'طويل']], 'md')],
  blocks: { allowed: ['slide'], label: 'الشرائح', max: 8 }, blocks_: [{ type: 'slide', settings: {} }, { type: 'slide', settings: { title: 'تخفيضات الموسم', text: 'خصم حتى 40%' } }],
  set: { padY: 'none', width: 'full' } });
section({ key: 'image-banner', name: 'بانر صورة', category: 'hero', icon: '🏞', fields: [img('image', 'الصورة'), t('title', 'العنوان', 'عرض خاص'), t('text', 'النص', ''), t('cta', 'نص الزر', 'اطّلع'), link('href', 'الرابط', '/collection/all'), num('overlay', 'تعتيم', 30, 0, 80, 5), sel('align', 'المحاذاة', [['start', 'يمين'], ['center', 'وسط']], 'center')] });
section({ key: 'cta-banner', name: 'دعوة لإجراء', category: 'marketing', icon: '📢', fields: [t('title', 'العنوان', 'جاهز للبدء؟'), t('text', 'النص', 'انضم إلى آلاف العملاء اليوم.'), t('cta', 'نص الزر', 'ابدأ الآن'), link('href', 'الرابط', '/collection/all')], set: { bg: 'primary' } });
section({ key: 'rich-text', name: 'نص منسّق', category: 'content', icon: '📝', fields: [t('title', 'العنوان', ''), ta('text', 'النص', 'اكتب محتواك هنا. افصل الفقرات بسطر فارغ.'), sel('align', 'المحاذاة', [['start', 'يمين'], ['center', 'وسط']], 'start'), sel('maxw', 'عرض النص', [['narrow', 'ضيق'], ['wide', 'واسع']], 'narrow')] });
section({ key: 'image-with-text', name: 'صورة مع نص', category: 'content', icon: '◧', fields: [img('image', 'الصورة'), t('title', 'العنوان', 'قصتنا'), ta('text', 'النص', 'نص تعريفي قصير يشرح فكرة المتجر.'), t('cta', 'نص الزر', ''), link('href', 'الرابط', ''), sel('side', 'موضع الصورة', [['start', 'يمين'], ['end', 'يسار']], 'start'), sel('ratio', 'نسبة الصورة', [['1/1', '1:1'], ['4/5', '4:5'], ['16/10', '16:10']], '4/5')] });
section({ key: 'features', name: 'مزايا المتجر', category: 'content', icon: '✨', fields: [t('title', 'العنوان', ''), sel('columns', 'الأعمدة', [['2', '2'], ['3', '3'], ['4', '4']], '4'), sel('style', 'الشكل', [['plain', 'بسيط'], ['card', 'بطاقات']], 'card')],
  blocks: { allowed: ['feature'], label: 'المزايا', max: 8 },
  blocks_: [{ type: 'feature', settings: { icon: 'truck', title: 'شحن سريع', text: 'توصيل لكل المحافظات' } }, { type: 'feature', settings: { icon: 'shield', title: 'دفع آمن', text: 'خيارات دفع متعددة' } }, { type: 'feature', settings: { icon: 'refresh', title: 'استرجاع سهل', text: 'خلال 7 أيام' } }, { type: 'feature', settings: { icon: 'headset', title: 'دعم متواصل', text: 'نرد على استفساراتك' } }] });
section({ key: 'collection-list', name: 'قائمة الأقسام', category: 'catalog', icon: '🗂', dataSource: 'collections.all', fields: [t('title', 'العنوان', 'تسوّق حسب القسم'), num('limit', 'العدد', 4, 2, 12), sel('columns', 'الأعمدة', [['2', '2'], ['3', '3'], ['4', '4']], '4')] });
section({ key: 'featured-products', name: 'منتجات مميزة', category: 'catalog', icon: '🛍', dataSource: 'products.list', fields: [t('title', 'العنوان', 'منتجات مميزة'), t('collection', 'القسم (slug)', ''), sel('sort', 'الترتيب', [['manual', 'يدوي'], ['newest', 'الأحدث'], ['best', 'الأكثر مبيعاً'], ['price_asc', 'السعر ↑'], ['price_desc', 'السعر ↓']], 'newest'), num('limit', 'العدد', 8, 2, 24), sel('columns', 'الأعمدة', [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], '4'), t('cta', 'رابط عرض الكل', 'عرض الكل'), link('href', 'الرابط', '/collection/all')] });
section({ key: 'product-carousel', name: 'شريط منتجات', category: 'catalog', icon: '↔', dataSource: 'products.list', fields: [t('title', 'العنوان', 'الأكثر مبيعاً'), t('collection', 'القسم (slug)', ''), sel('sort', 'الترتيب', [['newest', 'الأحدث'], ['best', 'الأكثر مبيعاً'], ['price_asc', 'السعر ↑']], 'best'), num('limit', 'العدد', 10, 3, 24)] });
section({ key: 'testimonials', name: 'آراء العملاء', category: 'social', icon: '💬', fields: [t('title', 'العنوان', 'ماذا يقول عملاؤنا'), sel('columns', 'الأعمدة', [['1', '1'], ['2', '2'], ['3', '3']], '3')],
  blocks: { allowed: ['testimonial'], label: 'الآراء', max: 9 }, blocks_: [{ type: 'testimonial', settings: {} }, { type: 'testimonial', settings: { name: 'سارة', quote: 'جودة ممتازة وتغليف أنيق.' } }, { type: 'testimonial', settings: { name: 'خالد', quote: 'وصل الطلب بسرعة.' } }] });
section({ key: 'faq', name: 'الأسئلة الشائعة', category: 'content', icon: '❓', fields: [t('title', 'العنوان', 'الأسئلة الشائعة')], blocks: { allowed: ['faq-item'], label: 'الأسئلة', max: 20 },
  blocks_: [{ type: 'faq-item', settings: { q: 'كم يستغرق التوصيل؟', a: 'من يومين إلى 5 أيام عمل.' } }, { type: 'faq-item', settings: { q: 'هل يمكن الاسترجاع؟', a: 'نعم خلال 7 أيام من الاستلام.' } }] });
section({ key: 'newsletter', name: 'النشرة البريدية', category: 'marketing', icon: '✉', fields: [t('title', 'العنوان', 'اشترك بالنشرة'), t('text', 'النص', 'ليصلك كل جديد وعروض حصرية.'), t('button', 'نص الزر', 'اشتراك')], set: { bg: 'surface' } });
section({ key: 'countdown', name: 'عدّاد تنازلي', category: 'marketing', icon: '⏱', fields: [t('title', 'العنوان', 'ينتهي العرض خلال'), { key: 'endsAt', label: 'ينتهي في', type: 'datetime', default: '' }, t('cta', 'نص الزر', 'تسوّق'), link('href', 'الرابط', '/collection/all')], set: { bg: 'dark' } });
section({ key: 'brand-logos', name: 'شعارات الشركاء', category: 'social', icon: '🏷', fields: [t('title', 'العنوان', 'علامات نتعامل معها'), tog('grayscale', 'رمادي', true)], blocks: { allowed: ['logo'], label: 'الشعارات', max: 12 }, blocks_: [{ type: 'logo', settings: { alt: 'علامة 1' } }, { type: 'logo', settings: { alt: 'علامة 2' } }, { type: 'logo', settings: { alt: 'علامة 3' } }, { type: 'logo', settings: { alt: 'علامة 4' } }] });
section({ key: 'video', name: 'فيديو', category: 'media', icon: '▶', fields: [t('title', 'العنوان', ''), link('url', 'رابط فيديو (MP4 أو YouTube)', ''), img('poster', 'صورة الغلاف'), sel('ratio', 'النسبة', [['16/9', '16:9'], ['4/3', '4:3'], ['1/1', '1:1']], '16/9')] });
section({ key: 'gallery', name: 'معرض صور', category: 'media', icon: '🖼', fields: [t('title', 'العنوان', ''), sel('columns', 'الأعمدة', [['2', '2'], ['3', '3'], ['4', '4']], '3'), sel('ratio', 'النسبة', [['1/1', '1:1'], ['4/3', '4:3'], ['3/4', '3:4']], '1/1')], blocks: { allowed: ['gallery-image'], label: 'الصور', max: 16 }, blocks_: [{ type: 'gallery-image', settings: {} }, { type: 'gallery-image', settings: {} }, { type: 'gallery-image', settings: {} }] });
section({ key: 'contact-form', name: 'نموذج تواصل', category: 'marketing', icon: '☎', fields: [t('title', 'العنوان', 'تواصل معنا'), t('text', 'النص', 'يسعدنا سماعك.'), t('email', 'بريد الاستقبال', ''), t('phone', 'رقم الهاتف', ''), t('address', 'العنوان', '')] });
section({ key: 'stats', name: 'أرقام وإحصائيات', category: 'social', icon: '📊', fields: [t('title', 'العنوان', '')], blocks: { allowed: ['stat'], label: 'الأرقام', max: 6 }, blocks_: [{ type: 'stat', settings: {} }, { type: 'stat', settings: { value: '+50', label: 'منتج' } }, { type: 'stat', settings: { value: '4.9', label: 'تقييم' } }] });
section({ key: 'blog-posts', name: 'آخر المقالات', category: 'content', icon: '📰', dataSource: 'blog.latest', pages: ['home', 'custom'], fields: [t('title', 'العنوان', 'من المدونة'), num('limit', 'العدد', 3, 1, 6)] });
section({ key: 'spacer', name: 'فاصل', category: 'layout', icon: '↕', style: false, fields: [num('height', 'الارتفاع (px)', 40, 8, 200, 4), tog('line', 'خط فاصل', false)] });

// ---------- system sections (own the logic of a system page) ----------
section({ key: 'collection-main', name: 'قائمة منتجات القسم', category: 'system', icon: '🗃', system: true, singleton: true, pages: ['collection'], dataSource: 'collection.current',
  fields: [sel('columns', 'الأعمدة', [['2', '2'], ['3', '3'], ['4', '4']], '4'), tog('showFilters', 'الترتيب والبحث', true), tog('showBanner', 'ترويسة القسم', true), num('perPage', 'منتجات بالصفحة', 12, 4, 48, 4)], style: false });
section({ key: 'product-main', name: 'تفاصيل المنتج', category: 'system', icon: '🧾', system: true, singleton: true, pages: ['product'], dataSource: 'product.current',
  fields: [sel('gallery', 'عرض الصور', [['thumbs', 'مصغرات'], ['stack', 'متتالية']], 'thumbs'), tog('showSku', 'عرض الرمز', false), tog('showShare', 'مشاركة', true)], style: false });
section({ key: 'product-reviews', name: 'تقييمات المنتج', category: 'system', icon: '⭐', system: true, pages: ['product'], dataSource: 'reviews.current', fields: [t('title', 'العنوان', 'تقييمات العملاء')] });
section({ key: 'related-products', name: 'منتجات ذات صلة', category: 'system', icon: '🔗', system: true, pages: ['product'], dataSource: 'products.related', fields: [t('title', 'العنوان', 'قد يعجبك أيضاً'), num('limit', 'العدد', 4, 2, 8), sel('columns', 'الأعمدة', [['2', '2'], ['3', '3'], ['4', '4']], '4')] });
section({ key: 'cart-main', name: 'محتوى السلة', category: 'system', icon: '🛒', system: true, singleton: true, pages: ['cart'], fields: [t('emptyText', 'نص السلة الفارغة', 'سلتك فارغة'), tog('showNotes', 'ملاحظات الطلب', true)], style: false });
section({ key: 'checkout-main', name: 'إتمام الطلب', category: 'system', icon: '💳', system: true, singleton: true, pages: ['checkout'], fields: [tog('askEmail', 'طلب البريد', false), tog('askNotes', 'ملاحظات', true), t('successText', 'رسالة النجاح', 'تم استلام طلبك، سنتواصل معك قريباً.')], style: false });
section({ key: 'search-main', name: 'نتائج البحث', category: 'system', icon: '🔍', system: true, singleton: true, pages: ['search'], fields: [sel('columns', 'الأعمدة', [['2', '2'], ['3', '3'], ['4', '4']], '4')], style: false });
section({ key: 'blog-main', name: 'قائمة المقالات', category: 'system', icon: '📚', system: true, singleton: true, pages: ['blog'], dataSource: 'blog.latest', fields: [sel('columns', 'الأعمدة', [['2', '2'], ['3', '3']], '3')], style: false });
section({ key: 'article-main', name: 'المقال', category: 'system', icon: '📄', system: true, singleton: true, pages: ['article'], fields: [], style: false });
section({ key: 'account-main', name: 'حساب العميل', category: 'system', icon: '👤', system: true, singleton: true, pages: ['account'], fields: [t('text', 'نص توضيحي', 'سجّل الدخول لمتابعة طلباتك.')], style: false });
section({ key: 'page-content', name: 'محتوى الصفحة', category: 'system', icon: '📃', system: true, pages: ['custom'], fields: [ta('text', 'المحتوى', '')] });

export const REGISTRY: Record<string, ComponentDef> = Object.fromEntries(defs.map((d) => [d.key, d]));
export const ALL_DEFS = defs;
export const def = (key: string) => REGISTRY[key];

export function newBlock(type: string, over: Record<string, any> = {}): Block {
  const d = REGISTRY[type];
  return { id: uid(), type, visible: true, settings: { ...(d?.defaults.settings ?? {}), ...over } };
}
export function newSection(type: string, over: Record<string, any> = {}): Section {
  const d = REGISTRY[type];
  return {
    id: uid(), type, visible: true, settings: { ...(d?.defaults.settings ?? {}), ...over }, dataSource: d?.dataSource ?? null,
    blocks: (d?.defaults.blocks ?? []).map((b) => newBlock(b.type, b.settings)),
  };
}

export function sectionsAddable(page: PageType): ComponentDef[] {
  return defs.filter((d) => d.kind === 'section' && d.region === 'content' && (d.pages === 'all' || d.pages.includes(page)));
}
export const CATEGORY_LABELS: Record<string, string> = {
  hero: 'الأغلفة', catalog: 'المنتجات', content: 'المحتوى', marketing: 'التسويق', social: 'الثقة', media: 'الوسائط', layout: 'التخطيط', system: 'مكوّنات الصفحة', blocks: 'عناصر',
};
export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  home: 'الرئيسية', collection: 'القسم', product: 'المنتج', cart: 'السلة', checkout: 'إتمام الطلب', search: 'البحث', blog: 'المدونة', article: 'مقال', account: 'الحساب', custom: 'صفحة مخصصة',
};
export const SYSTEM_PAGE_TYPES: PageType[] = ['home', 'collection', 'product', 'cart', 'checkout', 'search', 'blog', 'article', 'account'];
export const DATA_SOURCES = [
  { key: 'products.list', description: 'قائمة منتجات (قسم/ترتيب/عدد)' }, { key: 'products.related', description: 'منتجات ذات صلة بالمنتج الحالي' },
  { key: 'collections.all', description: 'كل الأقسام' }, { key: 'collection.current', description: 'القسم الحالي ومنتجاته' },
  { key: 'product.current', description: 'المنتج الحالي وخياراته' }, { key: 'reviews.current', description: 'تقييمات المنتج الحالي' },
  { key: 'blog.latest', description: 'آخر المقالات' }, { key: 'shipping.methods', description: 'طرق الشحن' }, { key: 'order.create', description: 'إنشاء الطلب' }, { key: 'discount.validate', description: 'التحقق من كود الخصم' },
];
