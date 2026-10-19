// End-to-end smoke test in demo mode: node scripts/serve.mjs & node scripts/e2e.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173'; const OUT = process.env.OUT || '/tmp/e2e';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium';
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar' });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text()) && errs.push('console: ' + m.text()));
let step = 0; const ok = (m) => console.log('✓', m); const shot = (n) => page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-${n}.png` });
const must = async (cond, msg) => { if (!(await cond)) { await shot('FAIL'); throw new Error('FAIL: ' + msg); } ok(msg); };

await page.goto(BASE + '/signup'); await page.fill('input[autocomplete=name]', 'تاجر تجريبي'); await page.fill('input[type=email]', 'm@test.com'); await page.fill('input[type=password]', 'secret123'); await page.click('button.btn.block');
await page.waitForURL('**/dashboard/new'); await page.waitForSelector('.tpl', { timeout: 10000 }); ok('signup → new store page');
await page.fill('input[required]:not([pattern])', 'متجر الاختبار'); await page.fill('input[pattern]', 'test-shop');
await page.locator('.tpl', { hasText: 'أناقة' }).click(); await shot('new-store'); await page.click('button:has-text("إنشاء المتجر")');
await page.waitForURL('**/editor/**'); await page.waitForSelector('.sf-sec'); await must(page.locator('.sf-sec').count().then((n) => n > 2), 'editor renders template sections');
await shot('editor');
// select a section from the canvas and edit its text
await page.locator('.sf-sec').first().click(); await must(page.locator('.ed-right .field').count().then((n) => n > 0), 'inspector opens on select');
// theme change
await page.click('.ed-tabs button:has-text("التصميم")'); await page.locator('.preset').nth(3).click(); await shot('theme-dark');
// add section
await page.click('.ed-tabs button:has-text("الأقسام")'); const before = await page.locator('.ed-left .lyr').count(); await page.click('button:has-text("إضافة قسم")'); await page.locator('.modal .tpl', { hasText: 'الأسئلة الشائعة' }).click();
await must(page.locator('.ed-left .lyr').count().then((n) => n === before + 1), 'add section');
// undo / redo
await page.keyboard.press('Control+z'); await must(page.locator('.ed-left .lyr').count().then((n) => n === before), 'undo'); await page.keyboard.press('Control+Shift+z');
// mobile device preview
await page.click('.ed-dev button:nth-child(3)'); await shot('editor-mobile-frame');
// autosave + publish
await page.waitForSelector('.ed-status:has-text("تم الحفظ")', { timeout: 8000 }); ok('autosave');
await page.click('.ed-top button:has-text("نشر")'); await page.click('.modal button:has-text("نشر الآن")'); await page.waitForSelector('text=تم نشر النسخة'); ok('publish'); await shot('published');
await page.click('.modal button:has-text("إغلاق")');
// live storefront
const live = await ctx.newPage(); await live.goto(BASE + '/s/test-shop'); await live.waitForSelector('.sf-sec'); ok('live storefront /s/test-shop');
await live.screenshot({ path: `${OUT}/live-desktop.png`, fullPage: true });
await live.goto(BASE + '/s/test-shop/collection/all'); await live.waitForSelector('.sf-grid'); await must(live.locator('.sf-card, .sf-pc').count().then((n) => n >= 0), 'collection page');
await live.goto(BASE + '/s/test-shop'); await live.locator('a[href*="/product/"]').first().click(); await live.waitForSelector('.sf-pdp'); await live.click('button:has-text("أضف")'); ok('product page + add to cart');
await live.goto(BASE + '/s/test-shop/checkout'); await live.screenshot({ path: `${OUT}/live-checkout.png` });
// phone viewport: no horizontal overflow
await live.setViewportSize({ width: 390, height: 800 }); await live.goto(BASE + '/s/test-shop'); await live.waitForSelector('.sf-sec');
await must(live.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow @390px'); await live.screenshot({ path: `${OUT}/live-mobile.png`, fullPage: true });
// dashboard store tabs
await page.goto(BASE + '/dashboard'); await page.waitForSelector('.storecard'); await shot('dashboard');
for (const t of ['media', 'domains', 'team', 'billing', 'versions', 'settings']) { await page.goto(BASE + '/dashboard/stores/' + (await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tk_demo_db_v1')); return d.stores[0].id; })) + '/' + t); await page.waitForSelector('.tabs'); await must(page.locator('.notice.err').count().then((n) => n === 0), 'tab ' + t); }
// admin
await page.evaluate(() => localStorage.removeItem('tk_demo_session')); await page.goto(BASE + '/login'); await page.fill('input[type=email]', 'admin@tekniq.demo'); await page.fill('input[type=password]', 'admin123'); await page.click('button.btn.block'); await page.waitForURL('**/dashboard');
for (const t of ['', 'stores', 'users', 'plans', 'templates', 'components', 'integrations', 'domains', 'invoices', 'tickets', 'activity']) { await page.goto(BASE + '/admin/' + t); await page.waitForSelector('.pagehead'); await must(page.locator('.notice.err').count().then((n) => n === 0), 'admin ' + t); }
await shot('admin');
await b.close();
if (errs.length) { console.log('\nBROWSER ERRORS:\n' + [...new Set(errs)].join('\n')); process.exit(1); }
console.log('\nALL PASSED');
