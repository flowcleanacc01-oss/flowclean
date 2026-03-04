import { supabase } from './supabase'
import type {
  Customer, LinenForm, DeliveryNote, BillingStatement, TaxInvoice,
  Quotation, Expense, AppUser, CompanyInfo, LinenItemDef, ProductChecklist,
} from '@/types'

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
  const { error } = await supabase
    .from('linen_items')
    .upsert(rows, { onConflict: 'code' })
  if (error) throw error
}

export async function insertLinenItem(item: LinenItemDef): Promise<void> {
  const { error } = await supabase
    .from('linen_items')
    .insert(toSnakeCase(item as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateLinenItemDB(code: string, updates: Partial<LinenItemDef>): Promise<void> {
  const { error } = await supabase
    .from('linen_items')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('code', code)
  if (error) throw error
}

export async function deleteLinenItemDB(code: string): Promise<void> {
  const { error } = await supabase
    .from('linen_items')
    .delete()
    .eq('code', code)
  if (error) throw error
}

// ============================================================
// App Users
// ============================================================

export async function fetchUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
  if (error) throw error
  return toCamelCaseArray<AppUser>(data || [])
}

export async function upsertUsers(users: AppUser[]): Promise<void> {
  const rows = users.map(u => toSnakeCase(u as unknown as Record<string, unknown>))
  const { error } = await supabase
    .from('app_users')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function insertUser(user: AppUser): Promise<void> {
  const { error } = await supabase
    .from('app_users')
    .insert(toSnakeCase(user as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateUserDB(id: string, updates: Partial<AppUser>): Promise<void> {
  const { error } = await supabase
    .from('app_users')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
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
  const { error } = await supabase
    .from('company_info')
    .upsert(row, { onConflict: 'id' })
  if (error) throw error
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
  const { error } = await supabase
    .from('customers')
    .insert(toSnakeCase(customer as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateCustomerDB(id: string, updates: Partial<Customer>): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
}

export async function deleteCustomerDB(id: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
  if (error) throw error
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
  const { error } = await supabase
    .from('linen_forms')
    .insert(toSnakeCase(form as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateLinenFormDB(id: string, updates: Partial<LinenForm>): Promise<void> {
  const { error } = await supabase
    .from('linen_forms')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
}

export async function deleteLinenFormDB(id: string): Promise<void> {
  const { error } = await supabase
    .from('linen_forms')
    .delete()
    .eq('id', id)
  if (error) throw error
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
  const { error } = await supabase
    .from('delivery_notes')
    .insert(toSnakeCase(note as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateDeliveryNoteDB(id: string, updates: Partial<DeliveryNote>): Promise<void> {
  const { error } = await supabase
    .from('delivery_notes')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
}

export async function deleteDeliveryNoteDB(id: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_notes')
    .delete()
    .eq('id', id)
  if (error) throw error
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
  const { error } = await supabase
    .from('billing_statements')
    .insert(toSnakeCase(bs as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateBillingStatementDB(id: string, updates: Partial<BillingStatement>): Promise<void> {
  const { error } = await supabase
    .from('billing_statements')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
}

export async function deleteBillingStatementDB(id: string): Promise<void> {
  const { error } = await supabase
    .from('billing_statements')
    .delete()
    .eq('id', id)
  if (error) throw error
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
  const { error } = await supabase
    .from('tax_invoices')
    .insert(toSnakeCase(ti as unknown as Record<string, unknown>))
  if (error) throw error
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
  const { error } = await supabase
    .from('quotations')
    .insert(toSnakeCase(q as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateQuotationDB(id: string, updates: Partial<Quotation>): Promise<void> {
  const { error } = await supabase
    .from('quotations')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
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
  const { error } = await supabase
    .from('expenses')
    .insert(toSnakeCase(exp as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateExpenseDB(id: string, updates: Partial<Expense>): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
}

export async function deleteExpenseDB(id: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
  if (error) throw error
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
  const { error } = await supabase
    .from('product_checklists')
    .insert(toSnakeCase(cl as unknown as Record<string, unknown>))
  if (error) throw error
}

export async function updateChecklistDB(id: string, updates: Partial<ProductChecklist>): Promise<void> {
  const { error } = await supabase
    .from('product_checklists')
    .update(toSnakeCase(updates as unknown as Record<string, unknown>))
    .eq('id', id)
  if (error) throw error
}

export async function deleteChecklistDB(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_checklists')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// Default Prices — stored as linen_items.default_price
// ============================================================

export async function updateDefaultPriceDB(code: string, price: number): Promise<void> {
  const { error } = await supabase
    .from('linen_items')
    .update({ default_price: price })
    .eq('code', code)
  if (error) throw error
}

// ============================================================
// Bulk Load (for initial hydration)
// ============================================================

export async function fetchAllData() {
  const [
    customers, linenForms, deliveryNotes, billingStatements,
    taxInvoices, quotations, expenses, users, companyInfo,
    linenItems, checklists,
  ] = await Promise.all([
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
  ])

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
  }
}
