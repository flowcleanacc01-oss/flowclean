import type { Customer, LinenForm, DeliveryNote, BillingStatement, Expense, AppUser, CompanyInfo } from '@/types'
import { STANDARD_LINEN_ITEMS } from '@/types'

// ============================================================
// Default Prices (from real quotation)
// ============================================================
export const DEFAULT_PRICES: Record<string, number> = Object.fromEntries(
  STANDARD_LINEN_ITEMS.map(i => [i.code, i.defaultPrice])
)

// ============================================================
// Company Info
// ============================================================
export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: 'บริษัท คราฟท์ แอนด์ มอร์ จำกัด',
  nameEn: 'Craft and More Co., Ltd.',
  address: '89/1 หมู่ 3 ต.บางกรวย อ.บางกรวย จ.นนทบุรี 11130',
  taxId: '0125563012345',
  branch: 'สำนักงานใหญ่',
  phone: '081-234-5678',
  bankName: 'ธนาคารกสิกรไทย',
  bankAccountName: 'บจก. คราฟท์ แอนด์ มอร์',
  bankAccountNumber: '123-4-56789-0',
  bankAccounts: [],
}

// ============================================================
// Sample Customers (Real hotel names)
// ============================================================
const perPieceItems = ['B/F', 'B/H', 'B/T', 'P/C', 'S/T', 'S/Q', 'S/K', 'D/T', 'D/Q', 'D/K', 'B/M', 'B/R', 'P/T']
const flatRateItems = ['B/F', 'B/H', 'B/T', 'P/C', 'S/Q', 'S/K', 'D/Q', 'D/K', 'B/M']

export const SAMPLE_CUSTOMERS: Customer[] = [
  {
    id: 'cust-01',
    customerCode: 'HT0001',
    customerType: 'hotel',
    name: 'Wild Orchid Villa',
    nameEn: 'Wild Orchid Villa',
    address: '78 ถ.ข้าวสาร แขวงตลาดยอด เขตพระนคร กรุงเทพฯ 10200',
    taxId: '0105548012345',
    branch: 'สำนักงานใหญ่',
    contactName: 'คุณสมศักดิ์',
    contactPhone: '02-123-4567',
    contactEmail: 'laundry@wildorchid.co.th',
    creditDays: 30,
    billingModel: 'per_piece',
    monthlyFlatRate: 0, minPerTrip: 0, selectedBankAccountId: '',
    enabledItems: perPieceItems,
    priceList: [
      { code: 'B/F', price: 4 }, { code: 'B/H', price: 5 }, { code: 'B/T', price: 8 },
      { code: 'P/C', price: 5 }, { code: 'S/T', price: 12 }, { code: 'S/Q', price: 12 },
      { code: 'S/K', price: 12 }, { code: 'D/T', price: 29 }, { code: 'D/Q', price: 29 },
      { code: 'D/K', price: 29 }, { code: 'B/M', price: 6 }, { code: 'B/R', price: 25 },
      { code: 'P/T', price: 12 },
    ],
    priceHistory: [],
    notes: 'ลูกค้า VIP - ส่งทุกวัน',
    createdAt: '2025-01-15',
    isActive: true,
  },
  {
    id: 'cust-02',
    customerCode: 'HT0002',
    customerType: 'hotel',
    name: 'Villa Cha Cha Bangplumpoo',
    nameEn: 'Villa Cha Cha Bangplumpoo',
    address: '36 ถ.ตะนาว แขวงบวรนิเวศ เขตพระนคร กรุงเทพฯ 10200',
    taxId: '0105551098765',
    branch: 'สำนักงานใหญ่',
    contactName: 'คุณวรรณา',
    contactPhone: '02-234-5678',
    contactEmail: 'hk@villachacha.com',
    creditDays: 30,
    billingModel: 'per_piece',
    monthlyFlatRate: 0, minPerTrip: 0, selectedBankAccountId: '',
    enabledItems: ['B/F', 'B/H', 'B/T', 'P/C', 'S/Q', 'S/K', 'D/Q', 'D/K', 'B/M', 'P/T'],
    priceList: [
      { code: 'B/F', price: 4 }, { code: 'B/H', price: 5 }, { code: 'B/T', price: 8 },
      { code: 'P/C', price: 5 }, { code: 'S/Q', price: 12 }, { code: 'S/K', price: 12 },
      { code: 'D/Q', price: 29 }, { code: 'D/K', price: 29 }, { code: 'B/M', price: 6 },
      { code: 'P/T', price: 12 },
    ],
    priceHistory: [],
    notes: '',
    createdAt: '2025-02-01',
    isActive: true,
  },
  {
    id: 'cust-03',
    customerCode: 'HT0003',
    customerType: 'hotel',
    name: 'Villa Cha-Cha Khaosan',
    nameEn: 'Villa Cha-Cha Khaosan',
    address: '22 ถ.ข้าวสาร แขวงตลาดยอด เขตพระนคร กรุงเทพฯ 10200',
    taxId: '0105553456789',
    branch: 'สำนักงานใหญ่',
    contactName: 'คุณประวิทย์',
    contactPhone: '02-345-6789',
    contactEmail: 'ops@villachachakhaosan.com',
    creditDays: 30,
    billingModel: 'per_piece',
    monthlyFlatRate: 0, minPerTrip: 0, selectedBankAccountId: '',
    enabledItems: ['B/F', 'B/H', 'B/T', 'P/C', 'S/Q', 'S/K', 'D/Q', 'D/K', 'B/M'],
    priceList: [
      { code: 'B/F', price: 4 }, { code: 'B/H', price: 5 }, { code: 'B/T', price: 8 },
      { code: 'P/C', price: 5 }, { code: 'S/Q', price: 12 }, { code: 'S/K', price: 12 },
      { code: 'D/Q', price: 29 }, { code: 'D/K', price: 29 }, { code: 'B/M', price: 6 },
    ],
    priceHistory: [],
    notes: 'สาขาข้าวสาร',
    createdAt: '2025-03-10',
    isActive: true,
  },
  {
    id: 'cust-04',
    customerCode: 'HT0004',
    customerType: 'hotel',
    name: 'Sawaddee House',
    nameEn: 'Sawaddee House',
    address: '147 ถ.ข้าวสาร แขวงตลาดยอด เขตพระนคร กรุงเทพฯ 10200',
    taxId: '0105555111222',
    branch: 'สำนักงานใหญ่',
    contactName: 'คุณนภา',
    contactPhone: '02-456-7890',
    contactEmail: 'napa@sawaddeehouse.com',
    creditDays: 30,
    billingModel: 'per_piece',
    monthlyFlatRate: 0, minPerTrip: 0, selectedBankAccountId: '',
    enabledItems: ['B/F', 'B/H', 'B/T', 'P/C', 'S/Q', 'S/K', 'D/Q', 'B/M'],
    priceList: [
      { code: 'B/F', price: 4 }, { code: 'B/H', price: 5 }, { code: 'B/T', price: 8 },
      { code: 'P/C', price: 5 }, { code: 'S/Q', price: 12 }, { code: 'S/K', price: 12 },
      { code: 'D/Q', price: 29 }, { code: 'B/M', price: 6 },
    ],
    priceHistory: [],
    notes: '',
    createdAt: '2025-04-20',
    isActive: true,
  },
  {
    id: 'cust-05',
    customerCode: 'HT0005',
    customerType: 'hotel',
    name: 'บ้านวัชรา',
    nameEn: 'Baan Wachara',
    address: '55 ซ.รามบุตรี แขวงตลาดยอด เขตพระนคร กรุงเทพฯ 10200',
    taxId: '0105549333444',
    branch: 'สำนักงานใหญ่',
    contactName: 'คุณธนพล',
    contactPhone: '02-567-8901',
    contactEmail: 'thanapol@baanwachara.com',
    creditDays: 30,
    billingModel: 'monthly_flat',
    monthlyFlatRate: 25000, minPerTrip: 0, selectedBankAccountId: '',
    enabledItems: flatRateItems,
    priceList: [],
    priceHistory: [],
    notes: 'เหมาจ่ายรายเดือน 25,000 บาท',
    createdAt: '2025-05-01',
    isActive: true,
  },
  {
    id: 'cust-06',
    customerCode: 'OT0001',
    customerType: 'other',
    name: 'ไทยซินอุตสาหกรรม',
    nameEn: 'Thai Sin Industry',
    address: '99 ถ.เจริญกรุง แขวงสี่พระยา เขตบางรัก กรุงเทพฯ 10500',
    taxId: '0105552777888',
    branch: 'สำนักงานใหญ่',
    contactName: 'คุณมาลี',
    contactPhone: '02-678-9012',
    contactEmail: 'malee@thaisin.com',
    creditDays: 30,
    billingModel: 'monthly_flat',
    monthlyFlatRate: 18000, minPerTrip: 0, selectedBankAccountId: '',
    enabledItems: ['B/T', 'B/H', 'B/M'],
    priceList: [],
    priceHistory: [],
    notes: 'เหมาจ่ายรายเดือน 18,000 บาท — ผ้าอุตสาหกรรม',
    createdAt: '2026-01-15',
    isActive: true,
  },
]

// ============================================================
// Sample Linen Forms (6-column model)
// ============================================================
function makeRows(data: Record<string, Partial<{ co: number; c2: number; c3: number; c4: number; c5: number; c6: number; note: string }>>): import('@/types').LinenFormRow[] {
  return Object.entries(data).map(([code, d]) => ({
    code,
    col1_carryOver: d.co ?? 0,
    col2_hotelCountIn: d.c2 ?? 0,
    col3_hotelClaimCount: d.c3 ?? 0,
    col4_factoryApproved: d.c4 ?? 0,
    col5_factoryClaimApproved: d.c5 ?? 0,
    col6_factoryPackSend: d.c6 ?? 0,
    note: d.note ?? '',
  }))
}

const _SAMPLE_LINEN_FORMS: Omit<LinenForm, 'bagsSentCount' | 'bagsPackCount' | 'deptDrying' | 'deptIroning' | 'deptFolding' | 'deptQc'>[] = [
  // Wild Orchid Villa - Day 1 (Feb 25) — confirmed, sent all
  {
    id: 'lf-01', formNumber: 'LF-20260225-001', customerId: 'cust-01', date: '2026-02-25',
    status: 'confirmed',
    rows: makeRows({
      'B/F': { c2: 30, c3: 0, c4: 30, c5: 0, c6: 30 },
      'B/H': { c2: 20, c3: 0, c4: 20, c5: 0, c6: 20 },
      'B/T': { c2: 50, c3: 2, c4: 50, c5: 2, c6: 52, note: 'เคลม 2 ผืนเปื้อนสี' },
      'P/C': { c2: 40, c3: 0, c4: 40, c5: 0, c6: 40 },
      'S/Q': { c2: 25, c3: 0, c4: 25, c5: 0, c6: 25 },
      'S/K': { c2: 15, c3: 0, c4: 15, c5: 0, c6: 15 },
      'D/Q': { c2: 10, c3: 0, c4: 10, c5: 0, c6: 10 },
      'B/M': { c2: 20, c3: 0, c4: 20, c5: 0, c6: 20 },
    }),
    notes: '', createdBy: 'staff-01', updatedAt: '2026-02-26',
  },
  // Wild Orchid Villa - Day 2 (Feb 26) — confirmed, sent all
  {
    id: 'lf-02', formNumber: 'LF-20260226-001', customerId: 'cust-01', date: '2026-02-26',
    status: 'confirmed',
    rows: makeRows({
      'B/F': { c2: 35, c3: 0, c4: 35, c5: 0, c6: 35 },
      'B/H': { c2: 22, c3: 0, c4: 22, c5: 0, c6: 22 },
      'B/T': { c2: 55, c3: 1, c4: 55, c5: 1, c6: 56, note: 'เคลม 1' },
      'P/C': { c2: 38, c3: 0, c4: 38, c5: 0, c6: 38 },
      'S/Q': { c2: 28, c3: 0, c4: 28, c5: 0, c6: 28 },
      'S/K': { c2: 12, c3: 0, c4: 12, c5: 0, c6: 12 },
      'D/Q': { c2: 8, c3: 0, c4: 8, c5: 0, c6: 8 },
      'B/M': { c2: 18, c3: 0, c4: 18, c5: 0, c6: 18 },
    }),
    notes: '', createdBy: 'staff-01', updatedAt: '2026-02-27',
  },
  // Wild Orchid Villa - Day 3 (Feb 27) — delivered, sent all
  {
    id: 'lf-03', formNumber: 'LF-20260227-001', customerId: 'cust-01', date: '2026-02-27',
    status: 'delivered',
    rows: makeRows({
      'B/F': { c2: 32, c3: 0, c4: 32, c5: 0, c6: 32 },
      'B/H': { c2: 25, c3: 0, c4: 25, c5: 0, c6: 25 },
      'B/T': { c2: 48, c3: 0, c4: 48, c5: 0, c6: 48 },
      'P/C': { c2: 42, c3: 0, c4: 42, c5: 0, c6: 42 },
      'S/Q': { c2: 20, c3: 0, c4: 20, c5: 0, c6: 20 },
      'S/K': { c2: 18, c3: 0, c4: 18, c5: 0, c6: 18 },
      'D/Q': { c2: 12, c3: 0, c4: 12, c5: 0, c6: 12 },
      'B/M': { c2: 22, c3: 0, c4: 22, c5: 0, c6: 22 },
    }),
    notes: '', createdBy: 'staff-02', updatedAt: '2026-02-28',
  },
  // Wild Orchid Villa - Day 4 (Feb 28) — packed, sent partially (B/T ค้างส่ง 5)
  {
    id: 'lf-04', formNumber: 'LF-20260228-001', customerId: 'cust-01', date: '2026-02-28',
    status: 'packed',
    rows: makeRows({
      'B/F': { c2: 28, c3: 0, c4: 28, c5: 0, c6: 28 },
      'B/H': { c2: 20, c3: 0, c4: 20, c5: 0, c6: 20 },
      'B/T': { c2: 52, c3: 3, c4: 52, c5: 3, c6: 50, note: 'เคลม 3 - รอยด่าง / ค้างส่ง 5' },
      'P/C': { c2: 35, c3: 0, c4: 35, c5: 0, c6: 35 },
      'S/Q': { c2: 22, c3: 0, c4: 22, c5: 0, c6: 22 },
      'S/K': { c2: 10, c3: 0, c4: 10, c5: 0, c6: 10 },
      'D/Q': { c2: 8, c3: 0, c4: 8, c5: 0, c6: 8 },
      'B/M': { c2: 15, c3: 0, c4: 15, c5: 0, c6: 15 },
    }),
    notes: '', createdBy: 'staff-01', updatedAt: '2026-03-01',
  },
  // Wild Orchid Villa - Day 5 (Mar 1) — processing, col6 = 0
  {
    id: 'lf-05', formNumber: 'LF-20260301-001', customerId: 'cust-01', date: '2026-03-01',
    status: 'washing',
    rows: makeRows({
      'B/F': { c2: 40, c3: 0, c4: 40, c5: 0 },
      'B/H': { c2: 18, c3: 0, c4: 18, c5: 0 },
      'B/T': { c2: 45, c3: 0, c4: 45, c5: 0 },
      'P/C': { c2: 30, c3: 0, c4: 30, c5: 0 },
      'S/Q': { c2: 20, c3: 0, c4: 20, c5: 0 },
      'S/K': { c2: 15, c3: 0, c4: 15, c5: 0 },
      'D/Q': { c2: 10, c3: 0, c4: 10, c5: 0 },
      'B/M': { c2: 20, c3: 0, c4: 20, c5: 0 },
    }),
    notes: '', createdBy: 'staff-01', updatedAt: '2026-03-01',
  },
  // Villa Cha Cha Bangplumpoo - Day 1 (Feb 26) — confirmed, sent all
  {
    id: 'lf-06', formNumber: 'LF-20260226-002', customerId: 'cust-02', date: '2026-02-26',
    status: 'confirmed',
    rows: makeRows({
      'B/F': { c2: 20, c3: 0, c4: 20, c5: 0, c6: 20 },
      'B/H': { c2: 15, c3: 0, c4: 15, c5: 0, c6: 15 },
      'B/T': { c2: 35, c3: 0, c4: 35, c5: 0, c6: 35 },
      'P/C': { c2: 30, c3: 0, c4: 30, c5: 0, c6: 30 },
      'S/Q': { c2: 18, c3: 0, c4: 18, c5: 0, c6: 18 },
      'D/Q': { c2: 8, c3: 0, c4: 8, c5: 0, c6: 8 },
      'B/M': { c2: 12, c3: 0, c4: 12, c5: 0, c6: 12 },
    }),
    notes: '', createdBy: 'staff-02', updatedAt: '2026-02-27',
  },
  // Villa Cha Cha Bangplumpoo - Day 2 (Feb 28) — delivered, sent all
  {
    id: 'lf-07', formNumber: 'LF-20260228-002', customerId: 'cust-02', date: '2026-02-28',
    status: 'delivered',
    rows: makeRows({
      'B/F': { c2: 22, c3: 0, c4: 22, c5: 0, c6: 22 },
      'B/H': { c2: 18, c3: 0, c4: 18, c5: 0, c6: 18 },
      'B/T': { c2: 40, c3: 1, c4: 40, c5: 1, c6: 41, note: 'เคลม 1 ขาด' },
      'P/C': { c2: 28, c3: 0, c4: 28, c5: 0, c6: 28 },
      'S/Q': { c2: 20, c3: 0, c4: 20, c5: 0, c6: 20 },
      'D/Q': { c2: 10, c3: 0, c4: 10, c5: 0, c6: 10 },
      'B/M': { c2: 15, c3: 0, c4: 15, c5: 0, c6: 15 },
    }),
    notes: '', createdBy: 'staff-01', updatedAt: '2026-03-01',
  },
  // Villa Cha-Cha Khaosan (Mar 1) — received, col6 = 0
  {
    id: 'lf-08', formNumber: 'LF-20260301-002', customerId: 'cust-03', date: '2026-03-01',
    status: 'received',
    rows: makeRows({
      'B/F': { c2: 15, c3: 0, c4: 0, c5: 0 },
      'B/H': { c2: 10, c3: 0, c4: 0, c5: 0 },
      'B/T': { c2: 30, c3: 2, c4: 0, c5: 0, note: 'เคลม 2' },
      'P/C': { c2: 25, c3: 0, c4: 0, c5: 0 },
      'S/Q': { c2: 15, c3: 0, c4: 0, c5: 0 },
      'D/Q': { c2: 6, c3: 0, c4: 0, c5: 0 },
      'B/M': { c2: 10, c3: 0, c4: 0, c5: 0 },
    }),
    notes: '', createdBy: 'staff-02', updatedAt: '2026-03-01',
  },
  // Sawaddee House (Mar 2) — draft, col6 = 0
  {
    id: 'lf-09', formNumber: 'LF-20260302-001', customerId: 'cust-04', date: '2026-03-02',
    status: 'draft',
    rows: makeRows({
      'B/F': { c2: 10, c3: 0, c4: 0, c5: 0 },
      'B/H': { c2: 8, c3: 0, c4: 0, c5: 0 },
      'B/T': { c2: 20, c3: 0, c4: 0, c5: 0 },
      'P/C': { c2: 18, c3: 0, c4: 0, c5: 0 },
      'S/Q': { c2: 12, c3: 0, c4: 0, c5: 0 },
      'D/Q': { c2: 5, c3: 0, c4: 0, c5: 0 },
      'B/M': { c2: 8, c3: 0, c4: 0, c5: 0 },
    }),
    notes: '', createdBy: 'staff-01', updatedAt: '2026-03-02',
  },
  // บ้านวัชรา (flat-rate, Feb 27) — confirmed, sent all
  {
    id: 'lf-10', formNumber: 'LF-20260227-002', customerId: 'cust-05', date: '2026-02-27',
    status: 'confirmed',
    rows: makeRows({
      'B/T': { c2: 30, c3: 0, c4: 30, c5: 0, c6: 30 },
      'B/H': { c2: 15, c3: 0, c4: 15, c5: 0, c6: 15 },
      'P/C': { c2: 20, c3: 0, c4: 20, c5: 0, c6: 20 },
      'S/Q': { c2: 10, c3: 0, c4: 10, c5: 0, c6: 10 },
      'B/M': { c2: 8, c3: 0, c4: 8, c5: 0, c6: 8 },
    }),
    notes: 'เหมาจ่าย', createdBy: 'staff-01', updatedAt: '2026-02-28',
  },
]

export const SAMPLE_LINEN_FORMS: LinenForm[] = _SAMPLE_LINEN_FORMS.map(f => ({
  ...f, bagsSentCount: 0, bagsPackCount: 0, deptDrying: false, deptIroning: false, deptFolding: false, deptQc: false,
}))

// ============================================================
// Sample Delivery Notes
// ============================================================
export const SAMPLE_DELIVERY_NOTES: DeliveryNote[] = [
  {
    id: 'dn-01', noteNumber: 'SD-20260226-001', customerId: 'cust-01',
    linenFormIds: ['lf-01'],
    date: '2026-02-26',
    items: [
      { code: 'B/F', quantity: 30, isClaim: false }, { code: 'B/H', quantity: 20, isClaim: false },
      { code: 'B/T', quantity: 50, isClaim: false }, { code: 'B/T', quantity: 2, isClaim: true },
      { code: 'P/C', quantity: 40, isClaim: false }, { code: 'S/Q', quantity: 25, isClaim: false },
      { code: 'S/K', quantity: 15, isClaim: false }, { code: 'D/Q', quantity: 10, isClaim: false },
      { code: 'B/M', quantity: 20, isClaim: false },
    ],
    driverName: 'สมชาย', vehiclePlate: 'กข-1234', receiverName: 'คุณสมศักดิ์',
    status: 'acknowledged', isPrinted: true, isBilled: true, notes: '', createdBy: 'staff-01', updatedAt: '2026-02-26',
  },
  {
    id: 'dn-02', noteNumber: 'SD-20260228-001', customerId: 'cust-01',
    linenFormIds: ['lf-02', 'lf-03'],
    date: '2026-02-28',
    items: [
      { code: 'B/F', quantity: 67, isClaim: false }, { code: 'B/H', quantity: 47, isClaim: false },
      { code: 'B/T', quantity: 103, isClaim: false }, { code: 'B/T', quantity: 1, isClaim: true },
      { code: 'P/C', quantity: 80, isClaim: false }, { code: 'S/Q', quantity: 48, isClaim: false },
      { code: 'S/K', quantity: 30, isClaim: false }, { code: 'D/Q', quantity: 20, isClaim: false },
      { code: 'B/M', quantity: 40, isClaim: false },
    ],
    driverName: 'สมชาย', vehiclePlate: 'กข-1234', receiverName: 'คุณสมศักดิ์',
    status: 'delivered', isPrinted: true, isBilled: true, notes: '', createdBy: 'staff-01', updatedAt: '2026-02-28',
  },
  {
    id: 'dn-03', noteNumber: 'SD-20260301-001', customerId: 'cust-02',
    linenFormIds: ['lf-06'],
    date: '2026-03-01',
    items: [
      { code: 'B/F', quantity: 20, isClaim: false }, { code: 'B/H', quantity: 15, isClaim: false },
      { code: 'B/T', quantity: 35, isClaim: false },
      { code: 'P/C', quantity: 30, isClaim: false }, { code: 'S/Q', quantity: 18, isClaim: false },
      { code: 'D/Q', quantity: 8, isClaim: false }, { code: 'B/M', quantity: 12, isClaim: false },
    ],
    driverName: 'สมหญิง', vehiclePlate: 'ขค-5678', receiverName: 'คุณวรรณา',
    status: 'acknowledged', isPrinted: false, isBilled: false, notes: '', createdBy: 'staff-02', updatedAt: '2026-03-01',
  },
]

// ============================================================
// Sample Billing Statements
// ============================================================
export const SAMPLE_BILLING_STATEMENTS: BillingStatement[] = [
  {
    id: 'bs-01', billingNumber: 'WB-202602-001', customerId: 'cust-01',
    deliveryNoteIds: ['dn-01', 'dn-02'],
    billingMonth: '2026-02',
    issueDate: '2026-03-01', dueDate: '2026-03-31',
    lineItems: [
      { code: 'B/F', name: 'ผ้าเช็ดหน้า', quantity: 97, pricePerUnit: 4, amount: 388 },
      { code: 'B/H', name: 'ผ้าเช็ดมือ', quantity: 67, pricePerUnit: 5, amount: 335 },
      { code: 'B/T', name: 'ผ้าเช็ดตัว', quantity: 153, pricePerUnit: 8, amount: 1224 },
      { code: 'P/C', name: 'ปลอกหมอน', quantity: 120, pricePerUnit: 5, amount: 600 },
      { code: 'S/Q', name: "ผ้าปู 5'", quantity: 73, pricePerUnit: 12, amount: 876 },
      { code: 'S/K', name: "ผ้าปู 6'", quantity: 45, pricePerUnit: 12, amount: 540 },
      { code: 'D/Q', name: "ปลอกดูเว่ 5'", quantity: 30, pricePerUnit: 29, amount: 870 },
      { code: 'B/M', name: 'ผ้าเช็ดเท้า', quantity: 60, pricePerUnit: 6, amount: 360 },
    ],
    subtotal: 5193,
    vat: 363.51,
    grandTotal: 5556.51,
    withholdingTax: 155.79,
    netPayable: 5400.72,
    status: 'sent',
    paidDate: null, paidAmount: 0,
    notes: 'ใบวางบิลประจำเดือน ก.พ. 2569',
  },
]

// ============================================================
// Sample Expenses
// ============================================================
export const SAMPLE_EXPENSES: Expense[] = [
  { id: 'exp-01', date: '2026-03-01', category: 'chemicals', description: 'น้ำยาซักผ้า Premium 200L', amount: 12000, reference: 'PO-2026-031', createdBy: 'admin' },
  { id: 'exp-02', date: '2026-03-01', category: 'water', description: 'ค่าน้ำประปา ก.พ. 2026', amount: 8500, reference: '', createdBy: 'admin' },
  { id: 'exp-03', date: '2026-03-01', category: 'electricity', description: 'ค่าไฟฟ้า ก.พ. 2026', amount: 25000, reference: '', createdBy: 'admin' },
  { id: 'exp-04', date: '2026-02-28', category: 'labor', description: 'เงินเดือนพนักงาน ก.พ.', amount: 85000, reference: '', createdBy: 'admin' },
  { id: 'exp-05', date: '2026-02-25', category: 'transport', description: 'ค่าน้ำมันรถส่งผ้า', amount: 4500, reference: '', createdBy: 'admin' },
  { id: 'exp-06', date: '2026-02-20', category: 'maintenance', description: 'ซ่อมเครื่องซักผ้าอุตสาหกรรม #3', amount: 15000, reference: 'MNT-003', createdBy: 'admin' },
  { id: 'exp-07', date: '2026-03-01', category: 'rent', description: 'ค่าเช่าโรงงาน มี.ค.', amount: 35000, reference: '', createdBy: 'admin' },
  { id: 'exp-08', date: '2026-02-15', category: 'chemicals', description: 'น้ำยาปรับผ้านุ่ม 100L', amount: 5500, reference: 'PO-2026-028', createdBy: 'admin' },
]

// ============================================================
// Sample Users (pre-computed bcrypt hashes)
// Admin: flowclean2026 | Staff: staff1234
// ============================================================
const ADMIN_HASH = '$2b$10$DRKyFc.v2JhxskVNf5eaaehJPof8oyD.xmcqjbLIOkAljhEdeaI9a'
const STAFF_HASH = '$2b$10$I5Uieknqc20uLCkJ0fYd..mCifIRPpMeZPeqpd6fM8UodwbWIx6eC'

export const SAMPLE_USERS: AppUser[] = [
  { id: 'admin', name: 'ติ๊ด (Admin)', email: 'flowcleanwash@gmail.com', passwordHash: ADMIN_HASH, role: 'admin', isActive: true },
  { id: 'staff-01', name: 'สมชาย', email: 'somchai@flowclean.com', passwordHash: STAFF_HASH, role: 'staff', isActive: true },
  { id: 'staff-02', name: 'สมหญิง', email: 'somying@flowclean.com', passwordHash: STAFF_HASH, role: 'staff', isActive: true },
]