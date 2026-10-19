import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../core/types';
import { api } from '../backend';
import { consumeAuthHash } from '../backend/http';
import { isDemo } from '../backend/config';
import { navigate } from '../core/router';

interface S { user: Profile | null; loading: boolean; refresh(): Promise<void>; signOut(): Promise<void>; }
const Ctx = createContext<S>(null as any);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null); const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { try { setUser(await api.me()); } catch { setUser(null); } finally { setLoading(false); } }, []);
  useEffect(() => {
    if (!isDemo()) { const k = consumeAuthHash(); if (k === 'recovery') navigate('/reset', { replace: true }); }
    refresh();
  }, [refresh]);
  const signOut = useCallback(async () => { await api.signOut(); setUser(null); navigate('/login'); }, []);
  return <Ctx.Provider value={{ user, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}
