// ============================================================
// FlowClean - Laundry Factory Management System
// Types & Interfaces (v4 — 6-column model)
// ============================================================

// ============================================================
// Standard 21+3 Linen Items
// ============================================================
export type LinenCategory = string

export interface LinenCategoryDef {
  key: string
  label: string
  sortOrder: number
}

// Default categories (seed data — ใช้เมื่อยังไม่มีข้อมูลจาก Supabase)
export const DEFAULT_LINEN_CATEGORIES: LinenCategoryDef[] = [
  { key: 'towel', label: 'ผ้าขนหนู', sortOrder: 1 },
  { key: 'bedsheet', label: 'ผ้าปูที่นอน', sortOrder: 2 },
  { key: 'duvet_cover', label: 'ปลอกดูเว่', sortOrder: 3 },
  { key: 'duvet_insert', label: 'ไส้ดูเว่', sortOrder: 4 },
  { key: 'mattress_pad', label: 'รองกันเปื้อน', sortOrder: 5 },
  { key: 'other', label: 'อื่นๆ', sortOrder: 6 },
]

// Backward-compat lookup (used by legacy code)
export const LINEN_CATEGORIES: Record<string, string> = Object.fromEntries(
  DEFAULT_LINEN_CATEGORIES.map(c => [c.key, c.label])
)

export interface LinenItemDef {
  code: string
  name: string
  nameEn: string
  category: LinenCategory
  unit: string
  defaultPrice: number
  sortOrder: number
}

// Standard 21 items + 3 custom slots
export const STANDARD_LINEN_ITEMS: LinenItemDef[] = [
  // Towels
  { code: 'B/F', name: 'ผ้าเช็ดหน้า', nameEn: 'Face Towel', category: 'towel', unit: 'ผืน', defaultPrice: 4, sortOrder: 1 },
  { code: 'B/H', name: 'ผ้าเช็ดมือ', nameEn: 'Hand Towel', category: 'towel', unit: 'ผืน', defaultPrice: 5, sortOrder: 2 },
  { code: 'B/T', name: 'ผ้าเช็ดตัว', nameEn: 'Bath Towel', category: 'towel', unit: 'ผืน', defaultPrice: 8, sortOrder: 3 },
  // Pillow case
  { code: 'P/C', name: 'ปลอกหมอน', nameEn: 'Pillow Case', category: 'other', unit: 'ใบ', defaultPrice: 5, sortOrder: 4 },
  // Bed sheets by size
  { code: 'S/T', name: "ผ้าปู 3.5'", nameEn: 'Bed Sheet 3.5ft', category: 'bedsheet', unit: 'ผืน', defaultPrice: 12, sortOrder: 5 },
  { code: 'S/Q', name: "ผ้าปู 5'", nameEn: 'Bed Sheet 5ft', category: 'bedsheet', unit: 'ผืน', defaultPrice: 12, sortOrder: 6 },
  { code: 'S/K', name: "ผ้าปู 6'", nameEn: 'Bed Sheet 6ft', category: 'bedsheet', unit: 'ผืน', defaultPrice: 12, sortOrder: 7 },
  // Duvet covers
  { code: 'D/T', name: "ปลอกดูเว่ 3.5'", nameEn: 'Duvet Cover 3.5ft', category: 'duvet_cover', unit: 'ผืน', defaultPrice: 29, sortOrder: 8 },
  { code: 'D/Q', name: "ปลอกดูเว่ 5'", nameEn: 'Duvet Cover 5ft', category: 'duvet_cover', unit: 'ผืน', defaultPrice: 29, sortOrder: 9 },
  { code: 'D/K', name: "ปลอกดูเว่ 6'", nameEn: 'Duvet Cover 6ft', category: 'duvet_cover', unit: 'ผืน', defaultPrice: 29, sortOrder: 10 },
  // Duvet inserts
  { code: 'I/T', name: "ไส้ดูเว่ 3.5'", nameEn: 'Duvet Insert 3.5ft', category: 'duvet_insert', unit: 'ผืน', defaultPrice: 35, sortOrder: 11 },
  { code: 'I/Q', name: "ไส้ดูเว่ 5'", nameEn: 'Duvet Insert 5ft', category: 'duvet_insert', unit: 'ผืน', defaultPrice: 35, sortOrder: 12 },
  { code: 'I/K', name: "ไส้ดูเว่ 6'", nameEn: 'Duvet Insert 6ft', category: 'duvet_insert', unit: 'ผืน', defaultPrice: 35, sortOrder: 13 },
  // Mattress pads
  { code: 'M/T', name: "รองกันเปื้อน 3.5'", nameEn: 'Mattress Pad 3.5ft', category: 'mattress_pad', unit: 'ผืน', defaultPrice: 15, sortOrder: 14 },
  { code: 'M/Q', name: "รองกันเปื้อน 5'", nameEn: 'Mattress Pad 5ft', category: 'mattress_pad', unit: 'ผืน', defaultPrice: 15, sortOrder: 15 },
  { code: 'M/K', name: "รองกันเปื้อน 6'", nameEn: 'Mattress Pad 6ft', category: 'mattress_pad', unit: 'ผืน', defaultPrice: 15, sortOrder: 16 },
  // Other items
  { code: 'B/M', name: 'ผ้าเช็ดเท้า', nameEn: 'Bath Mat', category: 'other', unit: 'ผืน', defaultPrice: 6, sortOrder: 17 },
  { code: 'S/H', name: 'รองเท้า', nameEn: 'Slippers', category: 'other', unit: 'คู่', defaultPrice: 5, sortOrder: 18 },
  { code: 'B/R', name: 'เสื้อคลุม', nameEn: 'Bathrobe', category: 'other', unit: 'ตัว', defaultPrice: 25, sortOrder: 19 },
  { code: 'P/L', name: 'หมอน', nameEn: 'Pillow', category: 'other', unit: 'ใบ', defaultPrice: 20, sortOrder: 20 },
  { code: 'P/T', name: 'ผ้าสระน้ำ', nameEn: 'Pool Towel', category: 'other', unit: 'ผืน', defaultPrice: 12, sortOrder: 21 },
  // Custom slots
  { code: 'C/1', name: 'กำหนดเอง 1', nameEn: 'Custom 1', category: 'other', unit: 'ชิ้น', defaultPrice: 0, sortOrder: 22 },
  { code: 'C/2', name: 'กำหนดเอง 2', nameEn: 'Custom 2', category: 'other', unit: 'ชิ้น', defaultPrice: 0, sortOrder: 23 },
  { code: 'C/3', name: 'กำหนดเอง 3', nameEn: 'Custom 3', category: 'other', unit: 'ชิ้น', defaultPrice: 0, sortOrder: 24 },
]

// ============================================================
// Customer Type
// ============================================================
export type CustomerType = string

export const CUSTOMER_TYPE_CONFIG: Record<string, string> = {
  hotel: 'โรงแรม',
  spa: 'สปา',
  clinic: 'คลินิก',
  restaurant: 'ร้านอาหาร',
  other: 'อื่นๆ',
}

export interface CustomerCategoryDef {
  key: string
  label: string
  sortOrder: number
}

export const DEFAULT_CUSTOMER_CATEGORIES: CustomerCategoryDef[] = [
  { key: 'hotel', label: 'โรงแรม', sortOrder: 1 },
  { key: 'spa', label: 'สปา', sortOrder: 2 },
  { key: 'clinic', label: 'คลินิก', sortOrder: 3 },
  { key: 'restaurant', label: 'ร้านอาหาร', sortOrder: 4 },
  { key: 'other', label: 'อื่นๆ', sortOrder: 5 },
]

// ============================================================
// Customer
// ============================================================
export interface CustomerPriceItem {
  code: string
  price: number
}

export interface CustomerPriceHistoryEntry {
  code: string
  oldPrice: number
  newPrice: number
  effectiveDate: string
  changedBy: string
}

export interface Customer {
  id: string
  customerCode: string // e.g. "HT0001" — 2 uppercase letters + 4 digits
  customerType: CustomerType
  shortName: string // ชื่อย่อ (WOV, Bell, SWD) — ใช้ในงานประจำวัน LF/SD/ตาราง
  name: string // ชื่อบริษัทเต็ม (ใช้ในเอกสารทางการ WB/IV)
  nameEn: string
  address: string
  taxId: string
  branch: string
  contactName: string
  contactPhone: string
  contactEmail: string
  creditDays: number
  billingModel: 'per_piece' | 'monthly_flat' // derived from flags — kept for backward compat
  monthlyFlatRate: number // ยอดขั้นต่ำ/เดือน
  minPerTrip: number // ยอดขั้นต่ำ/ครั้ง
  enablePerPiece: boolean // เงื่อนไข: คิดตามหน่วย
  enableMinPerTrip: boolean // เงื่อนไข: ขั้นต่ำ/ครั้ง
  enableWaive: boolean // เวฟ (ถ้าเท่ากับหรือเกินค่านี้เวฟให้)
  minPerTripThreshold: number // เวฟ threshold
  enableMinPerMonth: boolean // เงื่อนไข: ขั้นต่ำ/เดือน
  selectedBankAccountId: string // references BankAccount.id from CompanyInfo
  enabledItems: string[] // list of linen codes enabled for this hotel
  priceList: CustomerPriceItem[] // per-piece prices
  priceHistory: CustomerPriceHistoryEntry[]
  notes: string
  createdAt: string
  isActive: boolean
  // VAT & WHT toggles — ลูกค้าบางรายไม่ต้องคิด VAT หรือไม่หัก ณ ที่จ่าย
  enableVat: boolean       // คิด VAT (default true)
  enableWithholding: boolean // หัก ณ ที่จ่าย (default true)
}

// ============================================================
// Linen Form (ใบส่งรับผ้า) - 6 columns
// ============================================================
export interface LinenFormRow {
  code: string
  col1_carryOver: number           // ผ้ายกยอดมา (auto, ± ได้: ลบ=ค้างส่ง, บวก=ส่งเกิน)
  col2_hotelCountIn: number        // ลูกค้านับส่ง
  col3_hotelClaimCount: number     // โรงแรมนับส่งเคลม
  col4_factoryApproved: number     // โรงงาน approved (auto-fill=col2, editable)
  col5_factoryClaimApproved: number // โรงซักนับเข้า (auto-fill=col3, editable)
  col6_factoryPackSend: number     // โรงซักแพคส่ง
  note: string                      // หมายเหตุ
}

export type LinenFormStatus = 'draft' | 'received' | 'sorting' | 'washing' | 'packed' | 'delivered' | 'confirmed'

export const LINEN_FORM_STATUS_CONFIG: Record<LinenFormStatus, { label: string; todoLabel: string; prevLabel: string; color: string; bgColor: string; dotColor: string }> = {
  draft: { label: 'ลูกค้านับผ้าส่งซักแล้ว', todoLabel: 'ลูกค้านับผ้าส่งซัก', prevLabel: 'ลูกค้านับผ้าส่งซัก', color: 'text-gray-700', bgColor: 'bg-gray-100', dotColor: 'bg-gray-400' },
  received: { label: 'ขนส่งนับแล้ว', todoLabel: 'ขนส่งนับ', prevLabel: 'ขนส่งนับ', color: 'text-orange-700', bgColor: 'bg-orange-50', dotColor: 'bg-orange-500' },
  sorting: { label: 'โรงซักนับผ้าเข้าแล้ว', todoLabel: 'โรงซักนับผ้าเข้า', prevLabel: 'โรงซักนับผ้าเข้า', color: 'text-orange-700', bgColor: 'bg-orange-50', dotColor: 'bg-orange-500' },
  washing: { label: 'ซักอบเสร็จ', todoLabel: 'กำลังซักอบ', prevLabel: 'กำลังซักอบ', color: 'text-blue-700', bgColor: 'bg-blue-50', dotColor: 'bg-blue-500' },
  packed: { label: 'นับผ้าแพคส่งแล้ว', todoLabel: 'นับผ้าแพคส่ง', prevLabel: 'นับผ้าแพคส่ง', color: 'text-amber-700', bgColor: 'bg-amber-50', dotColor: 'bg-amber-500' },
  delivered: { label: 'นับจำนวนถุงแพคแล้ว', todoLabel: 'นับจำนวนถุงแพค', prevLabel: 'นับจำนวนถุงแพค', color: 'text-amber-700', bgColor: 'bg-amber-50', dotColor: 'bg-amber-500' },
  confirmed: { label: 'ลูกค้านับผ้ากลับแล้ว', todoLabel: 'ลูกค้านับผ้ากลับ', prevLabel: 'ลูกค้านับกลับ', color: 'text-emerald-700', bgColor: 'bg-emerald-50', dotColor: 'bg-emerald-500' },
}

// 4 แผนก — checkbox อิสระ (ไม่บังคับเรียง, ข้ามได้)
export type DepartmentKey = 'deptDrying' | 'deptIroning' | 'deptFolding' | 'deptQc'

export const DEPARTMENT_CONFIG: { key: DepartmentKey; label: string; color: string; bgColor: string; dotColor: string }[] = [
  { key: 'deptDrying', label: 'ผ้าเรียบเสร็จ', color: 'text-sky-700', bgColor: 'bg-sky-50', dotColor: 'bg-sky-500' },
  { key: 'deptIroning', label: 'ปลอกหมอนเสร็จ', color: 'text-violet-700', bgColor: 'bg-violet-50', dotColor: 'bg-violet-500' },
  { key: 'deptFolding', label: 'ผ้าขนเสร็จ', color: 'text-purple-700', bgColor: 'bg-purple-50', dotColor: 'bg-purple-500' },
  { key: 'deptQc', label: 'สปาเสร็จ', color: 'text-pink-700', bgColor: 'bg-pink-50', dotColor: 'bg-pink-500' },
]

export const NEXT_LINEN_STATUS: Record<LinenFormStatus, LinenFormStatus | null> = {
  draft: 'received',
  received: 'sorting',
  sorting: 'washing',
  washing: 'packed',
  packed: 'delivered',
  delivered: 'confirmed',
  confirmed: null,
}

export const PREV_LINEN_STATUS: Record<LinenFormStatus, LinenFormStatus | null> = {
  draft: null,
  received: 'draft',
  sorting: 'received',
  washing: 'sorting',
  packed: 'washing',
  delivered: 'packed',
  confirmed: 'delivered',
}

export const ALL_LINEN_STATUSES: LinenFormStatus[] = [
  'draft', 'received', 'sorting', 'washing', 'packed', 'delivered', 'confirmed',
]

// สถานะที่อยู่ในกระบวนการซัก — แก้ได้แค่หมายเหตุ
export const PROCESS_STATUSES: LinenFormStatus[] = ['sorting']

// Map สถานะเก่า (11 ขั้น) → สถานะใหม่ (7 ขั้น) สำหรับข้อมูลเก่าใน Supabase
export const LEGACY_STATUS_MAP: Record<string, LinenFormStatus> = {
  drying: 'washing',
  ironing: 'packed',
  folding: 'packed',
  qc: 'packed',
}

export interface LinenForm {
  id: string
  formNumber: string // LF-YYYYMMDD-XXX
  customerId: string
  date: string // ISO date
  status: LinenFormStatus
  rows: LinenFormRow[]
  notes: string
  createdBy: string
  updatedAt: string
  // จำนวนถุง
  bagsSentCount: number   // จำนวนถุงกระสอบส่งซัก (กรอกตอน draft)
  bagsPackCount: number   // จำนวนถุงแพคส่ง (กรอกตอน delivered)
  // 4 แผนก — checkbox อิสระ
  deptDrying: boolean
  deptIroning: boolean
  deptFolding: boolean
  deptQc: boolean
  isPrinted?: boolean   // auto-set when user clicks print
  isExported?: boolean  // auto-set when user exports JPG/PDF/CSV
}

// ============================================================
// Delivery Note (ใบส่งของชั่วคราว)
// ============================================================
export type DeliveryNoteStatus = 'pending' | 'delivered' | 'acknowledged'

export const DELIVERY_STATUS_CONFIG: Record<DeliveryNoteStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'รอส่ง', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  delivered: { label: 'ส่งแล้ว', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  acknowledged: { label: 'รับแล้ว', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
}

export interface DeliveryNoteItem {
  code: string
  quantity: number
  isClaim: boolean // เคลม = true → ราคา 0 ไม่คิดเงิน
  displayName?: string // user-editable display name (default: "ค่าบริการซัก " + catalogName)
}

export interface DeliveryNote {
  id: string
  noteNumber: string // SD-YYYYMMDD-XXX
  customerId: string
  linenFormIds: string[] // linked linen forms
  date: string
  items: DeliveryNoteItem[]
  driverName: string
  vehiclePlate: string
  receiverName: string
  status: DeliveryNoteStatus
  isPrinted: boolean    // auto-set when user clicks print
  isExported?: boolean  // auto-set when user exports JPG/PDF/CSV
  isBilled: boolean     // auto-set when included in billing statement
  transportFeeTrip: number   // ค่ารถ (ครั้ง) — auto-calc, editable
  transportFeeMonth: number  // ค่ารถ (เดือน) — on last DN of month, editable
  notes: string
  createdBy: string
  updatedAt: string
}

// ============================================================
// Billing Statement (ใบวางบิล)
// ============================================================
export type BillingStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export const BILLING_STATUS_CONFIG: Record<BillingStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  sent: { label: 'วางบิลแล้ว', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  paid: { label: 'ชำระแล้ว', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  overdue: { label: 'เกินกำหนด', color: 'text-red-700', bgColor: 'bg-red-50' },
}

export interface BillingLineItem {
  code: string
  name: string
  quantity: number
  pricePerUnit: number
  amount: number
}

export interface BillingStatement {
  id: string
  billingNumber: string // WB-YYYYMM-XXX
  customerId: string
  deliveryNoteIds: string[]
  billingMonth: string // YYYY-MM
  issueDate: string
  dueDate: string
  lineItems: BillingLineItem[]
  subtotal: number
  vat: number // 7%
  grandTotal: number
  withholdingTax: number // 3%
  netPayable: number
  status: BillingStatus
  paidDate: string | null
  paidAmount: number
  notes: string
  isPrinted?: boolean
  isExported?: boolean
  billingMode?: 'by_date' | 'by_item' // how line items were grouped
}

// ============================================================
// Tax Invoice (ใบกำกับภาษี)
// ============================================================
export interface TaxInvoice {
  id: string
  invoiceNumber: string // IV-YYYYMM-XXX
  billingStatementId: string
  customerId: string
  issueDate: string
  lineItems: BillingLineItem[]
  subtotal: number
  vat: number
  grandTotal: number
  notes: string
  isPrinted?: boolean
  isExported?: boolean
  isPaid?: boolean
}

// ============================================================
// Quotation (ใบเสนอราคา)
// ============================================================
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export const QUOTATION_STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  sent: { label: 'ส่งแล้ว', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  accepted: { label: 'ตกลง', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  rejected: { label: 'ปฏิเสธ', color: 'text-red-700', bgColor: 'bg-red-50' },
}

export interface QuotationItem {
  code: string
  name: string
  pricePerUnit: number
}

export interface Quotation {
  id: string
  quotationNumber: string // QT-YYYYMM-XXX
  customerId: string // FK → customers.id (required)
  customerName: string
  customerContact: string
  date: string
  validUntil: string
  items: QuotationItem[]
  conditions: string
  status: QuotationStatus
  notes: string
  // Billing conditions — moved here from customer edit (apply to customer on accept)
  enablePerPiece?: boolean
  enableMinPerTrip?: boolean
  minPerTrip?: number
  enableWaive?: boolean
  minPerTripThreshold?: number
  enableMinPerMonth?: boolean
  monthlyFlatRate?: number
}

// ============================================================
// Expense (เก็บไว้เหมือนเดิม)
// ============================================================
export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  description: string
  amount: number
  reference: string
  createdBy: string
}

export type ExpenseCategory = 'chemicals' | 'water' | 'electricity' | 'labor' | 'transport' | 'maintenance' | 'rent' | 'other'

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; icon: string }> = {
  chemicals: { label: 'น้ำยาซักผ้า/เคมี', icon: '🧪' },
  water: { label: 'ค่าน้ำ', icon: '💧' },
  electricity: { label: 'ค่าไฟ', icon: '⚡' },
  labor: { label: 'ค่าแรง', icon: '👷' },
  transport: { label: 'ค่าขนส่ง', icon: '🚚' },
  maintenance: { label: 'ซ่อมบำรุง', icon: '🔧' },
  rent: { label: 'ค่าเช่า', icon: '🏭' },
  other: { label: 'อื่นๆ', icon: '📦' },
}

// ============================================================
// App User
// ============================================================
export interface AppUser {
  id: string
  name: string
  email: string
  passwordHash: string
  role: 'admin' | 'staff'
  isActive: boolean
}

// ============================================================
// Audit Log
// ============================================================
export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'login_fail' | 'logout'

export type AuditEntityType =
  | 'customer' | 'linen_form' | 'delivery_note' | 'billing' | 'tax_invoice'
  | 'quotation' | 'expense' | 'checklist' | 'user' | 'company' | 'linen_item' | 'linen_category' | 'session'

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: AuditAction
  entityType: AuditEntityType
  entityId: string
  entityLabel: string
  details: string
  createdAt: string
}

// ============================================================
// Bank Account
// ============================================================
export interface BankAccount {
  id: string
  bankName: string
  accountName: string
  accountNumber: string
  isDefault: boolean
}

// ============================================================
// Company Info (for tax invoices)
// ============================================================
export interface CompanyInfo {
  name: string
  nameEn: string
  address: string
  taxId: string
  branch: string
  phone: string
  bankName: string
  bankAccountName: string
  bankAccountNumber: string
  bankAccounts: BankAccount[]
  vatRate: number           // % VAT (default 7)
  withholdingRate: number   // % หัก ณ ที่จ่าย (default 3)
}

// ============================================================
// Product Checklist (ใบเช็คสินค้า)
// ============================================================
export type ChecklistType = 'qc' | 'loading'
export type ChecklistStatus = 'draft' | 'checked' | 'approved'

export const CHECKLIST_TYPE_CONFIG: Record<ChecklistType, { label: string; description: string }> = {
  qc: { label: 'ตรวจคุณภาพ (QC)', description: 'ตรวจ flow ในโรงงาน' },
  loading: { label: 'ขึ้นรถ (Loading)', description: 'ตรวจสินค้าก่อนขึ้นรถขนส่ง' },
}

export const CHECKLIST_STATUS_CONFIG: Record<ChecklistStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  checked: { label: 'ตรวจแล้ว', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  approved: { label: 'อนุมัติ', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
}

export interface ChecklistItem {
  code: string
  name: string
  expectedQty: number
  actualQty: number
  passed: boolean
  note: string
}

export interface ProductChecklist {
  id: string
  checklistNumber: string // CK-YYYYMMDD-XXX
  type: ChecklistType
  customerId: string
  linkedDocumentId: string // LinenForm ID (qc) or DeliveryNote ID (loading)
  linkedDocumentNumber: string
  date: string
  items: ChecklistItem[]
  inspectorName: string
  status: ChecklistStatus
  notes: string
  createdBy: string
  updatedAt: string
}
