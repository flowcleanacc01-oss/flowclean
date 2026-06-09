import { supabase } from './supabase'
import type {
  Customer, LinenForm, DeliveryNote, BillingStatement, TaxInvoice, Receipt,
  Quotation, Expense, AppUser, CompanyInfo, LinenItemDef, LinenCategoryDef,
  CustomerCategoryDef, ProductChecklist, AuditLog, CarryOverAdjustment,
  LegacyDocument, ScheduleOverride, RoutePlan,
  Vehicle, OdometerLog, MaintenanceRecord,
  Round, Crew, DailyTrip, FuelLog,
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
  // 390 C — batch by id list (column=in.(...)) สำหรับ update/delete หลายแถวใน 1 call
  matchIn?: { column: string; values: (string | number)[] }
  onConflict?: string
}): Promise<void> {
  // Get session user ID for auth header (must match auth.ts SESSION_KEY)
  const sessionStr = typeof window !== 'undefined' ? sessionStorage.getItem('flowclean_session') : null
  const sessionUser = sessionStr ? JSON.parse(sessionStr)?.userId || '' : ''
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
  // 397 — QT accepted-scan (path ไฟล์ลายเซ็นตอบรับ)
  acceptedScanPath: 'accepted_scan_path',
  acceptedScanUploadedAt: 'accepted_scan_uploaded_at',
  shortName: 'short_name',
  nameEn: 'name_en',
  customerCode: 'customer_code',
  customerType: 'customer_type',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  creditDays: 'credit_days',
  billingModel: 'billing_model',
  monthlyFlatRate: 'monthly_flat_rate',
  minPerTrip: 'min_per_trip',
  enablePerPiece: 'enable_per_piece',
  enableMinPerTrip: 'enable_min_per_trip',
  enableWaive: 'enable_waive',
  minPerTripThreshold: 'min_per_trip_threshold',
  enableMinPerMonth: 'enable_min_per_month',
  enabledItems: 'enabled_items',
  priceList: 'price_list',
  priceHistory: 'price_history',
  createdAt: 'created_at',
  isActive: 'is_active',
  enableVat: 'enable_vat',
  enableWithholding: 'enable_withholding',
  workflowMode: 'workflow_mode',                  // 265
  defaultCarryOverMode: 'default_carry_over_mode', // 265
  scheduleType: 'schedule_type',                  // 311
  scheduleDays: 'schedule_days',                  // 311
  scheduleStartDate: 'schedule_start_date',       // 311
  scheduleNote: 'schedule_note',                  // 311
  scheduleEveryNDays: 'schedule_every_n_days',    // 311 P2.1
  scheduleBiweeklyAnchorWeek: 'schedule_biweekly_anchor_week', // 311 P2.1
  scheduleEndDate: 'schedule_end_date',           // 377
  scheduleEndCount: 'schedule_end_count',         // 377
  rescheduledLinkId: 'rescheduled_link_id',       // 311 P2.1 (ScheduleOverride)
  isExtraRound: 'is_extra_round',                 // 311
  orderedCustomerIds: 'ordered_customer_ids',     // P5.2 (RoutePlan)
  updatedBy: 'updated_by',                        // P5.2 (RoutePlan)
  sizeGroup: 'size_group',                        // 317
  aggregateSizeGroups: 'aggregate_size_groups',   // 317
  groupInputs: 'group_inputs',                    // 317
  aggregateSnapshot: 'aggregate_snapshot',        // 330
  excludedCodes: 'excluded_codes',                // 404
  autoBalancedAnchor: 'auto_balanced_anchor',     // 340.3
  isProtected: 'is_protected',                    // 347
  protectedReason: 'protected_reason',            // 347
  protectedBy: 'protected_by',                    // 347
  protectedAt: 'protected_at',                    // 347
  vatRate: 'vat_rate',
  withholdingRate: 'withholding_rate',
  formNumber: 'form_number',
  customerId: 'customer_id',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  noteNumber: 'note_number',
  linenFormIds: 'linen_form_ids',
  driverName: 'driver_name',
  vehiclePlate: 'vehicle_plate',
  receiverName: 'receiver_name',
  isPrinted: 'is_printed',
  isExported: 'is_exported',
  isBilled: 'is_billed',
  transportFeeTrip: 'transport_fee_trip',
  transportFeeMonth: 'transport_fee_month',
  discountNote: 'discount_note',
  extraCharge: 'extra_charge',
  extraChargeNote: 'extra_charge_note',
  priceSnapshot: 'price_snapshot',
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
  paidBankId: 'paid_bank_id',
  isPaid: 'is_paid',
  invoiceNumber: 'invoice_number',
  receiptNumber: 'receipt_number', // 148: ใบเสร็จรับเงิน
  billingStatementId: 'billing_statement_id',
  // 161: legacy_documents (netPayable/paidAmount already defined above)
  docNumber: 'doc_number',
  docDate: 'doc_date',
  importedAt: 'imported_at',
  sourceFile: 'source_file',
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
  bankAccounts: 'bank_accounts',
  selectedBankAccountId: 'selected_bank_account_id',
  passwordHash: 'password_hash',
  // Bag counts
  bagsSentCount: 'bags_sent_count',
  bagsPackCount: 'bags_pack_count',
  // Department checkboxes
  deptDrying: 'dept_drying',
  deptIroning: 'dept_ironing',
  deptFolding: 'dept_folding',
  deptQc: 'dept_qc',
  billingMode: 'billing_mode',
  taxOverride: 'tax_override',  // 418 — per-WB tax override
  // Audit log fields
  userId: 'user_id',
  userName: 'user_name',
  entityType: 'entity_type',
  entityId: 'entity_id',
  entityLabel: 'entity_label',
  // Carry-over adjustments
  reasonCategory: 'reason_category',
  showInCustomerReport: 'show_in_customer_report',
  isDeleted: 'is_deleted',
  // 213.2 Phase 1.1 — Catalog facets + customer nicknames
  facetKey: 'facet_key',
  itemNicknames: 'item_nicknames',
  // 423 — Fleet (vehicles / odometer_logs / maintenance_records)
  licensePlate: 'license_plate',
  usageType: 'usage_type',
  registeredDate: 'registered_date',
  insuranceCompany: 'insurance_company',
  insuranceClass: 'insurance_class',
  insuranceExpiry: 'insurance_expiry',
  actExpiry: 'act_expiry',
  taxExpiry: 'tax_expiry',
  inspectionExpiry: 'inspection_expiry',
  currentOdometer: 'current_odometer',
  serviceIntervalKm: 'service_interval_km',
  nextServiceOdometer: 'next_service_odometer',
  vehicleId: 'vehicle_id',
  fuelLevel: 'fuel_level',
  photoPath: 'photo_path',
  nextDueOdometer: 'next_due_odometer',
  expenseId: 'expense_id',
  // 423 Phase B — Rounds + Crew + customer round fields
  startTime: 'start_time',
  endTime: 'end_time',
  defaultVehicleId: 'default_vehicle_id',
  defaultDriverId: 'default_driver_id',
  defaultHelperId: 'default_helper_id',
  roundId: 'round_id',
  routeSequence: 'route_sequence',
  pickupWindowStart: 'pickup_window_start',
  pickupWindowEnd: 'pickup_window_end',
  // 423 Phase B2 — Daily Trip (dispatch). stops[] = JSONB → inner fields ไม่ผ่าน map
  driverId: 'driver_id',
  helperId: 'helper_id',
  // 423 งานติ๊ด — Fuel Log
  pricePerLiter: 'price_per_liter',
  fuelType: 'fuel_type',
  taxInvoiceNumber: 'tax_invoice_number',
  paidBy: 'paid_by',
  isReimbursed: 'is_reimbursed',
  reimbursedDate: 'reimbursed_date',
  receiptPhotoPath: 'receipt_photo_path',
  slipPhotoPath: 'slip_photo_path',
  gaugePhotoPath: 'gauge_photo_path',
  // facets stays the same (single word, no transformation needed)
}

// Reverse map: snake_case → camelCase
const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
)

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = FIELD_MAP[key] || key
    // undefined → null: ให้ clear column ได้จริง (ตรงกับ optimistic state {...i,...updates})
    // JSON.stringify ทิ้ง undefined → เดิม update {sizeGroup: undefined} ไม่ clear DB → reload ค่าเก่ากลับมา
    result[snakeKey] = value === undefined ? null : value
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
// 390 C — Batch update by id list (1 ชุด call, กัน fire-and-forget race)
// ============================================================
// id = UUID 36 ตัว → ตัด chunk กัน URL ยาวเกิน (PostgREST ส่ง in.(...) ใน query string)
// await ทีละ chunk = sequential (ไม่ใช่ parallel fire-and-forget) → ไม่มี race / drop
const BATCH_UPDATE_CHUNK = 150
async function updateByIdChunks(
  table: string,
  ids: string[],
  data: Record<string, unknown>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_UPDATE_CHUNK) {
    const chunk = ids.slice(i, i + BATCH_UPDATE_CHUNK)
    await dbWrite({ table, operation: 'update', data, matchIn: { column: 'id', values: chunk } })
  }
}

// 410 — Batch INSERT chunking · กัน "fail to fetch" บน batch ใหญ่ (DN มี items[]+priceSnapshot ต่อใบ →
//   1399 ใบ payload ก้อนเดียวใหญ่เกิน request limit). await ทีละ chunk = sequential (ไม่ race)
//   partial-fail ปลอดภัยร่วมกับ idempotency guard (409): retry จะข้ามใบที่ insert ไปแล้ว
const BATCH_INSERT_CHUNK = 300
async function insertInChunks(table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_INSERT_CHUNK) {
    await dbWrite({ table, operation: 'insert', data: rows.slice(i, i + BATCH_INSERT_CHUNK) })
  }
}

// 411 — Batch DELETE by id list (DELETE ... id=in.(...)) chunked · sequential await (ไม่ race)
//   กัน loop ลบทีละใบ N HTTP (ช้า/rate-limit/drop) ตอนลบเยอะ (เคส 3922 SD)
async function deleteByIdChunks(table: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_UPDATE_CHUNK) {
    await dbWrite({ table, operation: 'delete', matchIn: { column: 'id', values: ids.slice(i, i + BATCH_UPDATE_CHUNK) } })
  }
}

// ============================================================
// Pagination helper — Supabase API caps at 1000 rows per request
// Use .range() loop to fetch all rows for unbounded tables
// ============================================================
// 403 — กัน duplicate id หลุดเข้า React state · row id ซ้ำ = key collision → ghost rows
//   (โผล่ข้าม filter, sort แล้วเพิ่มเป็น 2 เท่า, ติ๊ก checkbox ไม่ได้, ลอยบนสุด)
function dedupById(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<unknown>()
  const out: Record<string, unknown>[] = []
  for (const r of rows) {
    const id = r.id
    if (id != null) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    out.push(r)
  }
  return out
}

async function fetchAllPaginated<T>(
  tableName: string,
  orderColumn: string,
  ascending: boolean = false,
): Promise<T[]> {
  const PAGE = 1000
  const all: unknown[] = []
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order(orderColumn, { ascending })
      // 403 — tiebreaker ด้วย id (unique) → .range() pagination เสถียร
      //   เดิม order ด้วย orderColumn อย่างเดียว (เช่น 'date' ที่ไม่ unique) → row ที่ date เท่ากัน
      //   เรียงสลับกันได้ระหว่าง 2 request → row ขอบ page ซ้ำ (โผล่ทั้ง page N และ N+1) หรือตกหาย
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  // safety net: ตัด id ซ้ำทิ้ง (เผื่อ pagination ยังหลุด หรือ source อื่น)
  return toCamelCaseArray<T>(dedupById(all as Record<string, unknown>[]))
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
// Customer Categories (Dynamic)
// ============================================================

export async function fetchCustomerCategories(): Promise<CustomerCategoryDef[]> {
  const { data, error } = await supabase
    .from('customer_categories')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return toCamelCaseArray<CustomerCategoryDef>(data || [])
}

export async function insertCustomerCategory(cat: CustomerCategoryDef): Promise<void> {
  await dbWrite({ table: 'customer_categories', operation: 'insert', data: toSnakeCase(cat as unknown as Record<string, unknown>) })
}

export async function updateCustomerCategoryDB(key: string, updates: Partial<CustomerCategoryDef>): Promise<void> {
  await dbWrite({ table: 'customer_categories', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'key', value: key } })
}

export async function deleteCustomerCategoryDB(key: string): Promise<void> {
  await dbWrite({ table: 'customer_categories', operation: 'delete', match: { column: 'key', value: key } })
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
    .select('id, name, email, role, is_active')
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
  return fetchAllPaginated<LinenForm>('linen_forms', 'date')
}

export async function insertLinenForm(form: LinenForm): Promise<void> {
  await dbWrite({ table: 'linen_forms', operation: 'insert', data: toSnakeCase(form as unknown as Record<string, unknown>) })
}

// 372: Batch insert LF — 1 HTTP call (PostgREST รับ array) → กัน fire-and-forget race ตอน batch
export async function insertLinenFormsBatch(forms: LinenForm[]): Promise<void> {
  if (forms.length === 0) return
  // 410 — chunk กัน fail-to-fetch บน batch ใหญ่
  await insertInChunks('linen_forms', forms.map(f => toSnakeCase(f as unknown as Record<string, unknown>)))
}

export async function updateLinenFormDB(id: string, updates: Partial<LinenForm>): Promise<void> {
  await dbWrite({ table: 'linen_forms', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteLinenFormDB(id: string): Promise<void> {
  await dbWrite({ table: 'linen_forms', operation: 'delete', match: { column: 'id', value: id } })
}

// 411 — batch delete LF (ลบ LF เยอะใน 1 ชุด call · chunked กัน URL ยาว/timeout)
export async function deleteLinenFormsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await deleteByIdChunks('linen_forms', ids)
}

// 390 C — ปรับ field เดียวกัน (เช่น aggregateSnapshot) ให้ LF หลายใบใน 1 ชุด call (กัน fire-and-forget race)
export async function updateLinenFormsBatchByIds(ids: string[], updates: Partial<LinenForm>): Promise<void> {
  if (ids.length === 0) return
  await updateByIdChunks('linen_forms', ids, toSnakeCase(updates as unknown as Record<string, unknown>))
}

// ============================================================
// Delivery Notes
// ============================================================

export async function fetchDeliveryNotes(): Promise<DeliveryNote[]> {
  return fetchAllPaginated<DeliveryNote>('delivery_notes', 'date')
}

export async function insertDeliveryNote(note: DeliveryNote): Promise<void> {
  await dbWrite({ table: 'delivery_notes', operation: 'insert', data: toSnakeCase(note as unknown as Record<string, unknown>) })
}

// 288: Batch insert — Supabase PostgREST รับ array ในครั้งเดียว → 1 HTTP call
//   แก้ปัญหา fail-to-fetch บน large batches (>100 records) ที่ fire-and-forget ทำให้
//   browser ติด concurrency limit (~6 connections/host) + Supabase rate limit
export async function insertDeliveryNotesBatch(notes: DeliveryNote[]): Promise<void> {
  if (notes.length === 0) return
  // 410 — chunk กัน fail-to-fetch (เคยเจอ 1399 ใบ → fail · payload items[]+priceSnapshot ต่อใบ)
  await insertInChunks('delivery_notes', notes.map(n => toSnakeCase(n as unknown as Record<string, unknown>)))
}

export async function updateDeliveryNoteDB(id: string, updates: Partial<DeliveryNote>): Promise<void> {
  await dbWrite({ table: 'delivery_notes', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteDeliveryNoteDB(id: string): Promise<void> {
  await dbWrite({ table: 'delivery_notes', operation: 'delete', match: { column: 'id', value: id } })
}

// 411 — batch delete/update DN (ลบ SD เยอะ + unbill เยอะใน 1 ชุด call)
export async function deleteDeliveryNotesBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await deleteByIdChunks('delivery_notes', ids)
}
export async function updateDeliveryNotesBatchByIds(ids: string[], updates: Partial<DeliveryNote>): Promise<void> {
  if (ids.length === 0) return
  await updateByIdChunks('delivery_notes', ids, toSnakeCase(updates as unknown as Record<string, unknown>))
}

// ============================================================
// Billing Statements
// ============================================================

export async function fetchBillingStatements(): Promise<BillingStatement[]> {
  return fetchAllPaginated<BillingStatement>('billing_statements', 'issue_date')
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

// 411 — batch delete WB (ลบ WB เยอะใน 1 ชุด call)
export async function deleteBillingStatementsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await deleteByIdChunks('billing_statements', ids)
}

// ============================================================
// Tax Invoices
// ============================================================

export async function fetchTaxInvoices(): Promise<TaxInvoice[]> {
  return fetchAllPaginated<TaxInvoice>('tax_invoices', 'issue_date')
}

export async function insertTaxInvoice(ti: TaxInvoice): Promise<void> {
  await dbWrite({ table: 'tax_invoices', operation: 'insert', data: toSnakeCase(ti as unknown as Record<string, unknown>) })
}

export async function updateTaxInvoiceDB(id: string, updates: Partial<TaxInvoice>): Promise<void> {
  await dbWrite({ table: 'tax_invoices', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteTaxInvoiceDB(id: string): Promise<void> {
  await dbWrite({ table: 'tax_invoices', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Receipts (Feature 148) — ใบเสร็จรับเงิน สำหรับลูกค้าไม่คิด VAT
// ============================================================

export async function fetchReceipts(): Promise<Receipt[]> {
  return fetchAllPaginated<Receipt>('receipts', 'issue_date')
}

export async function insertReceipt(rc: Receipt): Promise<void> {
  await dbWrite({ table: 'receipts', operation: 'insert', data: toSnakeCase(rc as unknown as Record<string, unknown>) })
}

export async function updateReceiptDB(id: string, updates: Partial<Receipt>): Promise<void> {
  await dbWrite({ table: 'receipts', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteReceiptDB(id: string): Promise<void> {
  await dbWrite({ table: 'receipts', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Legacy Documents (Feature 161) — read-only archive
// ============================================================

export async function fetchLegacyDocuments(): Promise<LegacyDocument[]> {
  // Supabase API caps at 1000 rows per request (max-rows server config)
  // We have 5,093+ legacy docs → paginate via range() in chunks of 1000
  const PAGE = 1000
  const all: unknown[] = []
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await supabase
      .from('legacy_documents')
      .select('*')
      .order('doc_date', { ascending: false })
      .order('id', { ascending: true })   // 403 — tiebreaker unique → .range() เสถียร (5,093+ docs = 6 pages, doc_date ไม่ unique)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return toCamelCaseArray<LegacyDocument>(dedupById(all as Record<string, unknown>[]))
}

// ============================================================
// Quotations
// ============================================================

export async function fetchQuotations(): Promise<Quotation[]> {
  return fetchAllPaginated<Quotation>('quotations', 'date')
}

export async function insertQuotation(q: Quotation): Promise<void> {
  await dbWrite({ table: 'quotations', operation: 'insert', data: toSnakeCase(q as unknown as Record<string, unknown>) })
}

export async function updateQuotationDB(id: string, updates: Partial<Quotation>): Promise<void> {
  await dbWrite({ table: 'quotations', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteQuotationDB(id: string): Promise<void> {
  await dbWrite({ table: 'quotations', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Expenses
// ============================================================

export async function fetchExpenses(): Promise<Expense[]> {
  return fetchAllPaginated<Expense>('expenses', 'date')
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
  return fetchAllPaginated<ProductChecklist>('product_checklists', 'date')
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
// Carry-over Adjustments (51-53)
// ============================================================

export async function fetchCarryOverAdjustments(): Promise<CarryOverAdjustment[]> {
  return fetchAllPaginated<CarryOverAdjustment>('carry_over_adjustments', 'date')
}

export async function insertCarryOverAdjustment(adj: CarryOverAdjustment): Promise<void> {
  await dbWrite({ table: 'carry_over_adjustments', operation: 'insert', data: toSnakeCase(adj as unknown as Record<string, unknown>) })
}

export async function updateCarryOverAdjustmentDB(id: string, updates: Partial<CarryOverAdjustment>): Promise<void> {
  await dbWrite({ table: 'carry_over_adjustments', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteCarryOverAdjustmentDB(id: string): Promise<void> {
  // Soft delete: set is_deleted = true (not actual delete)
  await dbWrite({ table: 'carry_over_adjustments', operation: 'update', data: { is_deleted: true }, match: { column: 'id', value: id } })
}

// 390 C — ปรับ field เดียวกัน (เช่น aggregateSnapshot) ให้ adjustment หลายใบใน 1 ชุด call (กัน fire-and-forget race)
export async function updateCarryOverAdjustmentsBatchByIds(ids: string[], updates: Partial<CarryOverAdjustment>): Promise<void> {
  if (ids.length === 0) return
  await updateByIdChunks('carry_over_adjustments', ids, toSnakeCase(updates as unknown as Record<string, unknown>))
}

// ============================================================
// Schedule Overrides (311 P2)
// ============================================================

export async function fetchScheduleOverrides(): Promise<ScheduleOverride[]> {
  return fetchAllPaginated<ScheduleOverride>('schedule_overrides', 'date')
}

export async function insertScheduleOverride(o: ScheduleOverride): Promise<void> {
  await dbWrite({ table: 'schedule_overrides', operation: 'insert', data: toSnakeCase(o as unknown as Record<string, unknown>) })
}

export async function updateScheduleOverrideDB(id: string, updates: Partial<ScheduleOverride>): Promise<void> {
  await dbWrite({ table: 'schedule_overrides', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteScheduleOverrideDB(id: string): Promise<void> {
  await dbWrite({ table: 'schedule_overrides', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// Route Plans (P5.2 — ลำดับวิ่งต่อวัน)
// ============================================================

export async function fetchRoutePlans(): Promise<RoutePlan[]> {
  return fetchAllPaginated<RoutePlan>('route_plans', 'date')
}

export async function upsertRoutePlanDB(plan: RoutePlan): Promise<void> {
  await dbWrite({ table: 'route_plans', operation: 'upsert', data: toSnakeCase(plan as unknown as Record<string, unknown>), onConflict: 'date' })
}

// ============================================================
// 423 Phase A — Fleet (vehicles / odometer_logs / maintenance_records)
// ============================================================

export async function fetchVehicles(): Promise<Vehicle[]> {
  return fetchAllPaginated<Vehicle>('vehicles', 'code', true)
}

export async function insertVehicle(v: Vehicle): Promise<void> {
  await dbWrite({ table: 'vehicles', operation: 'insert', data: toSnakeCase(v as unknown as Record<string, unknown>) })
}

export async function updateVehicleDB(id: string, updates: Partial<Vehicle>): Promise<void> {
  await dbWrite({ table: 'vehicles', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteVehicleDB(id: string): Promise<void> {
  await dbWrite({ table: 'vehicles', operation: 'delete', match: { column: 'id', value: id } })
}

export async function fetchOdometerLogs(): Promise<OdometerLog[]> {
  return fetchAllPaginated<OdometerLog>('odometer_logs', 'date')
}

export async function insertOdometerLog(o: OdometerLog): Promise<void> {
  await dbWrite({ table: 'odometer_logs', operation: 'insert', data: toSnakeCase(o as unknown as Record<string, unknown>) })
}

export async function deleteOdometerLogDB(id: string): Promise<void> {
  await dbWrite({ table: 'odometer_logs', operation: 'delete', match: { column: 'id', value: id } })
}

export async function fetchMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  return fetchAllPaginated<MaintenanceRecord>('maintenance_records', 'date')
}

export async function insertMaintenanceRecord(m: MaintenanceRecord): Promise<void> {
  await dbWrite({ table: 'maintenance_records', operation: 'insert', data: toSnakeCase(m as unknown as Record<string, unknown>) })
}

export async function updateMaintenanceRecordDB(id: string, updates: Partial<MaintenanceRecord>): Promise<void> {
  await dbWrite({ table: 'maintenance_records', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteMaintenanceRecordDB(id: string): Promise<void> {
  await dbWrite({ table: 'maintenance_records', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// 423 Phase B — Rounds + Crew
// ============================================================

export async function fetchRounds(): Promise<Round[]> {
  return fetchAllPaginated<Round>('rounds', 'sort_order', true)
}

export async function insertRound(r: Round): Promise<void> {
  await dbWrite({ table: 'rounds', operation: 'insert', data: toSnakeCase(r as unknown as Record<string, unknown>) })
}

export async function updateRoundDB(id: string, updates: Partial<Round>): Promise<void> {
  await dbWrite({ table: 'rounds', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteRoundDB(id: string): Promise<void> {
  await dbWrite({ table: 'rounds', operation: 'delete', match: { column: 'id', value: id } })
}

export async function fetchCrew(): Promise<Crew[]> {
  return fetchAllPaginated<Crew>('crew', 'name', true)
}

export async function insertCrew(c: Crew): Promise<void> {
  await dbWrite({ table: 'crew', operation: 'insert', data: toSnakeCase(c as unknown as Record<string, unknown>) })
}

export async function updateCrewDB(id: string, updates: Partial<Crew>): Promise<void> {
  await dbWrite({ table: 'crew', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteCrewDB(id: string): Promise<void> {
  await dbWrite({ table: 'crew', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// 423 Phase B2 — Daily Trips (Dispatch Board)
// ============================================================

export async function fetchDailyTrips(): Promise<DailyTrip[]> {
  return fetchAllPaginated<DailyTrip>('daily_trips', 'date')
}

export async function insertDailyTrip(t: DailyTrip): Promise<void> {
  await dbWrite({ table: 'daily_trips', operation: 'insert', data: toSnakeCase(t as unknown as Record<string, unknown>) })
}

export async function updateDailyTripDB(id: string, updates: Partial<DailyTrip>): Promise<void> {
  await dbWrite({ table: 'daily_trips', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteDailyTripDB(id: string): Promise<void> {
  await dbWrite({ table: 'daily_trips', operation: 'delete', match: { column: 'id', value: id } })
}

// ============================================================
// 423 งานติ๊ด — Fuel Logs (บันทึกการเติมน้ำมัน)
// ============================================================

export async function fetchFuelLogs(): Promise<FuelLog[]> {
  return fetchAllPaginated<FuelLog>('fuel_logs', 'date')
}

export async function insertFuelLog(f: FuelLog): Promise<void> {
  await dbWrite({ table: 'fuel_logs', operation: 'insert', data: toSnakeCase(f as unknown as Record<string, unknown>) })
}

export async function updateFuelLogDB(id: string, updates: Partial<FuelLog>): Promise<void> {
  await dbWrite({ table: 'fuel_logs', operation: 'update', data: toSnakeCase(updates as unknown as Record<string, unknown>), match: { column: 'id', value: id } })
}

export async function deleteFuelLogDB(id: string): Promise<void> {
  await dbWrite({ table: 'fuel_logs', operation: 'delete', match: { column: 'id', value: id } })
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
  const sessionStr = typeof window !== 'undefined' ? sessionStorage.getItem('flowclean_session') : null
  const headers: Record<string, string> = {}
  if (sessionStr) {
    try { headers['x-fc-session'] = JSON.parse(sessionStr).userId } catch { /* ignore */ }
  }
  const res = await fetch('/api/db/truncate', { method: 'POST', headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Truncate failed')
  }
}

// ============================================================
// Bulk Load (for initial hydration)
// ============================================================

// 422 — retry transient fetch failures (network กระตุก / Supabase timeout / rate-limit)
//   อาการเดิม: ตารางใด fetch fail → allSettled fallback เป็น [] เงียบๆ → ข้อมูลหายชั่วคราว
//   (เคส 2026-06-07 19:45 SD หายแล้ว hard refresh กลับมา · delivery_notes paginated = เสี่ยงสุด)
//   retry 2 ครั้ง + backoff ก่อนยอมแพ้ → blip ชั่วคราวฟื้นเองโดย user ไม่ต้องรีเฟรช
async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 2): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        console.warn(`[fetch retry] ${label} ครั้งที่ ${attempt + 1} ล้มเหลว — ลองใหม่`, err)
        await new Promise(res => setTimeout(res, 400 * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

export async function fetchAllData() {
  const results = await Promise.allSettled([
    withRetry(() => fetchCustomers(), 'customers'),
    withRetry(() => fetchLinenForms(), 'linenForms'),
    withRetry(() => fetchDeliveryNotes(), 'deliveryNotes'),
    withRetry(() => fetchBillingStatements(), 'billingStatements'),
    withRetry(() => fetchTaxInvoices(), 'taxInvoices'),
    withRetry(() => fetchQuotations(), 'quotations'),
    withRetry(() => fetchExpenses(), 'expenses'),
    withRetry(() => fetchUsers(), 'users'),
    withRetry(() => fetchCompanyInfo(), 'companyInfo'),
    withRetry(() => fetchLinenItems(), 'linenItems'),
    withRetry(() => fetchChecklists(), 'checklists'),
    withRetry(() => fetchLinenCategories(), 'linenCategories'),
    withRetry(() => fetchCustomerCategories(), 'customerCategories').catch(() => [] as CustomerCategoryDef[]),
    withRetry(() => fetchCarryOverAdjustments(), 'carryOverAdjustments').catch(() => [] as CarryOverAdjustment[]),
    withRetry(() => fetchReceipts(), 'receipts').catch(() => [] as Receipt[]),
    withRetry(() => fetchLegacyDocuments(), 'legacyDocuments').catch(() => [] as LegacyDocument[]),
    withRetry(() => fetchScheduleOverrides(), 'scheduleOverrides').catch(() => [] as ScheduleOverride[]),
    withRetry(() => fetchRoutePlans(), 'routePlans').catch(() => [] as RoutePlan[]),
    withRetry(() => fetchVehicles(), 'vehicles').catch(() => [] as Vehicle[]),
    withRetry(() => fetchOdometerLogs(), 'odometerLogs').catch(() => [] as OdometerLog[]),
    withRetry(() => fetchMaintenanceRecords(), 'maintenanceRecords').catch(() => [] as MaintenanceRecord[]),
    withRetry(() => fetchRounds(), 'rounds').catch(() => [] as Round[]),
    withRetry(() => fetchCrew(), 'crew').catch(() => [] as Crew[]),
    withRetry(() => fetchDailyTrips(), 'dailyTrips').catch(() => [] as DailyTrip[]),
    withRetry(() => fetchFuelLogs(), 'fuelLogs').catch(() => [] as FuelLog[]),
  ])

  const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : (console.error('[fetchAllData] partial fail:', r.reason), fallback)

  // 422 — รายชื่อ core table ที่ fetch ล้มเหลว (หลัง retry) → ให้ UI เตือน user แทนแสดงว่างเงียบๆ
  //   index 0-11 = core (ไม่มี .catch fallback) · 12-17 = non-critical (มี .catch รับไว้แล้ว)
  const CORE_TABLE_LABELS = ['ลูกค้า', 'ใบรับส่งผ้า (LF)', 'ใบส่งของ (SD)', 'ใบวางบิล (WB)', 'ใบกำกับภาษี (IV)', 'ใบเสนอราคา (QT)', 'ค่าใช้จ่าย', 'ผู้ใช้', 'ข้อมูลบริษัท', 'รายการผ้า', 'ใบเช็คผ้า', 'หมวดผ้า']
  const _partialFailures = results.slice(0, 12)
    .map((r, i) => (r.status === 'rejected' ? CORE_TABLE_LABELS[i] : null))
    .filter((x): x is string => x !== null)

  const [
    customers, linenForms, deliveryNotes, billingStatements,
    taxInvoices, quotations, expenses, users, companyInfo,
    linenItems, checklists, linenCategories, customerCategories,
    carryOverAdjustments, receipts, legacyDocuments, scheduleOverrides, routePlans,
    vehicles, odometerLogs, maintenanceRecords, rounds, crew, dailyTrips, fuelLogs,
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
    val(results[12], [] as CustomerCategoryDef[]),
    val(results[13], [] as CarryOverAdjustment[]),
    val(results[14], [] as Receipt[]),
    val(results[15], [] as LegacyDocument[]),
    val(results[16], [] as ScheduleOverride[]),
    val(results[17], [] as RoutePlan[]),
    val(results[18], [] as Vehicle[]),
    val(results[19], [] as OdometerLog[]),
    val(results[20], [] as MaintenanceRecord[]),
    val(results[21], [] as Round[]),
    val(results[22], [] as Crew[]),
    val(results[23], [] as DailyTrip[]),
    val(results[24], [] as FuelLog[]),
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
    customerCategories,
    carryOverAdjustments,
    receipts,
    legacyDocuments,
    scheduleOverrides,
    routePlans,
    vehicles,
    odometerLogs,
    maintenanceRecords,
    rounds,
    crew,
    dailyTrips,
    fuelLogs,
    _partialFailures,
  }
}
