import { useState } from 'react';
import { api } from '../../backend';
import { Link, navigate } from '../../core/router';
import { slugify } from '../../core/util';
import { cfg } from '../../backend/config';
import { Async, Badge, Empty, Field, PageHead, useAction, useLoad } from '../ui';
import type { StoreStatus } from '../../core/types';

export const STATUS: Record<StoreStatus, [string, 'gray' | 'green' | 'amber' | 'red' | 'blue']> = {
  draft: ['مسودة', 'gray'], ready_for_integration: ['جاهز للربط', 'blue'], live: ['منشور', 'green'], suspended: ['موقوف', 'red'], archived: ['مؤرشف', 'amber'],
};

export function Home() {
  const s = useLoad(() => api.myStores(), []);
  return (
    <>
      <PageHead title="متاجري" sub="أنشئ وأدر متاجرك من مكان واحد" actions={<Link to="/dashboard/new" className="btn">＋ متجر جديد</Link>} />
      <Async s={s}>{(list) => list.filter((x) => x.status !== 'archived').length === 0
        ? <Empty title="لا توجد متاجر بعد" text="ابدأ بإنشاء متجرك الأول من أحد القوالب الجاهزة." action={<Link to="/dashboard/new" className="btn">إنشاء متجر</Link>} />
        : <div className="grid g3">{list.filter((x) => x.status !== 'archived').map((st) => (
          <div className="card storecard" key={st.id}>
            <div className="thumb">{st.name.slice(0, 1)}</div>
            <div><h3 style={{ marginBottom: 4 }}>{st.name}</h3><span className="muted ltr" style={{ fontSize: 13 }}>{st.slug}.{cfg().ROOT_DOMAIN}</span></div>
            <div className="row sp"><Badge tone={STATUS[st.status][1]}>{STATUS[st.status][0]}</Badge><span className="muted" style={{ fontSize: 12 }}>{st.myRole === 'owner' ? 'مالك' : st.myRole === 'editor' ? 'محرر' : 'مشاهد'}</span></div>
            <div className="row"><Link to={'/editor/' + st.id} className="btn sm">تصميم</Link><Link to={'/dashboard/stores/' + st.id} className="btn sm ghost">إدارة</Link></div>
          </div>))}</div>}</Async>
    </>
  );
}

export function NewStore() {
  const tpls = useLoad(() => api.templates(), []); const { busy, run } = useAction();
  const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [touched, setTouched] = useState(false); const [tpl, setTpl] = useState<string | undefined>();
  const [cur, setCur] = useState('USD');
  const onName = (v: string) => { setName(v); if (!touched) setSlug(slugify(v).replace(/[^a-z0-9-]/g, '')); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = await run(() => api.createStore({ name, slug, templateId: tpl ?? tpls.data?.[0]?.id, currency: cur }), 'تم إنشاء المتجر');
    if (st) navigate('/editor/' + st.id);
  };
  const chosen = tpl ?? tpls.data?.find((t) => t.slug === 'blank')?.id ?? tpls.data?.[0]?.id;
  return (
    <>
      <PageHead title="متجر جديد" sub="اختر قالباً للبدء، ويمكنك تغيير كل شيء لاحقاً" />
      <form onSubmit={submit} className="stack">
        <div className="card"><h3>معلومات المتجر</h3><div className="grid g2">
          <Field label="اسم المتجر"><input required minLength={2} value={name} onChange={(e) => onName(e.target.value)} /></Field>
          <Field label="رابط المتجر" hint={`${slug || 'my-shop'}.${cfg().ROOT_DOMAIN}`}><input required dir="ltr" pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" value={slug} onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} /></Field>
          <Field label="العملة"><select value={cur} onChange={(e) => setCur(e.target.value)}>{['USD', 'SAR', 'AED', 'YER', 'EGP', 'KWD', 'QAR', 'EUR'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div></div>
        <div className="card"><h3>القالب</h3>
          <Async s={tpls}>{(list) => <div className="grid g4">{list.map((t) => (
            <button type="button" key={t.id} className={'tpl ' + (chosen === t.id ? 'on' : '')} onClick={() => setTpl(t.id)}>
              <div className="pv" style={{ background: 'linear-gradient(135deg,#7c5cff44,#2dd4bf2a)' }}>{t.name.slice(0, 1)}</div>
              <div className="info"><b>{t.name}</b><small>{t.description}</small></div></button>))}</div>}</Async>
        </div>
        <div><button className="btn" disabled={busy || !name || !slug}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء المتجر وفتح المحرر'}</button></div>
      </form>
    </>
  );
}
