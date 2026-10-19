import type { Api } from './api';
import { isDemo } from './config';
import { demoApi } from './demo';
import { supabaseApi } from './supabase';

export const api: Api = isDemo() ? demoApi : supabaseApi;
export { ApiError } from './http';
