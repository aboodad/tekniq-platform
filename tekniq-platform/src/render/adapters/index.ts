import type { DataAdapter, StoreInfo } from '../../core/types';
import { mockAdapter } from './mock';
import { supabaseAdapter } from './supabase';
import { httpAdapter } from './http';
import { isDemo } from '../../backend/config';

export function makeAdapter(s: StoreInfo): DataAdapter {
  if (s.dataMode === 'http' && s.dataApiUrl) return httpAdapter(s.dataApiUrl);
  if (s.dataMode === 'supabase' && !isDemo()) return supabaseAdapter(s.id);
  return mockAdapter(s.currency);
}
