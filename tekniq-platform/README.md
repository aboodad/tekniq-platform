# منصة تكنيك — بناء المتاجر (Frontend + Supabase)

منصة متعددة المستأجرين (Multi-tenant) يبني فيها العميل **واجهة متجره فقط** (الصفحات، الألوان، الخطوط، شكل البطاقات، القوائم، هيكلة الأقسام) بمحرر بصري، وتنشره بنقرة. ربط المنتجات والطلبات والدفع بقاعدة بياناتكم يتم لاحقاً من لوحة الشركة دون المساس بتصميم العميل.

## ما الذي بداخل المشروع

| الجزء | المسار | الوصف |
|---|---|---|
| موقع المنصة + لوحة التاجر | `src/app` | تسجيل/دخول/استعادة، متاجري، متجر جديد من قالب، وسائط، نطاقات، فريق، اشتراك وفواتير، نسخ، دعم |
| المحرر البصري | `src/editor` | أقسام بالسحب والإفلات، معاينة (جوال/تابلت/حاسوب)، محرر خصائص مبني على مخطط، ألوان وخطوط، أنماط البطاقات، الصفحات و SEO، القوائم، تراجع/إعادة، حفظ تلقائي، نشر |
| عارض المتجر | `src/render` | يحوّل JSON التصميم إلى متجر (31 قسماً/نظاماً)، خفيف، Container Queries للجوال، سلة وإتمام طلب |
| لوحة الشركة | `src/admin` | إحصائيات، متاجر وحالاتها، **ربط مصدر بيانات كل متجر**، مستخدمون وأدوار، باقات، قوالب، مكوّنات، مصادر البيانات، نطاقات، فواتير، تذاكر، سجل نشاط |
| قاعدة البيانات | `supabase/migrations` | 5 ملفات: الجداول، الأمان (RLS)، الدوال (RPC)، التخزين |
| بيانات أولية | `supabase/seed.sql` | الباقات، القوالب، أنواع المكوّنات، مصادر البيانات (مولّدة من الكود) |
| توثيق النطاقات | `supabase/functions/verify-domain` | Edge Function تتحقق من DNS |

## الفكرة المعمارية
- **التصميم = بيانات**: كل متجر مستند JSON واحد (theme, cardPresets, menus, layout, pages→sections→blocks). المسودة تُحفظ في جداول علائقية، وعند «نشر» تُجمَّد نسخة في `store_versions` يقرأها الزوار فقط (آخر 30 نسخة).
- **كل كتابة تصميم تمر عبر دوال RPC** (`save_draft`, `publish_store`…) بتحقق من الصلاحية والحدود وقفل تفاؤلي (`draft_rev`)؛ الجداول نفسها للقراءة فقط عبر RLS.
- **الأقسام تطلب بياناتها بمفتاح مصدر** (`products.list`…) عبر Data Adapter بثلاث أنماط تُضبط لكل متجر من لوحة الشركة: `mock` (تجريبي) · `supabase` (جداول المنتجات والطلبات الجاهزة في 0002) · `http` (API خارجي لكم).
- الأدوار: `platform_admin` · `support` (قراءة فقط) · تاجر (`owner > editor > viewer` لكل متجر).

---

## الإعداد — ما يتبقى عليك فقط (ربط المفاتيح + النشر)

### 1) أنشئ مشروع Supabase وطبّق قاعدة البيانات
الطريقة الأسهل: افتح **SQL Editor** في المشروع وشغّل الملف الواحد:
`supabase/all-in-one.sql` (يجمع الهجرات الخمس + البيانات الأولية).

أو بالـ CLI:
```bash
supabase link --project-ref <ref>
supabase db push            # يطبّق migrations/
psql "$DATABASE_URL" -f supabase/seed.sql
```
> الملفات آمنة لإعادة تشغيل `seed.sql` (upsert)، أما الهجرات فتُطبَّق مرة واحدة على قاعدة فارغة.

### 2) إعدادات المصادقة (Authentication → URL Configuration)
- **Site URL**: عنوان المنصة، مثل `https://app.tekniq.store`
- **Redirect URLs**: أضف `https://app.tekniq.store/reset`
- (اختياري) عطّل «Confirm email» أثناء التجربة لدخول فوري، وفعّله في الإنتاج.

### 3) ضع المفاتيح في `public/config.js` (لا يحتاج إعادة بناء)
```js
window.TEKNIQ = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",            // مفتاح anon العام فقط. لا تضع service_role أبداً هنا
  ROOT_DOMAIN: "tekniq.store",            // نطاق المتاجر: <slug>.tekniq.store
  PLATFORM_HOSTS: ["app.tekniq.store"]    // الدومينات التي تخدم المنصة نفسها
};
```
وفي جدول `platform_settings` عدّل `root_domain` و `cname_target` إلى قيمكم:
```sql
update platform_settings set value = '"tekniq.store"' where key = 'root_domain';
update platform_settings set value = '"stores.tekniq.store"' where key = 'cname_target';
```

### 4) اجعل نفسك مديراً
سجّل حساباً من المنصة ثم:
```sql
update profiles set role = 'platform_admin' where email = 'you@example.com';
```
بعدها تظهر «لوحة الشركة» في القائمة (`/admin`). لدور الدعم استخدم `'support'` (قراءة فقط).

### 5) دالة توثيق النطاقات (اختياري لكن موصى به)
```bash
supabase functions deploy verify-domain
```
تقرأ سجلّي `CNAME` و `TXT` وتوثّق النطاق. يمكن للمدير التوثيق يدوياً من `/admin/domains`.

### 6) البناء والنشر (Vercel أو Netlify أو أي استضافة ثابتة)
```bash
npm install
npm run build        # الناتج في dist/
```
- ارفع `dist/` (أو اربط المستودع: Build `npm run build`، Output `dist`). ملفات `vercel.json` و `netlify.toml` و `public/_redirects` تضبط إعادة التوجيه لتطبيق الصفحة الواحدة.
- **المتاجر**: وجّه DNS لـ `*.tekniq.store` (Wildcard CNAME) إلى نفس الاستضافة، وأضف الدومين `*.tekniq.store` في الاستضافة. التطبيق يتعرّف على اسم المضيف ويعرض المتجر المنشور تلقائياً.
- **نطاقات العملاء**: يُضيفها العميل من لوحته؛ أضفها أيضاً في استضافتك لإصدار SSL (يمكن أتمتتها عبر API الاستضافة).
- بدون دومين مخصص يمكن فتح أي متجر عبر `https://app.tekniq.store/s/<slug>`.

### 7) ربط بيانات المتاجر (مرحلتكم التالية)
من `/admin/stores` ← «الربط»: اختر لكل متجر `supabase` (الجداول الجاهزة في `0002_commerce_tables.sql` + الدالة `place_order`) أو `http` مع رابط API. العقد المطلوب من الـ API في `src/render/adapters/http.ts` ومفاتيح المصادر في `/admin/integrations`.

---

## التطوير المحلي (وضع تجريبي بدون Supabase)
إذا تُرك `SUPABASE_URL` فارغاً يعمل كل شيء محلياً ببيانات في المتصفح (للتجربة فقط):
```bash
npm install
npm run dev                 # http://localhost:5173
# حساب المدير التجريبي: admin@tekniq.demo / admin123
```

## الاختبارات
```bash
npm run typecheck           # يحتاج npm install (يجلب @types/react)
npm run db:test             # Postgres محلي: الهجرات + البيانات + اختبارات الأمان والدوال
npm run build && node scripts/serve.mjs & npm run e2e   # اختبار متصفح شامل (Playwright)
```
اختبارات قاعدة البيانات تغطي: إنشاء متجر من كل قالب، قفل التعارض، منع إنشاء صفحات نظام من العميل، عزل المتاجر، منع تصعيد الصلاحيات، حدود الباقات، الدعوات، الحصص، الفوترة، وطلب الزائر (الأسعار والمخزون من الخادم دائماً).

## الأمان باختصار
- RLS مفعّل على كل جدول؛ الزائر (anon) يقرأ فقط الكتالوج المنشور ولا يكتب إلا عبر `place_order`.
- جميع الدوال الداخلية (`_*`) غير قابلة للاستدعاء من العميل؛ الدوال الإدارية تتحقق من `is_admin()`.
- `service_role` لا يُستخدم أبداً في الواجهة؛ فقط داخل Edge Function.
- روابط الصور/الأزرار التي يدخلها العميل تُفلتر (`safeUrl`) قبل العرض.

## ما لم يُنجز عمداً (خارج نطاق الواجهة)
بوابة دفع فعلية (الفواتير تُسوّى يدوياً أو بربط webhook لاحقاً)، حسابات عملاء المتجر النهائيين، إرسال البريد (دعوات الفريق تُقبل تلقائياً عند التسجيل بنفس البريد)، شهادات SSL (تصدرها الاستضافة).
