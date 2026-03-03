// ============================================================
// FlowClean - Laundry Factory Management System
// Types & Interfaces (Redesigned for Linen Form workflow)
// ============================================================

// ============================================================
// Standard 21+3 Linen Items
// ============================================================
export type LinenCategory = 'towel' | 'bedsheet' | 'duvet_cover' | 'duvet_insert' | 'mattress_pad' | 'other'

export const LINEN_CATEGORIES: Record<LinenCategory, string> = {
  towel: 'ผ้าขนหนู',
  bedsheet: 'ผ้าปูที่นอน',
  duvet_cover: 'ปลอกดูเว่',
  duvet_insert: 'ไส้ดูเว่',
  mattress_pad: 'รองกันเปื้อน',
  other: 'อื่นๆ',
}

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
// Customer
// ============================================================
export interface CustomerPriceItem {
  code: string
  price: number
}

export interface Customer {
  id: string
  name: string
  nameEn: string
  address: string
  taxId: string
  branch: string
  contactName: string
  contactPhone: string
  contactEmail: string
  creditDays: number
  billingModel: 'per_piece' | 'monthly_flat'
  monthlyFlatRate: number
  enabledItems: string[] // list of linen codes enabled for this hotel
  priceList: CustomerPriceItem[] // per-piece prices
  notes: string
  createdAt: string
  isActive: boolean
}

// ============================================================
// Linen Form (ใบส่งรับผ้า) - 6 columns
// ============================================================
export interface LinenFormRow {
  code: string
  col1_normalSend: number    // ส่งซักปกติ
  col2_claimSend: number     // เคลม/ส่งซักพิเศษ
  col3_washedReturn: number  // ซักแล้วกลับ (กรอกรอบถัดไป)
  col4_factoryCountIn: number // โรงงานนับเข้า
  col5_factoryPackSend: number // โรงงานแพคส่ง
  col6_note: string           // หมายเหตุ
}

export type LinenFormStatus = 'draft' | 'received' | 'sorting' | 'washing' | 'drying' | 'ironing' | 'folding' | 'qc' | 'packed' | 'delivered' | 'confirmed'

export const LINEN_FORM_STATUS_CONFIG: Record<LinenFormStatus, { label: string; color: string; bgColor: string; dotColor: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-700', bgColor: 'bg-gray-100', dotColor: 'bg-gray-400' },
  received: { label: 'รับผ้า', color: 'text-amber-700', bgColor: 'bg-amber-50', dotColor: 'bg-amber-500' },
  sorting: { label: 'คัดแยก', color: 'text-orange-700', bgColor: 'bg-orange-50', dotColor: 'bg-orange-500' },
  washing: { label: 'ซัก', color: 'text-blue-700', bgColor: 'bg-blue-50', dotColor: 'bg-blue-500' },
  drying: { label: 'อบ', color: 'text-sky-700', bgColor: 'bg-sky-50', dotColor: 'bg-sky-500' },
  ironing: { label: 'รีด', color: 'text-violet-700', bgColor: 'bg-violet-50', dotColor: 'bg-violet-500' },
  folding: { label: 'พับ', color: 'text-purple-700', bgColor: 'bg-purple-50', dotColor: 'bg-purple-500' },
  qc: { label: 'ตรวจ QC', color: 'text-pink-700', bgColor: 'bg-pink-50', dotColor: 'bg-pink-500' },
  packed: { label: 'แพค', color: 'text-indigo-700', bgColor: 'bg-indigo-50', dotColor: 'bg-indigo-500' },
  delivered: { label: 'ส่งแล้ว', color: 'text-teal-700', bgColor: 'bg-teal-50', dotColor: 'bg-teal-500' },
  confirmed: { label: 'ยืนยัน', color: 'text-emerald-700', bgColor: 'bg-emerald-50', dotColor: 'bg-emerald-500' },
}

export const NEXT_LINEN_STATUS: Record<LinenFormStatus, LinenFormStatus | null> = {
  draft: 'received',
  received: 'sorting',
  sorting: 'washing',
  washing: 'drying',
  drying: 'ironing',
  ironing: 'folding',
  folding: 'qc',
  qc: 'packed',
  packed: 'delivered',
  delivered: 'confirmed',
  confirmed: null,
}

export const ALL_LINEN_STATUSES: LinenFormStatus[] = [
  'draft', 'received', 'sorting', 'washing', 'drying', 'ironing', 'folding', 'qc', 'packed', 'delivered', 'confirmed',
]

// สถานะที่อยู่ในกระบวนการซัก (sorting-qc) — แก้ได้แค่หมายเหตุ
export const PROCESS_STATUSES: LinenFormStatus[] = ['sorting', 'washing', 'drying', 'ironing', 'folding', 'qc']

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
  quotationNumber: string // QU-YYYYMM-XXX
  customerName: string
  customerContact: string
  date: string
  validUntil: string
  items: QuotationItem[]
  conditions: string
  status: QuotationStatus
  notes: string
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
// App User (เก็บไว้เหมือนเดิม)
// ============================================================
export interface AppUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'staff'
  isActive: boolean
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
