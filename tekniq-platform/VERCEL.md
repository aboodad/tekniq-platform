# النشر على Vercel

## الطريقة 1 — رفع مجلد dist الجاهز (الأسرع)
1. عدّل `dist/config.js` وضع مفاتيح Supabase والنطاقات.
2. `npm i -g vercel` ثم داخل مجلد `dist`: `vercel --prod`
   (أو اسحب مجلد `dist` في vercel.com/new).

## الطريقة 2 — ربط المستودع (بناء تلقائي)
ارفع المشروع إلى GitHub ثم Import في Vercel. الإعدادات تُقرأ من `vercel.json`
(Build: `npm run build` · Output: `dist`). لا حاجة لمتغيرات بيئة: المفاتيح في `public/config.js`.

## النطاقات
- نطاق المنصة: أضف `app.نطاقك.com` في Project → Settings → Domains، وضعه في `PLATFORM_HOSTS`.
- المتاجر: أضف `*.نطاقك.com` (Wildcard). يتطلب أن تكون خوادم الأسماء (Nameservers) النطاق عند Vercel.
  بدون ذلك استخدم الروابط `https://app.نطاقك.com/s/<slug>`.
- نطاقات العملاء المخصصة: أضفها في Vercel لكل نطاق (يدوياً أو عبر Vercel API) ليصدر SSL.
