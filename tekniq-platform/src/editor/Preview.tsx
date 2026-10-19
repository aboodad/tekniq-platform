import { useEffect, useMemo, useState } from 'react';
import { api } from '../backend';
import { Storefront } from '../render/Storefront';
import { mockAdapter } from '../render/adapters/mock';
import { Link, useLocation } from '../core/router';
import { Shell } from '../app/shell';
import { Async, useLoad } from '../app/ui';
import { toSnapshot } from './Editor';

/** Full-page preview of the saved DRAFT (not the published version). */
export function Preview({ storeId }: { storeId: string }) {
  const loc = useLocation(); const base = '/preview/' + storeId;
  const s = useLoad(async () => { const [st, d] = await Promise.all([api.getStore(storeId), api.getDraft(storeId)]); return { st, d }; }, [storeId]);
  const [path, setPath] = useState(() => loc.slice(base.length) || '/');
  useEffect(() => { setPath(loc.slice(base.length) || '/'); }, [loc, base]);
  return (
    <Shell nav={[]} title="معاينة">
      <Async s={s}>{({ st, d }) => <Inner st={st} d={d.draft} base={base} path={path} setPath={(p) => { history.pushState(null, '', base + p); setPath(p); }} />}</Async>
    </Shell>
  );
}
function Inner({ st, d, base, path, setPath }: any) {
  const snap = useMemo(() => toSnapshot(d, st), [d, st]); const adapter = useMemo(() => mockAdapter(st.currency), [st.currency]);
  return <div className="stack"><div className="row sp"><span className="notice">معاينة المسودة المحفوظة — بيانات المنتجات تجريبية</span><Link to={'/editor/' + st.id} className="btn sm">العودة للمحرر</Link></div>
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}><Storefront snap={snap} adapter={adapter} mode="preview" base={base} path={path} onNavigate={setPath} /></div></div>;
}
