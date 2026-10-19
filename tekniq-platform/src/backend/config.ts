export interface TekniqConfig { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; ROOT_DOMAIN: string; PLATFORM_HOSTS: string[]; }
export const cfg = (): TekniqConfig => ({
  SUPABASE_URL: '', SUPABASE_ANON_KEY: '', ROOT_DOMAIN: 'tekniq.store', PLATFORM_HOSTS: ['localhost', '127.0.0.1'],
  ...((globalThis as any).TEKNIQ || {}),
});
export const isDemo = () => !cfg().SUPABASE_URL || !cfg().SUPABASE_ANON_KEY;
