import type { ActivityRow, ComponentTypeRow, Draft, DomainRow, Invite, Invoice, MediaRow, Member, Plan, Profile, Snapshot, StoreRow, StoreStatus, Subscription, TemplateRow, Ticket, TicketMessage, VersionRow } from '../core/types';

export type MyStore = StoreRow & { myRole: 'owner' | 'editor' | 'viewer' };
export interface Usage { pages: number; members: number; domains: number; mediaMb: number; }
export interface AdminStats { users: number; stores: number; storesByStatus: Record<string, number>; subscriptionsByPlan: Record<string, number>; openTickets: number; unpaidInvoices: number; pendingDomains: number; }
export interface AdminStore extends StoreRow { owner_email?: string; plan_code?: string; }
export interface DataSourceRow { id: string; key: string; name: string; kind: string; method: string; endpoint_template: string; status: string; }

/** Everything the web app needs from a backend. Two implementations: Supabase (real) and Demo (localStorage). */
export interface Api {
  readonly demo: boolean;
  // auth
  me(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string, phone?: string): Promise<{ needsConfirm: boolean }>;
  signOut(): Promise<void>;
  recover(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateProfile(patch: { full_name?: string; phone?: string }): Promise<Profile>;
  // stores
  myStores(): Promise<MyStore[]>;
  getStore(id: string): Promise<MyStore>;
  createStore(i: { name: string; slug: string; templateId?: string; currency?: string; locale?: string }): Promise<StoreRow>;
  updateStore(id: string, patch: Record<string, any>): Promise<StoreRow>;
  archiveStore(id: string): Promise<void>;
  templates(): Promise<TemplateRow[]>;
  usage(storeId: string): Promise<Usage>;
  // editor
  getDraft(storeId: string): Promise<{ draft: Draft; rev: number }>;
  saveDraft(storeId: string, draft: Draft, baseRev: number): Promise<number>;
  publish(storeId: string, note?: string): Promise<{ versionNo: number }>;
  versions(storeId: string): Promise<VersionRow[]>;
  restore(storeId: string, versionId: string, publish?: boolean): Promise<number>;
  getPublished(q: { slug?: string; host?: string }): Promise<Snapshot | null>;
  // media
  media(storeId: string): Promise<MediaRow[]>;
  uploadMedia(storeId: string, file: File): Promise<MediaRow>;
  deleteMedia(m: MediaRow): Promise<void>;
  // domains
  domains(storeId: string): Promise<DomainRow[]>;
  addDomain(storeId: string, hostname: string): Promise<DomainRow>;
  removeDomain(id: string): Promise<void>;
  setPrimaryDomain(id: string): Promise<void>;
  verifyDomain(id: string): Promise<{ status: string; txtOk?: boolean; cnameOk?: boolean }>;
  // team
  members(storeId: string): Promise<{ members: Member[]; invites: Invite[] }>;
  invite(storeId: string, email: string, role: 'editor' | 'viewer'): Promise<{ status: 'added' | 'invited' }>;
  setMemberRole(storeId: string, userId: string, role: 'editor' | 'viewer'): Promise<void>;
  removeMember(storeId: string, userId: string): Promise<void>;
  cancelInvite(id: string): Promise<void>;
  // billing
  plans(): Promise<Plan[]>;
  subscription(storeId: string): Promise<Subscription | null>;
  invoices(storeId: string): Promise<Invoice[]>;
  changePlan(storeId: string, planId: string, cycle: 'monthly' | 'yearly'): Promise<void>;
  // support & activity
  tickets(storeId?: string): Promise<Ticket[]>;
  createTicket(storeId: string, subject: string, body: string, priority: Ticket['priority']): Promise<Ticket>;
  ticketMessages(ticketId: string): Promise<TicketMessage[]>;
  reply(ticketId: string, body: string): Promise<void>;
  activity(storeId?: string, limit?: number): Promise<ActivityRow[]>;
  // admin (platform_admin / support)
  adminStats(): Promise<AdminStats>;
  adminStores(): Promise<AdminStore[]>;
  adminSetStoreStatus(id: string, status: StoreStatus): Promise<void>;
  adminSetIntegration(id: string, mode: 'mock' | 'supabase' | 'http', url?: string): Promise<void>;
  adminUsers(): Promise<Profile[]>;
  adminSetUser(id: string, patch: { role?: Profile['role']; status?: Profile['status'] }): Promise<void>;
  adminSavePlan(p: Partial<Plan> & { code: string; name: string }): Promise<void>;
  adminTemplates(): Promise<TemplateRow[]>;
  adminSetTemplate(id: string, patch: Partial<TemplateRow>): Promise<void>;
  adminDeleteTemplate(id: string): Promise<void>;
  adminTemplateFromStore(storeId: string, name: string, slug: string, category: string): Promise<void>;
  adminComponents(): Promise<ComponentTypeRow[]>;
  adminSetComponent(id: string, patch: Partial<ComponentTypeRow>): Promise<void>;
  adminDataSources(): Promise<DataSourceRow[]>;
  adminSetDataSource(id: string, patch: Partial<DataSourceRow>): Promise<void>;
  adminInvoices(): Promise<Invoice[]>;
  adminMarkPaid(id: string, ref?: string): Promise<void>;
  adminDomains(): Promise<(DomainRow & { store_name?: string })[]>;
  adminSetDomain(id: string, v: DomainRow['verification_status'], ssl: DomainRow['ssl_status']): Promise<void>;
  adminTickets(): Promise<(Ticket & { store_name?: string })[]>;
  adminSetTicket(id: string, patch: Partial<Pick<Ticket, 'status' | 'priority'>>): Promise<void>;
}
