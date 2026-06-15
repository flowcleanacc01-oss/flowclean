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

// ============================================================
// 213.2 Phase 1.1 — Faceted vocabulary (optional, backward compat)
// ============================================================

/**
 * Structured facets สำหรับ catalog item
 * - ใช้แทนการตั้งชื่อ free-text (ซึ่งทำให้เกิด drift)
 * - facetKey ของรายการที่ facets เหมือนกัน = string เดียวกัน → กัน duplicate
 * - Code + canonical name auto-generated จาก facets
 *
 * Phase 1.1: optional — ของเก่าใช้งานได้ตามเดิม
 * Phase 2+: enforce ผ่าน Wizard 2.0
 */
export interface LinenFacets {
  type: string                  // REQUIRED — towel/bed_sheet/pillow_case/...
  application?: string | null   // subtype within type (e.g., pillow_case+wing, blanket+thin)
  size?: string | null          // preset (single/queen/12x12) OR custom WxH (30x60)
  sizeUnit?: 'inch' | 'cm' | 'ft' | 'standard' | null
  color?: string | null
  weight?: 'thin' | 'medium' | 'thick' | null
  material?: string | null
  pattern?: string | null
  /** 247 — special treatment: น้ำมัน/อบแห้ง/ถอดซักปลอก */
  treatment?: string | null
  variant?: string | null       // free-text fallback (brand/class/edge cases)
}

export interface LinenItemDef {
  code: string
  name: string
  nameEn: string
  /** 376 — Burmese name (optional) สำหรับฟอร์ม 3 ภาษา · fallback = name+nameEn */
  nameMy?: string
  category: LinenCategory
  unit: string
  defaultPrice: number
  sortOrder: number
  // 213.2 Phase 1.1 — optional facets
  facets?: LinenFacets
  /** Deterministic hash of facets — same facets = same key (กัน dup ระดับ schema) */
  facetKey?: string
  // 317 Phase 1 — Size Groups (รวมไซส์ตอนนับเข้า)
  // Codes ที่มี sizeGroup เดียวกัน = "ครอบครัวไซส์" — ลูกค้า opt-in รายตัว
  // เช่น S/T, S/Q, S/K → sizeGroup="BEDSHEET"
  // ใช้กับรายการที่แยกไซส์ตอนนับเข้ายาก (ผ้าใหญ่/ผ้าหลายสี)
  sizeGroup?: string
  // 347 — Admin Lock (replaces 338 X-prefix regex)
  // is_protected = TRUE → block merge / warn ที่ tools ต่างๆ
  // ใช้สื่อสาร admin คนอื่นว่า "อย่าแตะ" + แต่ยังปลดล็อคได้ถ้าจำเป็น
  isProtected?: boolean
  protectedReason?: string
  protectedBy?: string         // user id หรือ name ที่ lock
  protectedAt?: string         // ISO timestamp
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
  // 213.2 Phase 1.1 — per-customer item display alias
  // Map: catalog code → nickname ที่ลูกค้าคนนี้ใช้
  // ใช้ตอน render ใน LF/SD/QT/print ของลูกค้านี้
  // Reports/audit/Cmd+K ใช้ canonical เสมอ
  itemNicknames?: Record<string, string>
  // 265 — Workflow + Carry-over preferences
  // workflowMode: 'cross_check' (default) ใช้ครบ 6 cols / 'trust_customer' ข้าม col4+col5
  // defaultCarryOverMode: default mode สำหรับ reports หน้าลูกค้านี้
  //   - trust_customer ปกติใช้ Mode 2 (col6 − (col2+col3))
  //   - cross_check ปกติใช้ Mode 1 (col6 − col5)
  workflowMode?: WorkflowMode
  defaultCarryOverMode?: CarryOverMode
  // 311 — Schedule-based SD Audit
  // scheduleType: 'none' (default) | 'daily' | 'every_n_days' | 'weekly' | 'biweekly'
  // scheduleDays: 0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์ — ใช้กับ weekly + biweekly
  // scheduleStartDate: anchor date (จำเป็น every_n_days + biweekly · optional weekly/daily)
  // scheduleEveryNDays: step (วัน) สำหรับ every_n_days (เช่น 2 = ทุก 48hr)
  // scheduleBiweeklyAnchorWeek: 0/1 parity จาก scheduleStartDate (P2.1)
  scheduleType?: ScheduleType
  scheduleDays?: number[]
  scheduleStartDate?: string // ISO date
  scheduleEveryNDays?: number
  scheduleBiweeklyAnchorWeek?: 0 | 1
  // 377 — เงื่อนไขสิ้นสุด (เหมือน Google Calendar recurrence end)
  // scheduleEndDate: schedule วิ่งถึงวันนี้ (inclusive) แล้วหยุด · undefined = ไม่หยุด (default)
  // scheduleEndCount: display hint "สิ้นสุดหลัง N ครั้ง" — แปลงเป็น scheduleEndDate ตอนเซฟ
  scheduleEndDate?: string
  scheduleEndCount?: number
  scheduleNote?: string
  // 317 Phase 1 — Aggregate Size Groups (per-customer opt-in)
  // ลูกค้า opt-in รายตัวว่า size group ไหน "นับรวมไซส์" บ้าง
  // groupKey ตรงกับ LinenItemDef.sizeGroup
  // col2Mode: ลูกค้าส่ง col2 (นับส่งซัก) แบบไหน
  //   - 'aggregate' = ส่งรวมไม่แยกไซส์ (กรอก col2 ที่ group level)
  //   - 'per_row'   = ส่งแยกไซส์ (กรอก col2 ต่อ row ตามเดิม)
  aggregateSizeGroups?: AggregateSizeGroupConfig[]
  // 423 Phase B — รอบประจำ (1 ลูกค้า 1 รอบ) + ลำดับวิ่ง default + หน้าต่างเวลา
  roundId?: string              // รอบที่ลูกค้าผูกประจำ ('' = ยังไม่จัดรอบ)
  roundDayOverrides?: Record<number, string> // 429 — ข้อยกเว้นรายวัน {weekday 0-6: roundId} ชนะ roundId วันนั้น (0=อาทิตย์)
  routeSequence?: number        // ลำดับวิ่ง default ในรอบ (1,2,3…)
  pickupWindowStart?: string    // หน้าต่างเวลาเข้ารับได้ 'HH:MM' ('' = ไม่จำกัด)
  pickupWindowEnd?: string
  // 423 B-2 — กลุ่มเจ้าของเดียวกัน (tag) → ยกเว้น skip-queue alert เมื่อสาขาอื่นในกลุ่มส่งแล้ว
  ownerGroup?: string           // เช่น 'SEN', 'รามบุตรี' ('' = ไม่มีกลุ่ม)
  // 427 — พิกัดหน้างาน (จับคู่จุดจบเที่ยววิ่ง GPS รัศมี ~150ม. → ชื่อลูกค้า) · 0 = ยังไม่ตั้ง
  gpsLat?: number
  gpsLng?: number
}

// 317 Phase 1 — Aggregate Size Group Config (per customer, per group)
// 317 Phase 1.5 (321 update) — col2Mode + col5Mode แยกกัน — ทั้งคู่อาจ aggregate หรือ per_row
export interface AggregateSizeGroupConfig {
  groupKey: string                          // ตรงกับ LinenItemDef.sizeGroup
  col2Mode: 'aggregate' | 'per_row'         // ลูกค้านับส่งซัก: รวม หรือ แยกไซส์
  col5Mode?: 'aggregate' | 'per_row'        // โรงซักนับเข้า: รวม หรือ แยกไซส์ (default aggregate)
  // 335 — manual anchor override (default = median sortOrder อัตโนมัติ)
  // ถ้า user เลือก code นอก group → ignore (validate ตอน save)
  anchorCode?: string
  // col3 (เคลม) แยกเสมอ — ไม่ track ที่นี่
  // col4 (ลูกค้านับกลับ) แยกเสมอ
  // col6 (โรงซักแพคส่ง) แยกเสมอ — track ไซส์หลังพับ
}

// 311 — Schedule type สำหรับ Schedule-Based SD Audit
export type ScheduleType = 'none' | 'daily' | 'every_n_days' | 'weekly' | 'biweekly'

export const SCHEDULE_TYPE_CONFIG: Record<ScheduleType, { label: string; description: string }> = {
  none: { label: 'ไม่ตั้งคิว', description: 'ยังไม่ได้ตั้งคิวส่ง — ไม่อยู่ใน Schedule Audit' },
  daily: { label: 'ทุกวัน', description: 'ส่งทุกวัน' },
  every_n_days: { label: 'วันเว้นวัน', description: 'ส่งวันเว้นวัน (48 ชม. = ทุก 2 วัน) — ปรับเป็นทุก N วันได้' },
  weekly: { label: 'รายสัปดาห์', description: 'ส่งตามวันในสัปดาห์ (เช่น จันทร์/พุธ/ศุกร์)' },
  biweekly: { label: '2 สัปดาห์ครั้ง', description: 'ส่งทุก 2 สัปดาห์ (เว้นสัปดาห์) — เลือกวันในสัปดาห์' },
}

export const WEEKDAY_LABELS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
export const WEEKDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// 311 P2.1 — Schedule Override
export type ScheduleOverrideType = 'skip' | 'extra' | 'reschedule_skip' | 'reschedule_add'

export interface ScheduleOverride {
  id: string
  customerId: string
  date: string                    // ISO YYYY-MM-DD — วันที่ถูก override
  type: ScheduleOverrideType
  reason: string                  // เหตุผล (เช่น "ลูกค้าขอข้าม", "ผ้าน้อย", "เลื่อนเป็นพรุ่งนี้")
  rescheduledLinkId?: string      // pair link: reschedule_skip ↔ reschedule_add
  createdAt: string
  createdBy: string
}

export const SCHEDULE_OVERRIDE_TYPE_CONFIG: Record<ScheduleOverrideType, { label: string; short: string; color: string }> = {
  skip:               { label: 'ข้ามคิว', short: 'Skip', color: 'amber' },
  extra:              { label: 'รอบเสริม', short: 'Extra', color: 'blue' },
  reschedule_skip:    { label: 'เลื่อนออก (skip)', short: 'R-Skip', color: 'purple' },
  reschedule_add:     { label: 'เลื่อนเข้า (add)', short: 'R-Add', color: 'indigo' },
}

// P5.2 — Route Plan (ลำดับวิ่งรับ-ส่งผ้าต่อวัน)
// 1 row ต่อวัน · orderedCustomerIds = customerId เรียงตามลำดับที่คนขับวิ่ง
// ลูกค้าที่ไม่อยู่ใน array = ยังไม่จัดลำดับ (default sort ต่อท้าย)
export interface RoutePlan {
  id: string
  date: string                   // ISO YYYY-MM-DD (unique)
  orderedCustomerIds: string[]
  updatedAt: string
  updatedBy: string
}

// 265 — Workflow mode สำหรับลูกค้า + LF
export type WorkflowMode = 'cross_check' | 'trust_customer'

export const WORKFLOW_MODE_CONFIG: Record<WorkflowMode, { label: string; short: string; description: string; icon: string }> = {
  cross_check: {
    label: 'Cross Check (โรงงานนับเข้า)',
    short: 'ตรวจซ้ำ',
    description: 'โรงงานนับซ้ำเพื่อตรวจสอบ — ใช้ครบ 6 columns',
    icon: '🔄',
  },
  trust_customer: {
    label: 'Trust Customer (ไม่นับเข้า)',
    short: 'ไม่ตรวจซ้ำ',
    description: 'เชื่อยอดลูกค้านับส่ง — ข้ามนับเข้า (col5) แต่ยังกรอก col4 (ลูกค้านับกลับ) เพื่อ cross check ครั้งที่ 2',
    icon: '✅',
  },
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
  // 363 — per-bag breakdown ของ col6 จากใบเช็คผ้า (audit trail) เช่น [43, 36] · col6 = sum
  //   เก็บใน rows JSONB (ไม่ต้อง migration) · ไว้ชี้แจงลูกค้าเวลาแย้ง "ส่งกี่ถุง"
  col6Breakdown?: number[]
  note: string                      // หมายเหตุ
  // 70+73+74+75 — Discrepancy sync tracking
  // เมื่อ user "approve" col4 ↔ col6 sync — เก็บค่าเดิมไว้สำหรับ history + รายงาน Type 2 (Resolved)
  originalCol6?: number            // ค่า col6 เดิม (ก่อน sync) — ถ้า > 0 = "เคยถูก sync"
  originalCol4?: number            // ค่า col4 เดิม (ก่อน sync)
  syncedAt?: string                // วันที่ sync (ISO datetime)
  syncedBy?: string                // user ที่ sync
  syncSource?: 'lf_manual' | 'sd_create' | 'sd_edit'  // มาจากไหน
}

export type LinenFormStatus = 'draft' | 'received' | 'sorting' | 'washing' | 'packed' | 'delivered' | 'confirmed'

export const LINEN_FORM_STATUS_CONFIG: Record<LinenFormStatus, { label: string; todoLabel: string; prevLabel: string; color: string; bgColor: string; dotColor: string }> = {
  draft: { label: '1/7 ลูกค้านับส่งแล้ว', todoLabel: 'ลูกค้านับผ้าส่งซัก', prevLabel: 'ลูกค้านับผ้าส่งซัก', color: 'text-gray-700', bgColor: 'bg-gray-100', dotColor: 'bg-gray-400' },
  received: { label: '2/7 ขนส่งนับแล้ว', todoLabel: 'ขนส่งนับ', prevLabel: 'ขนส่งนับ', color: 'text-gray-700', bgColor: 'bg-gray-100', dotColor: 'bg-gray-400' },
  sorting: { label: '3/7 โรงซักนับเข้าแล้ว', todoLabel: 'โรงซักนับผ้าเข้า', prevLabel: 'โรงซักนับผ้าเข้า', color: 'text-red-700', bgColor: 'bg-red-50', dotColor: 'bg-red-500' },
  washing: { label: '4/7 ซักอบเสร็จ', todoLabel: 'กำลังซักอบ', prevLabel: 'กำลังซักอบ', color: 'text-blue-700', bgColor: 'bg-blue-50', dotColor: 'bg-blue-500' },
  packed: { label: '5/7 นับผ้าแพคส่งแล้ว', todoLabel: 'นับผ้าแพคส่ง', prevLabel: 'นับผ้าแพคส่ง', color: 'text-amber-700', bgColor: 'bg-amber-50', dotColor: 'bg-amber-500' },
  delivered: { label: '6/7 นับจำนวนถุงแพคแล้ว', todoLabel: 'นับจำนวนถุงแพค', prevLabel: 'นับจำนวนถุงแพค', color: 'text-amber-700', bgColor: 'bg-amber-50', dotColor: 'bg-amber-500' },
  confirmed: { label: '7/7 ลูกค้านับผ้ากลับแล้ว', todoLabel: 'ลูกค้านับผ้ากลับ', prevLabel: 'ลูกค้านับกลับ', color: 'text-emerald-700', bgColor: 'bg-emerald-50', dotColor: 'bg-emerald-500' },
}

// 4 แผนก — checkbox อิสระ (ไม่บังคับเรียง, ข้ามได้)
export type DepartmentKey = 'deptDrying' | 'deptIroning' | 'deptFolding' | 'deptQc'

export const DEPARTMENT_CONFIG: { key: DepartmentKey; label: string; color: string; bgColor: string; dotColor: string }[] = [
  { key: 'deptDrying', label: 'ผ้าเรียบเสร็จ', color: 'text-sky-700', bgColor: 'bg-sky-50', dotColor: 'bg-sky-500' },
  { key: 'deptIroning', label: 'ปลอกหมอนเสร็จ', color: 'text-violet-700', bgColor: 'bg-violet-50', dotColor: 'bg-violet-500' },
  { key: 'deptFolding', label: 'ผ้าขนเสร็จ', color: 'text-orange-700', bgColor: 'bg-orange-50', dotColor: 'bg-orange-500' },
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
  // 265 — snapshot ตอนสร้าง LF (กัน drift เมื่อ customer toggle ภายหลัง)
  workflowMode?: WorkflowMode
  // 317 Phase 2 — Group-level inputs (รวมไซส์ตอนนับเข้า)
  // { [groupKey]: { col5?: number, col2?: number } }
  // - col5 = โรงซักนับเข้ารวมทั้ง group (เมื่อ customer opt-in)
  // - col2 = ลูกค้านับส่งซักรวม (เมื่อ col2Mode = 'aggregate')
  // - col3 เคลม + col6 แพคส่ง ใช้ row-level เสมอ
  // Phase 1: จะอยู่ใน schema แต่ยังไม่ใช้ — read-only views อ่าน row-level sum
  groupInputs?: Record<string, { col5?: number; col2?: number }>
  // 330 — snapshot ของ aggregateSizeGroups ตอนสร้าง LF (กัน drift เมื่อ customer toggle ภายหลัง)
  // Pattern เดียวกับ workflowMode snapshot (265) — getCarryOver ใช้ snapshot ของ LF แต่ละใบ
  // A1 (354.1): เพิ่ม anchorCode → drift-proof reprint (ถ้า anchor ของ customer เปลี่ยน
  //             LF เก่ายัง show anchor ของตัวเองตอนสร้าง)
  aggregateSnapshot?: Record<string, {
    col2Mode: 'aggregate' | 'per_row'
    col5Mode: 'aggregate' | 'per_row'
    anchorCode?: string
  }>
  // 404 — codes ที่ user ลบออกจาก LF ใบนี้ (universal row delete)
  //   grid ดึงรายการจาก QT ตัวจริง → ถ้า item ยังอยู่ใน QT การลบแถวเฉยๆ จะเด้งกลับมาเป็นแถวเปล่า
  //   เก็บ code ที่ลบไว้ที่นี่ → grid filter ออก (ซ่อนเฉพาะ LF ใบนี้ ไม่แตะ QT)
  //   undo ได้: เอา code ออกจาก list หรือเพิ่ม item กลับผ่าน AddItemWizard
  excludedCodes?: string[]
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
  // Layer 3 (2026-04-28): Ad-hoc รายการพิเศษ — ไม่อยู่ใน catalog/QT
  // ใช้กรณี one-off rare items, ไม่ปนสถิติ stock/carry-over
  isAdhoc?: boolean
  adhocName?: string  // free-text ชื่อรายการพิเศษ (used when isAdhoc=true)
  adhocPrice?: number // ราคา/หน่วย ที่กรอกเอง
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
  discount?: number          // ส่วนลดพิเศษ (default 0)
  discountNote?: string      // หมายเหตุส่วนลด
  extraCharge?: number       // ค่าใช้จ่ายเพิ่มเติม (default 0)
  extraChargeNote?: string   // หมายเหตุค่าใช้จ่ายเพิ่มเติม
  priceSnapshot?: Record<string, number> // ราคา ณ วันที่สร้าง (จาก QT) — ล็อคไม่เปลี่ยนตาม QT ใหม่
  notes: string
  createdBy: string
  updatedAt: string
  // 311 — รอบเสริม (urgent/pre-delivery)
  // false (default) = รอบนัดหมายปกติ — นับใน Schedule Audit
  // true = รอบเสริม — ไม่นับใน Schedule Audit (informational only)
  isExtraRound?: boolean
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
  paidBankId?: string  // 82: bank account ที่รับเงิน (ref company.bankAccounts.id)
  notes: string
  isPrinted?: boolean
  isExported?: boolean
  billingMode?: 'by_date' | 'by_item' | 'by_total' // how line items were grouped
  /** 418: per-WB tax override — undefined = ตามค่าลูกค้า (เดิม) · 'full' = VAT+หัก ณ ที่จ่าย · 'none' = ไม่มีภาษี
   *  ใช้กับลูกค้าที่ WB บางใบมีภาษี บางใบไม่มี (เช่น J19 วันคี่/คู่) — เลิก toggle flag ลูกค้า + audit รับรู้ว่าตั้งใจ */
  taxOverride?: 'full' | 'none'
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
// Legacy Document (Feature 161) — ประวัติเอกสารจากระบบเก่า (NeoSME)
// Read-only archive — ไม่กระทบ workflow ปัจจุบัน
// ============================================================
export type LegacyDocKind = 'WB' | 'IV' | 'SD' | 'QT'

export interface LegacyDocument {
  id: string
  kind: LegacyDocKind
  docNumber: string             // WB650900001, IV651200005, ...
  docDate: string               // ISO YYYY-MM-DD
  customerId: string            // FK to customers (may be empty if unmatched)
  customerName: string          // snapshot from source
  customerCode: string          // legacy X-prefix
  amount: number
  netPayable: number            // WB only
  paidAmount: number            // WB only
  outstanding: number           // WB only
  status: string                // legacy status code (P/LP/B/...)
  dueDate: string
  notes: string
  importedAt: string
  sourceFile: string
}

// ============================================================
// Receipt (ใบเสร็จรับเงิน) — Feature 148
// สำหรับลูกค้าที่ไม่คิด VAT (enableVat=false) ที่ต้องการหลักฐานการชำระเงิน
// ❌ ไม่ใช่ใบกำกับภาษี · ❌ ไม่มีข้อมูลบริษัทเต็ม (เอาแค่ brand) · ❌ ไม่มี VAT
// ✅ Brand only "FlowClean Laundry Service" · ✅ ชื่อย่อลูกค้า · ✅ Watermark เตือน
// ============================================================
export interface Receipt {
  id: string
  receiptNumber: string // RC-YYYYMM-NNN
  billingStatementId: string
  customerId: string
  issueDate: string
  lineItems: BillingLineItem[]
  subtotal: number
  grandTotal: number // = subtotal (no VAT)
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
  // 397 — ไฟล์สแกนใบตอบรับที่ลูกค้าเซ็น (เก็บใน Supabase Storage · DB เก็บแค่ path)
  acceptedScanPath?: string
  acceptedScanUploadedAt?: string
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
  vehicleId?: string // 423 — ผูกค่าซ่อมบำรุงเข้ารถคันไหน (optional, ใช้เมื่อ category='maintenance')
}

export type ExpenseCategory = 'chemicals' | 'water' | 'electricity' | 'labor' | 'transport' | 'maintenance' | 'rent' | 'fuel' | 'other'

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; icon: string }> = {
  chemicals: { label: 'น้ำยาซักผ้า/เคมี', icon: '🧪' },
  water: { label: 'ค่าน้ำ', icon: '💧' },
  electricity: { label: 'ค่าไฟ', icon: '⚡' },
  labor: { label: 'ค่าแรง', icon: '👷' },
  transport: { label: 'ค่าขนส่ง', icon: '🚚' },
  maintenance: { label: 'ซ่อมบำรุง', icon: '🔧' },
  rent: { label: 'ค่าเช่า', icon: '🏭' },
  fuel: { label: 'ค่าน้ำมันรถ', icon: '⛽' },
  other: { label: 'อื่นๆ', icon: '📦' },
}

// ============================================================
// 423 Phase A — Fleet & Compliance (ฟลีตรถ + ปฏิบัติตามกฎหมาย + บำรุงเชิงป้องกัน)
// ============================================================
export interface Vehicle {
  id: string
  code: string                  // ชื่อย่อ A B C D
  licensePlate: string          // ทะเบียน (ชื่อจริง)
  brand: string
  usageType: string
  registeredDate: string        // ISO yyyy-mm-dd ('' = ไม่ทราบ) → คำนวณอายุ 7 ปี (ตรวจสภาพ)
  // ประกันภาคสมัครใจ
  insuranceCompany: string
  insuranceClass: string
  insuranceExpiry: string
  // ภาคบังคับ + ราชการ (เว้น '' ได้ — กรอกภายหลัง)
  actExpiry: string             // พ.ร.บ.
  taxExpiry: string             // ภาษีรถ
  inspectionExpiry: string      // ตรวจสภาพ ตรอ.
  // PM (บำรุงเชิงป้องกัน ตามระยะไมล์)
  currentOdometer: number
  odometerAnchorDate: string    // 428 — วันที่ของ currentOdometer (yyyy-mm-dd · '' = ไม่รู้) → ฐานคำนวณไมล์จาก GPS
  odometerAnchorTime: string    // 446 — เวลาที่อ่าน currentOdometer (HH:MM · '' = ไม่รู้) → วัน anchor นับเฉพาะระยะหลังเวลานี้
  serviceIntervalKm: number     // ระยะเช็ค (default 8000)
  nextServiceOdometer: number   // 0 = ยังไม่ตั้ง
  isActive: boolean
  note: string
  createdAt: string
}

// บันทึกเลขไมล์ (ถ่ายรูปหน้าปัดตอนออกงาน — ป้อนข้อมูล PM)
export interface OdometerLog {
  id: string
  vehicleId: string
  date: string
  recordedTime: string          // 446 — เวลาที่ถ่าย/อ่านไมล์ (HH:MM · '' = ไม่ระบุ) → ใช้ตั้ง anchor เวลาให้รถ
  odometer: number
  fuelLevel: string             // หมายเหตุน้ำมัน (จากหน้าปัด)
  photoPath: string             // path ใน Supabase Storage ('' = ไม่มีรูป)
  note: string
  createdBy: string
  createdAt: string
}

// ประวัติงานซ่อม/บำรุง
export interface MaintenanceRecord {
  id: string
  vehicleId: string
  date: string
  odometer: number              // ระยะที่ทำ (0 = ไม่ระบุ)
  type: string                  // จาก MAINTENANCE_TYPES
  description: string
  cost: number
  expenseId: string             // ผูก Expense ('' = ไม่ผูก)
  nextDueOdometer: number       // 0 = ไม่ตั้ง (ผ้าเบรค set เองได้)
  createdBy: string
  createdAt: string
}

// preset ประเภทงานซ่อม (เลือกจาก dropdown + กรอกเองได้)
export const MAINTENANCE_TYPES = ['น้ำมันเครื่อง', 'ผ้าเบรคหน้า', 'ผ้าเบรคหลัง', 'ยาง', 'แบตเตอรี่', 'ช่วงล่าง', 'ตัวถัง/สี', 'อื่นๆ'] as const

// สถานะการปฏิบัติตามกฎหมาย/PM (ใกล้ครบกำหนด)
export type ComplianceStatus = 'overdue' | 'near' | 'ok'

export const COMPLIANCE_STATUS_CONFIG: Record<ComplianceStatus, { label: string; dot: string; badge: string }> = {
  overdue: { label: 'เกินกำหนด',     dot: '🔴', badge: 'bg-red-100 text-red-700 border-red-200' },
  near:    { label: 'ใกล้ครบกำหนด', dot: '🟠', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  ok:      { label: 'ปกติ',          dot: '🟢', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

// ============================================================
// 423 Phase B — Rounds + Crew (รอบเดินรถ + คนขับ/เด็กติดรถ)
// ============================================================
export interface Round {
  id: string
  code: string                  // V/SPA/SZH/AKARA/L7/SWD
  name: string
  startTime: string             // 'HH:MM' (เวลาออกรอบ)
  endTime: string
  defaultVehicleId: string      // รถประจำรอบ ('' = ไม่ระบุ)
  defaultDriverId: string       // คนขับประจำ
  defaultHelperId: string       // เด็กรถประจำ
  color: string                 // hex สำหรับ badge/ปฏิทิน (สีพื้น)
  textColor?: string | null     // 442 — สีตัวอักษรบน badge (ไม่ตั้ง = ขาว) · เผื่อพื้นสีอ่อน/ขาว
  sortOrder: number
  isActive: boolean             // SZH = false (พักชั่วคราว)
  capacityTarget: number        // 423 B-1 — ความจุเป้าหมาย (กระสอบ/ถุง) · 0 = ไม่ตั้ง · เทียบ load ใน Dispatch
  note: string
  createdAt: string
}

export type CrewRole = 'driver' | 'helper'
export type CrewStatus = 'active' | 'standby' | 'leave'

export interface Crew {
  id: string
  name: string
  role: CrewRole
  phone: string
  status: CrewStatus            // standby = สำรอง (ใช้แทนเมื่อคนขาด)
  defaultVehicleId: string      // รถที่ขับประจำ ('' = ไม่ระบุ)
  note: string
  createdAt: string
}

export const CREW_ROLE_LABELS: Record<CrewRole, string> = {
  driver: 'คนขับ',
  helper: 'เด็กติดรถ',
}

export const CREW_STATUS_CONFIG: Record<CrewStatus, { label: string; badge: string }> = {
  active:  { label: 'พร้อมงาน', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  standby: { label: 'สำรอง',    badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  leave:   { label: 'ลา/หยุด',  badge: 'bg-slate-100 text-slate-500 border-slate-200' },
}

// ============================================================
// 423 งานติ๊ด — Fuel Log (บันทึกการเติมน้ำมัน + เบิกเงินคนขับ + หลักฐาน 3 รูป)
// ============================================================
export type FuelPaidBy = 'driver' | 'company'

export const FUEL_PAID_BY_CONFIG: Record<FuelPaidBy, { label: string }> = {
  driver:  { label: 'คนขับสำรองจ่าย' },
  company: { label: 'บริษัทจ่ายตรง' },
}

// ประเภทน้ำมัน (preset + กรอกเองได้) — รถ Hilux Revo = ดีเซล
export const FUEL_TYPES = ['ดีเซล', 'ดีเซล B7', 'ดีเซลพรีเมียม', 'เบนซิน 95', 'แก๊สโซฮอล์ 95', 'แก๊สโซฮอล์ E20', 'อื่นๆ'] as const

export interface FuelLog {
  id: string
  vehicleId: string
  date: string                  // ISO yyyy-mm-dd
  liters: number
  pricePerLiter: number         // บาท/ลิตร (= amount / liters)
  amount: number                // ยอดเงิน (บาท)
  odometer: number              // เลขไมล์ตอนเติม (0 = ไม่ระบุ) → คำนวณ km/ลิตร
  driverId: string              // คนขับ/คนจ่าย (crew id) — track เบิกคืน ('' = ไม่ระบุ)
  station: string               // ปั๊ม
  fuelType: string
  taxInvoiceNumber: string      // เลขใบกำกับภาษี (เอกสารบัญชี)
  paidBy: FuelPaidBy
  isReimbursed: boolean         // เบิกคืนคนขับแล้ว (ใช้กับ paidBy='driver')
  reimbursedDate: string
  expenseId: string             // ผูก Expense หมวด fuel ('' = ไม่ผูก)
  // หลักฐาน 3 รูป (Supabase Storage path · กันทุจริต) — '' = ไม่มี
  receiptPhotoPath: string      // ใบกำกับภาษี
  slipPhotoPath: string         // slip โอนเงิน
  gaugePhotoPath: string        // หน้าปัดเข็มน้ำมันหลังเติม
  note: string
  createdBy: string
  createdAt: string
}

// ============================================================
// 432.1 — Saved Places (จุดที่บันทึก ที่ "ไม่ใช่ลูกค้า")
// ============================================================
// ร้านอาหาร/ปั๊ม/จุดพัก/ธุระส่วนตัว — จับคู่จุดจอด GPS ที่ไม่ตรงลูกค้า
//   → อ่านพฤติกรรมคนขับง่ายขึ้น ("จากโรงแรม V → ร้านก๋วยเตี๋ยวไก่ แวะ 20 นาที")
// detour=true (food/rest/personal) = "แวะส่วนตัว" → ไฮไลต์เตือน · fuel/other = ปกติ
export type SavedPlaceCategory = 'food' | 'rest' | 'personal' | 'fuel' | 'other'

export const SAVED_PLACE_CATEGORY_CONFIG: Record<SavedPlaceCategory, { label: string; emoji: string; detour: boolean }> = {
  food:     { label: 'ร้านอาหาร',   emoji: '🍜', detour: true },
  rest:     { label: 'จุดพัก/กาแฟ', emoji: '☕', detour: true },
  personal: { label: 'ธุระส่วนตัว', emoji: '🏠', detour: true },
  fuel:     { label: 'ปั๊มน้ำมัน',   emoji: '⛽', detour: false },
  other:    { label: 'อื่นๆ',       emoji: '📍', detour: false },
}

export interface SavedPlace {
  id: string
  name: string
  category: SavedPlaceCategory
  lat: number
  lng: number
  note: string
  createdBy: string
  createdAt: string
}

// ============================================================
// 423 Phase B2 — Dispatch Board (ใบงานรอบประจำวัน / Daily Trip)
// ============================================================
// TripStop มาจากไหน:
// - regular  : ลูกค้าประจำรอบ + ถึงคิววันนั้น (generate จาก membership+schedule)
// - inserted : แทรกจุดเฉพาะวันนั้น (เคส A‑C‑B / รอบเสริม) — ไม่อยู่ในรอบประจำ
// - moved-in : ยืมจากรอบอื่นบางวัน (ลูกค้ามี roundId อื่น แต่วันนี้วิ่งรอบนี้)
export type TripStopSource = 'regular' | 'inserted' | 'moved-in'
export type TripStopStatus = 'pending' | 'done' | 'skipped'

export const TRIP_STOP_SOURCE_CONFIG: Record<TripStopSource, { label: string; badge: string }> = {
  regular:    { label: 'ประจำ',  badge: 'bg-slate-100 text-slate-500 border-slate-200' },
  inserted:   { label: 'แทรก',   badge: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  'moved-in': { label: 'ยืมรอบ', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
}

export const TRIP_STOP_STATUS_CONFIG: Record<TripStopStatus, { label: string; badge: string; dot: string }> = {
  pending: { label: 'รอ',   badge: 'bg-slate-100 text-slate-500 border-slate-200',         dot: '○' },
  done:    { label: 'เสร็จ', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',   dot: '✓' },
  skipped: { label: 'ข้าม',  badge: 'bg-rose-100 text-rose-600 border-rose-200',            dot: '✕' },
}

export interface TripStop {
  customerId: string
  sequence: number              // ลำดับวิ่งวันนั้น (อาจต่างจาก default ถ้ามี insertion)
  source: TripStopSource
  bagCount: number              // จำนวนถุง (load) — ตรงกับ "ยอดรวมท้ายใบ" ใบจดมือ (0 = ยังไม่กรอก)
  status: TripStopStatus
  note: string
  // หน้าต่างเวลา — snapshot จาก customer ตอน generate (กัน drift)
  timeWindowStart: string
  timeWindowEnd: string
  // ePOD (Phase E เติม — เก็บ field ไว้ก่อน)
  arrivedAt?: string            // ISO timestamp
  dnId?: string                 // ผูก DeliveryNote (SD) ที่ออก
}

export type TripStatus = 'planned' | 'running' | 'done'

export const TRIP_STATUS_CONFIG: Record<TripStatus, { label: string; badge: string }> = {
  planned: { label: 'วางแผน',  badge: 'bg-sky-100 text-sky-700 border-sky-200' },
  running: { label: 'กำลังวิ่ง', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  done:    { label: 'จบรอบ',   badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

export interface DailyTrip {
  id: string                    // deterministic: dt_{date}_{roundId}
  date: string                  // ISO yyyy-mm-dd
  roundId: string
  vehicleId: string             // override รถประจำรอบ ('' = ใช้ default ของรอบ)
  driverId: string              // override คนขับ (backup swap)
  helperId: string
  status: TripStatus
  note: string
  stops: TripStop[]
  createdBy: string
  createdAt: string
}

// id ที่คาดเดาได้ → generate idempotent (regenerate ไม่สร้างซ้ำ — บทเรียน 409/410)
export function dailyTripId(date: string, roundId: string): string {
  return `dt_${date}_${roundId}`
}

// ============================================================
// 449 — Milk-Run Analytics: visit/leg ที่ reconstruct จาก GPS history (materialize)
//   trip = leg (เคลื่อนที่ 1 ช่วง) · ช่วงดับเครื่องจอด = dwell ที่ลูกค้า
//   เก็บลง gps_visits/gps_legs สะสมรายวัน idempotent ต่อ (vehicle, date)
// ============================================================
export type VisitConfidence = 'high' | 'low'

/** การจอดที่ลูกค้า 1 ครั้ง (เที่ยวที่จบที่พิกัดลูกค้า = engine-off arrival) */
export interface GpsVisit {
  id: string                    // vmt_{date}_{vehicleId}_{seq}
  date: string                  // yyyy-mm-dd (วันไทย)
  vehicleId: string             // FlowClean vehicle id (resolve จากทะเบียน)
  driverId: string              // resolve จากกระดานจ่ายงาน ('' = ไม่ทราบ)
  roundId: string               // resolve จากหน้าต่างเวลารอบ ('' = ไม่ทราบ)
  customerId: string
  arriveTime: string            // "yyyy-mm-dd HH:MM:SS" (เวลาไทย)
  departTime: string            // '' = ไม่ทราบ (จุดสุดท้ายของวัน)
  dwellMin: number              // เวลาที่ใช้ที่ลูกค้า (นาที) · 0 = ไม่ทราบ
  confidence: VisitConfidence   // high = ดับเครื่องจอด · low = ผ่าน/ติดเครื่อง (future)
  sequence: number              // ลำดับการจอดในวัน
}

/** การเคลื่อนที่ 1 เที่ยว (leg) ระหว่าง 2 จุด — ใช้สถิติเวลาเดินทาง A→B + หา route */
export interface GpsLeg {
  id: string                    // lgt_{date}_{vehicleId}_{seq}
  date: string
  vehicleId: string
  driverId: string
  roundId: string
  fromKey: string               // 'factory' | 'c:<id>' | 's:<id>' | 'unknown'
  fromCustomerId: string        // '' ถ้าไม่ใช่ลูกค้า
  fromName: string
  toKey: string
  toCustomerId: string
  toName: string
  departTime: string            // "yyyy-mm-dd HH:MM:SS"
  arriveTime: string
  travelMin: number             // เวลาเดินทาง (door-to-door, เริ่ม→จบ)
  km: number
  fuelL: number
  score: number                 // คะแนนขับขี่ V2X (0 = ไม่มี)
}

// ============================================================
// App User
// ============================================================
// 5 roles (69):
// - operator: พนักงานในโรงซัก (อัพเดต status 4/7-6/7)
// - driver: คนขับรถส่งผ้า (1/7-3/7, 6/7-7/7, สร้าง LF/SD)
// - staff: พนักงานทั่วไป (LF/SD ทั้งหมด, ไม่เห็นราคา/บิล)
// - accountant: พนักงานบัญชี (+WB/IV/QT/ราคา/รายงานการเงิน/ค่าใช้จ่าย)
// - admin: เจ้าของ/ผู้จัดการ (ทุกอย่าง + settings + users)
export type UserRole = 'operator' | 'driver' | 'staff' | 'accountant' | 'admin'

export const USER_ROLE_CONFIG: Record<UserRole, { label: string; color: string; bgColor: string; description: string }> = {
  operator:   { label: 'Operator',   color: 'text-slate-700',   bgColor: 'bg-slate-100',   description: 'พนักงานโรงซัก — อัพเดตสถานะการซัก แพค ส่ง' },
  driver:     { label: 'Driver',     color: 'text-blue-700',    bgColor: 'bg-blue-100',    description: 'คนขับรถ — รับ-ส่งผ้า สร้าง LF/SD' },
  staff:      { label: 'Staff',      color: 'text-teal-700',    bgColor: 'bg-teal-100',    description: 'พนักงานทั่วไป — LF/SD ทั้งหมด ไม่เห็นบัญชี' },
  accountant: { label: 'Accountant', color: 'text-purple-700',  bgColor: 'bg-purple-100',  description: 'บัญชี — WB/IV/QT/ราคา/รายงานการเงิน' },
  admin:      { label: 'Admin',      color: 'text-amber-700',   bgColor: 'bg-amber-100',   description: 'เจ้าของ/ผู้จัดการ — ทุกอย่าง' },
}

export interface AppUser {
  id: string
  name: string
  email: string
  passwordHash: string
  role: UserRole
  isActive: boolean
}

// ============================================================
// Audit Log
// ============================================================
export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'login_fail' | 'logout'

export type AuditEntityType =
  | 'customer' | 'linen_form' | 'delivery_note' | 'billing' | 'tax_invoice'
  | 'quotation' | 'expense' | 'checklist' | 'user' | 'company' | 'linen_item' | 'linen_category' | 'session'
  | 'vehicle' // 423 — ฟลีตรถ (vehicle + odometer + maintenance)
  | 'round' | 'crew' // 423 Phase B — รอบเดินรถ + คนขับ/เด็กรถ
  | 'daily_trip' // 423 Phase B2 — ใบงานรอบประจำวัน (Dispatch)
  | 'fuel_log' // 423 — บันทึกการเติมน้ำมัน
  | 'saved_place' // 432.1 — จุดที่บันทึก (ไม่ใช่ลูกค้า)

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
  factoryLat: number        // 427 — พิกัดโรงงาน (label "ขยับรถ/กลับโรงงาน" ใน GPS) · 0 = ยังไม่ตั้ง
  factoryLng: number
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

// ============================================================
// Carry-over Adjustment (51-53)
// ============================================================

/**
 * Mode สำหรับคำนวณ carry-over (4 เคส)
 * 1: col6_แพคส่ง − col5_โรงซักนับเข้า                       (default, ใช้เปิดบิล)
 * 2: col6_แพคส่ง − (col2_ลูกค้านับส่ง + col3_ลูกค้านับเคลม)  (ฝั่งส่งรวมเคลม — ใช้กับลูกค้าที่ไม่ตรวจซ้ำ)
 * 3: col4_ลูกค้านับกลับ − col5_โรงซักนับเข้า                 (cross check, fair ที่สุด)
 * 4: col4_ลูกค้านับกลับ − (col2_ลูกค้านับส่ง + col3_ลูกค้านับเคลม) (ลูกค้า 2 ฝั่งรวมเคลม)
 *
 * 265 fix: Mode 2 + 4 เดิมใช้แค่ col2 → ผิดเพราะไม่นับเคลม (สต๊อกจริงต้องรวม)
 *         ปัจจุบันใช้ (col2 + col3) เป็นจำนวนผ้าที่ลูกค้านับส่งทั้งหมด
 */
export type CarryOverMode = 1 | 2 | 3 | 4

export const CARRY_OVER_MODE_CONFIG: Record<CarryOverMode, { label: string; short: string; formula: string; description: string; hint?: string }> = {
  1: { label: 'โรงซักแพคส่ง − โรงซักนับเข้า', short: 'เคส 1', formula: 'โรงซักแพคส่ง − โรงซักนับเข้า', description: 'ตามโรงซักนับทั้งหมด', hint: 'ควรเท่ากับเคส 3 ถ้าแก้บิลให้ ลค เรียบร้อย' },
  2: { label: 'โรงซักแพคส่ง − ลูกค้านับส่ง (รวมเคลม)', short: 'เคส 2', formula: 'โรงซักแพคส่ง − (ลูกค้านับส่งซัก + ลูกค้านับส่งเคลม)', description: 'ตามฝั่งส่ง (รวมเคลม) — เหมาะกับลูกค้าที่ไม่ตรวจซ้ำ' },
  3: { label: 'ลูกค้านับกลับ − โรงซักนับเข้า', short: 'เคส 3', formula: 'ลูกค้านับกลับ − โรงซักนับเข้า', description: 'ตามฝั่งรับนับทวน' },
  4: { label: 'ลูกค้านับกลับ − ลูกค้านับส่ง (รวมเคลม)', short: 'เคส 4', formula: 'ลูกค้านับกลับ − (ลูกค้านับส่งซัก + ลูกค้านับส่งเคลม)', description: 'ตามลูกค้าทั้ง 2 ฝั่ง (รวมเคลม)' },
}

export type CarryOverAdjustmentType = 'adjust' | 'reset'

export type CarryOverReasonCategory = 'compensation' | 'human_error' | 'system_correction' | 'other'

export const CARRY_OVER_REASON_CONFIG: Record<CarryOverReasonCategory, { label: string; icon: string }> = {
  compensation: { label: 'ชดเชย/คืนผ้า', icon: '💰' },
  human_error: { label: 'แก้ไข human error', icon: '✏️' },
  system_correction: { label: 'แก้ไขระบบ/เริ่มใหม่', icon: '🔄' },
  other: { label: 'อื่นๆ', icon: '📝' },
}

export interface CarryOverAdjustmentItem {
  code: string  // รหัสรายการผ้า
  delta: number // delta สำหรับ adjust (+/-) — สำหรับ reset = 0 (unused)
}

export interface CarryOverAdjustmentHistory {
  editedAt: string
  editedBy: string
  changes: string  // human-readable summary ของการเปลี่ยนแปลง
}

/**
 * CarryOverAdjustment — ปรับยอดผ้าค้าง/คืน
 *
 * type='adjust': delta apply กับทุกเคสเท่ากัน — ยังเห็น human error ของเคสอื่น
 * type='reset':  overwrite ทุกเคสเป็น 0 (checkpoint) — ล้าง human error สะสมหมด
 *
 * ตอนคำนวณ getCarryOver():
 * - หา reset ล่าสุดของ item code → ถ้ามี ignore LF + adjustments ก่อนวัน reset
 * - คำนวณตาม mode (1-4) จาก LF หลัง reset + บวก adjustments หลัง reset
 */
export interface CarryOverAdjustment {
  id: string
  customerId: string
  date: string                          // วันที่ apply (YYYY-MM-DD)
  type: CarryOverAdjustmentType
  items: CarryOverAdjustmentItem[]      // adjust: delta = +/-, reset: delta = 0 (unused)
  reasonCategory: CarryOverReasonCategory
  reason: string                        // เหตุผลละเอียด
  showInCustomerReport: boolean         // แสดงในรายงานลูกค้าไหม (toggle ในรายงาน)
  createdBy: string
  createdAt: string
  updatedAt: string
  history: CarryOverAdjustmentHistory[] // Option B: edit history
  isDeleted: boolean                    // soft delete
  /** 340.3: Aggregate config snapshot ตอน create (pattern เดียวกับ LF 330)
   *  กัน drift เมื่อ customer toggle aggregate config ภายหลัง
   *  - แตะ adj ก่อนเปลี่ยน config: snapshot = config เดิม
   *  - แสดง audit ว่า adj นี้ apply ภายใต้ config แบบไหน
   *  A1: เพิ่ม anchorCode เหมือน LF snapshot
   */
  aggregateSnapshot?: Record<string, {
    col2Mode: 'aggregate' | 'per_row'
    col5Mode: 'aggregate' | 'per_row'
    anchorCode?: string
  }>
  /** 340.3: บันทึกว่า adj นี้ใช้ auto-balance pattern (= redistribute, not add) */
  autoBalancedAnchor?: boolean
}
