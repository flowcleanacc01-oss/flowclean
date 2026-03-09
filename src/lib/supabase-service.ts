import { supabase } from './supabase'
import type {
  Customer, LinenForm, DeliveryNote, BillingStatement, TaxInvoice,
  Quotation, Expense, AppUser, CompanyInfo, LinenItemDef, LinenCategoryDef,
  ProductChecklist, AuditLog,
} from '@/types'

// ============================================================
// Server-side DB write proxy (uses service_role key)
// Reads use anon supabase client directly (RLS allows SELECT)
// Writes go through /api/db (RLS blocks anon writes)
// ============================================================
async function dbWrite(params: {
  table: string
  operation: 'insert' | 'update' | 'delete' | 'upsert'
  data?: Record<string, unknown> | Record<string, unknown>[]
  match?: { column: string; value: string | number }
  onConflict?: string
}): Promise<void> {
  // Get session user ID for auth header
  const sessionStr = typeof window !== 'undefined' ? sessionStorage.getItem('fc_session') : null
  const sessionUser = sessionStr ? JSON.parse(sessionStr)?.id || '' : ''
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-fc-session': sessionUser },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `DB write failed: ${res.status}`)
  }
}

// ============================================================
// Case Conversion: camelCase ↔ snake_case
// ============================================================

// Map of camelCase TS field names → snake_case DB column names
const FIELD_MAP: Record<string, string> = {
  nameEn: 'name_en',
  customerCode: 'customer_code',
  customerType: 'customer_type',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  creditDays: 'credit_days',
  billingModel: 'billing_model',
  monthlyFlatRate: 'monthly_flat_rate',
  enabledItems: 'enabled_items',
  priceList: 'price_list',
  priceHistory: 'price_history',
  createdAt: 'created_at',
  isActive: 'is_active',
  formNumber: 'form_number',
  customerId: 'customer_id',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  noteNumber: 'note_number',
  linenFormIds: 'linen_form_ids',
  driverName: 'driver_name',
  vehiclePlate: 'vehicle_plate',
  receiverName: 'receiver_name',
  billingNumber: 'billing_number',
  deliveryNoteIds: 'delivery_note_ids',
  billingMonth: 'billing_month',
  issueDate: 'issue_date',
  dueDate: 'due_date',
  lineItems: 'line_items',
  grandTotal: 'grand_total',
  withholdingTax: 'withholding_tax',
  netPayable: 'net_payable',
  paidDate: 'paid_date',
  paidAmount: 'paid_amount',
  invoiceNumber: 'invoice_number',
  billingStatementId: 'billing_statement_id',
  quotationNumber: 'quotation_number',
  customerName: 'customer_name',
  customerContact: 'customer_contact',
  validUntil: 'valid_until',
  checklistNumber: 'checklist_number',
  linkedDocumentId: 'linked_document_id',
  linkedDocumentNumber: 'linked_document_number',
  inspectorName: 'inspector_name',
  defaultPrice: 'default_price',
  sortOrder: 'sort_order',
  taxId: 'tax_id',
  bankName: 'bank_name',
  bankAccountName: 'bank_account_name',
  bankAccountNumber: 'bank_account_number',
  passwordHash: 'password_hash',
  // Bag counts
  bagsSentCount: 'bags_sent_count',
  bagsPackCount: 'bags_pack_count',
  // Department checkboxes
  deptDrying: 'dept_drying',
  deptIroning: 'dept_ironing',
  deptFolding: 'dept_folding',
  deptQc: 'dept_qc',
  // Audit log fields
  userId: 'user_id',
  userName: 'user_name',
  entityType: 'entity_type',
  entityId: 'entity_id',
  entityLabel: 'entity_label',
}

// Reverse map: snake_case → camelCase
const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
)

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = FIELD_MAP[key] || key
    result[snakeKey] = value
  }
  return result
}

function toCamelCase<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = REVERSE_MAP[key] || key
    result[camelKey] = value
  }
  return result as T
}

function toCamelCaseArray<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map(row => toCamelCase<T>(row))
}

// ============================================================
// Linen Categories (Dynamic)
// ============================================================

export async function fetchLinenCategories(): Promise<LinenCategoryDef[]> {
  const { data, error } = await supabase
    .from('linen_categories')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return toCamelCaseArray<LinenCategoryDef>(data || [])
}

export async function upsertLinenCategories(cats: LinenCategoryDef[]): Promise<void> {
  const rows = cats.map(c => toSnakeCase(c as unknown as Record<string, unknown>))
  await dbWrite({ table: 'linen_categories', operation: 'upsert', data: rows, onConflict: 'key' })
}

export async function insertLinenCategory(cat: LinenCategoryDef): Promise<void> {
  await dbWrite({ table: 'linen_categories', operation: 'insert', data: toSnakeCase(cat as unknown as Record<string, unknown>) })
}

export async function updateLinenCategoryDB(key: string, updates: Partial<LinenCategoryDef>): Promise<void> {
  await dbWrite({ table: 'linen_categories', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'key', value: key } })
}

export async function deleteLinenCategoryDB(key: string): Promise<void> {
  await dbWrite({ table: 'linen_categories', operation: 'delete', match: { column: 'key', value: key } })
}

// ============================================================
// Linen Items (Catalog)
// ============================================================

export async function fetchLinenItems(): Promise<LinenItemDef[]> {
  const { data, error } = await supabase
    .from('linen_items')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return toCamelCaseArray<LinenItemDef>(data || [])
}

export async function upsertLinenItems(items: LinenItemDef[]): Promise<void> {
  const rows = items.map(i => toSnakeCase(i as unknown as Record<string, unknown>))
  await dbWrite({ table: 'linen_items', operation: 'upsert', data: rows, onConflict: 'code' })
}

export async function insertLinenItem(item: LinenItemDef): Promise<void> {
  await dbWrite({ table: 'linen_items', operation: 'insert', data: toSnakeCase(item as unknown as Record<string, unknown>) })
}

export async function updateLinenItemDB(code: string, updates: Partial<LinenItemDef>): Promise<void> {
  await dbWrite({ table: 'linen_items', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'code', value: code } })
}

export async function deleteLinenItemDB(code: string): Promise<void> {
  await dbWrite({ table: 'linen_items', operation: 'delete', match: { column: 'code', value: code } })
}

// ============================================================
// App Users
// ============================================================

export async function fetchUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, name, email, role, is_active, created_at')
  if (error) throw error
  return toCamelCaseArray<AppUser>(data || [])
}

export async function upsertUsers(users: AppUser[]): Promise<void> {
  const rows = users.map(u => toSnakeCase(u as unknown as Record<string, unknown>))
  await dbWrite({ table: 'app_users', operation: 'upsert', data: rows, onConflict: 'id' })
}

export async function insertUser(user: AppUser): Promise<void> {
  await dbWrite({ table: 'app_users', operation: 'insert', data: toSnakeCase(user as unknown as Record<string, unknown>) })
}

export async function updateUserDB(id: string, updates: Partial<AppUser>): Promise<void> {
  await dbWrite({ table: 'app_users', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function fetchUserByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', email)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return toCamelCase<AppUser & { passwordHash: string }>(data)
}

export async function updatePasswordHash(userId: string, hash: string): Promise<void> {
  await dbWrite({ table: 'app_users', operation: 'update', data: { password_hash: hash }, match: { column: 'id', value: userId } })
}

// ============================================================
// Audit Logs
// ============================================================

export async function insertAuditLog(log: AuditLog): Promise<void> {
  try {
    await dbWrite({ table: 'audit_logs', operation: 'insert', data: toSnakeCase(log as unknown as Record<string, unknown>) })
  } catch (err) {
    console.error('[Audit log error]', err)
  }
}

export interface FetchAuditLogsOptions {
  limit?: number
  offset?: number
  entityType?: string
  userId?: string
}

export async function fetchAuditLogs(options: FetchAuditLogsOptions = {}): Promise<AuditLog[]> {
  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })

  if (options.entityType) query = query.eq('entity_type', options.entityType)
  if (options.userId) query = query.eq('user_id', options.userId)
  if (options.limit) query = query.limit(options.limit)
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1)

  const { data, error } = await query
  if (error) throw error
  return toCamelCaseArray<AuditLog>(data || [])
}

// ============================================================
// Company Info (singleton)
// ============================================================

export async function fetchCompanyInfo(): Promise<CompanyInfo | null> {
  const { data, error } = await supabase
    .from('company_info')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const result = toCamelCase<CompanyInfo & { id: number }>(data)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = result as CompanyInfo & { id: number }
  return rest as CompanyInfo
}

export async function upsertCompanyInfo(info: CompanyInfo): Promise<void> {
  const row = { ...toSnakeCase(info as unknown as Record<string, unknown>), id: 1 }
  await dbWrite({ table: 'company_info', operation: 'upsert', data: row, onConflict: 'id' })
}

// ============================================================
// Customers
// ============================================================

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at')
  if (error) throw error
  return toCamelCaseArray<Customer>(data || [])
}

export async function insertCustomer(customer: Customer): Promise<void> {
  await dbWrite({ table: 'customers', operation: 'insert', data: toSnakeCase(customer as unknown as Record<string, unknown>) })
}

export async function updateCustomerDB(id: string, updates: Partial<Customer>): Promise<void> {
  await dbWrite({ table: 'customers', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteCustomerDB(id: string): Promise<void> {
  await dbWrite({ table: 'customers', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Linen Forms
// ============================================================

export async function fetchLinenForms(): Promise<LinenForm[]> {
  const { data, error } = await supabase
    .from('linen_forms')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return toCamelCaseArray<LinenForm>(data || [])
}

export async function insertLinenForm(form: LinenForm): Promise<void> {
  await dbWrite({ table: 'linen_forms', operation: 'insert', data: toSnakeCase(form as unknown as Record<string, unknown>) })
}

export async function updateLinenFormDB(id: string, updates: Partial<LinenForm>): Promise<void> {
  await dbWrite({ table: 'linen_forms', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteLinenFormDB(id: string): Promise<void> {
  await dbWrite({ table: 'linen_forms', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Delivery Notes
// ============================================================

export async function fetchDeliveryNotes(): Promise<DeliveryNote[]> {
  const { data, error } = await supabase
    .from('delivery_notes')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return toCamelCaseArray<DeliveryNote>(data || [])
}

export async function insertDeliveryNote(note: DeliveryNote): Promise<void> {
  await dbWrite({ table: 'delivery_notes', operation: 'insert', data: toSnakeCase(note as unknown as Record<string, unknown>) })
}

export async function updateDeliveryNoteDB(id: string, updates: Partial<DeliveryNote>): Promise<void> {
  await dbWrite({ table: 'delivery_notes', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteDeliveryNoteDB(id: string): Promise<void> {
  await dbWrite({ table: 'delivery_notes', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Billing Statements
// ============================================================

export async function fetchBillingStatements(): Promise<BillingStatement[]> {
  const { data, error } = await supabase
    .from('billing_statements')
    .select('*')
    .order('issue_date', { ascending: false })
  if (error) throw error
  return toCamelCaseArray<BillingStatement>(data || [])
}

export async function insertBillingStatement(bs: BillingStatement): Promise<void> {
  await dbWrite({ table: 'billing_statements', operation: 'insert', data: toSnakeCase(bs as unknown as Record<string, unknown>) })
}

export async function updateBillingStatementDB(id: string, updates: Partial<BillingStatement>): Promise<void> {
  await dbWrite({ table: 'billing_statements', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteBillingStatementDB(id: string): Promise<void> {
  await dbWrite({ table: 'billing_statements', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Tax Invoices
// ============================================================

export async function fetchTaxInvoices(): Promise<TaxInvoice[]> {
  const { data, error } = await supabase
    .from('tax_invoices')
    .select('*')
    .order('issue_date', { ascending: false })
  if (error) throw error
  return toCamelCaseArray<TaxInvoice>(data || [])
}

export async function insertTaxInvoice(ti: TaxInvoice): Promise<void> {
  await dbWrite({ table: 'tax_invoices', operation: 'insert', data: toSnakeCase(ti as unknown as Record<string, unknown>) })
}

// ============================================================
// Quotations
// ============================================================

export async function fetchQuotations(): Promise<Quotation[]> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return toCamelCaseArray<Quotation>(data || [])
}

export async function insertQuotation(q: Quotation): Promise<void> {
  await dbWrite({ table: 'quotations', operation: 'insert', data: toSnakeCase(q as unknown as Record<string, unknown>) })
}

export async function updateQuotationDB(id: string, updates: Partial<Quotation>): Promise<void> {
  await dbWrite({ table: 'quotations', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

// ============================================================
// Expenses
// ============================================================

export async function fetchExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return toCamelCaseArray<Expense>(data || [])
}

export async function insertExpense(exp: Expense): Promise<void> {
  await dbWrite({ table: 'expenses', operation: 'insert', data: toSnakeCase(exp as unknown as Record<string, unknown>) })
}

export async function updateExpenseDB(id: string, updates: Partial<Expense>): Promise<void> {
  await dbWrite({ table: 'expenses', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteExpenseDB(id: string): Promise<void> {
  await dbWrite({ table: 'expenses', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Product Checklists
// ============================================================

export async function fetchChecklists(): Promise<ProductChecklist[]> {
  const { data, error } = await supabase
    .from('product_checklists')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return toCamelCaseArray<ProductChecklist>(data || [])
}

export async function insertChecklist(cl: ProductChecklist): Promise<void> {
  await dbWrite({ table: 'product_checklists', operation: 'insert', data: toSnakeCase(cl as unknown as Record<string, unknown>) })
}

export async function updateChecklistDB(id: string, updates: Partial<ProductChecklist>): Promise<void> {
  await dbWrite({ table: 'product_checklists', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteChecklistDB(id: string): Promise<void> {
  await dbWrite({ table: 'product_checklists', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Default Prices — stored as linen_items.default_price
// ============================================================

export async function updateDefaultPriceDB(code: string, price: number): Promise<void> {
  await dbWrite({ table: 'linen_items', operation: 'update', data: { default_price: price }, match: { column: 'code', value: code } })
}

// ============================================================
// Reset: Truncate all tables (reverse dependency order)
// ============================================================

export async function truncateAllTables(): Promise<void> {
  // Use a dedicated server endpoint for bulk delete (service_role required)
  const res = await fetch('/api/db/truncate', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Truncate failed')
  }
}

// ============================================================
// Bulk Load (for initial hydration)
// ============================================================

export async function fetchAllData() {
  const results = await Promise.allSettled([
    fetchCustomers(),
    fetchLinenForms(),
    fetchDeliveryNotes(),
    fetchBillingStatements(),
    fetchTaxInvoices(),
    fetchQuotations(),
    fetchExpenses(),
    fetchUsers(),
    fetchCompanyInfo(),
    fetchLinenItems(),
    fetchChecklists(),
    fetchLinenCategories(),
  ])

  const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : (console.error('[fetchAllData] partial fail:', r.reason), fallback)

  const [
    customers, linenForms, deliveryNotes, billingStatements,
    taxInvoices, quotations, expenses, users, companyInfo,
    linenItems, checklists, linenCategories,
  ] = [
    val(results[0], [] as Customer[]),
    val(results[1], [] as LinenForm[]),
    val(results[2], [] as DeliveryNote[]),
    val(results[3], [] as BillingStatement[]),
    val(results[4], [] as TaxInvoice[]),
    val(results[5], [] as Quotation[]),
    val(results[6], [] as Expense[]),
    val(results[7], [] as AppUser[]),
    val(results[8], null as CompanyInfo | null),
    val(results[9], [] as LinenItemDef[]),
    val(results[10], [] as ProductChecklist[]),
    val(results[11], [] as LinenCategoryDef[]),
  ]

  return {
    customers,
    linenForms,
    deliveryNotes,
    billingStatements,
    taxInvoices,
    quotations,
    expenses,
    users,
    companyInfo,
    linenItems,
    checklists,
    linenCategories,
  }
}
