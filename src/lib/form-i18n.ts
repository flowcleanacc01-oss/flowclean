// 376 — Form Designer v3: trilingual (ไทย / English / မြန်မာ) labels + density config
//
// ⚠️⚠️ BURMESE (my) = DRAFT — ต้อง VERIFY กับคนงานพม่าของลูกค้าก่อน live ⚠️⚠️
//   - ไทย (th) + อังกฤษ (en) = ถูกต้อง 100%
//   - พม่า (my) = best-effort draft (สมนึกอ่านจาก PDF ฟอร์มเดิมไม่ชัดพอจะลอกแม่น)
//   - แก้ได้ที่ไฟล์เดียวนี้ — ใส่คำแปลเป๊ะจากฟอร์มเดิมทับได้เลย
//   - ถ้า my = '' ฟอร์มจะข้ามบรรทัดพม่า (โชว์แค่ ไทย+อังกฤษ) — ปลอดภัย ไม่โชว์ของผิด

export type FormLang = 'th' | 'en' | 'my'

export interface TriLabel {
  th: string
  en: string
  my: string
}

/** Fixed form-structure labels (หัวตาราง / ป้ายกำกับ / ลายเซ็น / กล่องนับถุง) */
export const FL = {
  // Document titles
  docTitleLf: { th: 'ใบส่ง-รับผ้า', en: 'Linen Delivery Note', my: 'အဝတ်လျှော် ပို့-လက်ခံစာရင်း' },
  docTitleCk: { th: 'ใบเช็คผ้า', en: 'Linen Checklist', my: 'အဝတ်လျှော် စစ်ဆေးစာရင်း' },
  // Provenance
  customer: { th: 'ชื่อลูกค้า', en: 'Business Name', my: 'ဖောက်သည်အမည်' },
  date: { th: 'วันที่', en: 'Date', my: 'ရက်စွဲ' },
  customerFills: { th: '(ลูกค้ากรอก)', en: '(Customer fills)', my: '(ဖောက်သည်ဖြည့်ရန်)' },
  // Table headers
  no: { th: 'ลำดับ', en: 'No.', my: 'စဉ်' },
  item: { th: 'รายการ', en: 'Item', my: 'ပစ္စည်း' },
  total: { th: 'รวม', en: 'Total', my: 'စုစုပေါင်း' },
  // LF data columns (1-6)
  sendNormal: { th: 'ส่งซักปกติ', en: 'Washing normally', my: 'ပုံမှန်လျှော်ရန်ပို့' },
  sendClaim: { th: 'ส่งเคลมซัก', en: 'Claim', my: 'တောင်းဆိုလျှော်' },
  washedReturn: { th: 'ผ้าซักแล้วกลับมา', en: 'Washed return', my: 'လျှော်ပြီးပြန်လာ' },
  countedIn: { th: 'โรงซักนับเข้า', en: 'Counted in', my: 'စက်ရုံရေတွက်ဝင်' },
  packDeliver: { th: 'โรงซักแพคส่ง', en: 'Pack & deliver', my: 'ထုပ်ပိုးပို့' },
  noteRemainReturn: { th: 'หมายเหตุ · ค้าง(-)/คืน(+)', en: 'Note · remain(-)/return(+)', my: 'မှတ်ချက် · ကျန်(-)/ပြန်(+)' },
  // CK data columns
  ckCountSend: { th: 'นับส่ง', en: 'Count sent', my: 'ပို့ရေတွက်' },
  ckPerBagPack: { th: 'ต่อถุง — แพคส่ง', en: 'Per bag — packed', my: 'အိတ်အလိုက် — ထုပ်ပိုး' },
  // Header count boxes
  sacksForWashing: { th: 'จำนวนถุงกระสอบ ผ้าส่งซัก', en: 'Sacks for washing', my: 'လျှော်ရန် အိတ်အရေအတွက်' },
  packBagsDelivery: { th: 'จำนวนผ้าซักแล้ว แพคถุงจัดส่ง', en: 'Pack bags delivery', my: 'ထုပ်ပိုးပို့ အိတ်အရေအတွက်' },
  bagCount: { th: 'จำนวนถุง', en: 'Bags', my: 'အိတ်အရေအတွက်' },
  // Signatures (bidirectional)
  senderWash: { th: 'ผู้ส่งผ้าซัก', en: 'Sender', my: 'ပို့သူ' },
  receiverWash: { th: 'ผู้รับผ้าซัก', en: 'Receiver', my: 'လက်ခံသူ' },
  receiverWashed: { th: 'ผู้รับผ้าซักรีดแล้ว', en: 'Receiver (washed)', my: 'လျှော်ပြီး လက်ခံသူ' },
  senderWashed: { th: 'ผู้ส่งผ้าซักรีดแล้ว', en: 'Sender (washed)', my: 'လျှော်ပြီး ပို့သူ' },
  // Misc
  penRed: { th: 'นับส่ง = ปากกาแดง', en: 'Count sent = red pen', my: 'ပို့ရေတွက် = အနီ' },
  penBlue: { th: 'ต่อถุง = ปากกาน้ำเงิน', en: 'Per bag = blue pen', my: 'အိတ်အလိုက် = အပြာ' },
  page: { th: 'หน้า', en: 'Page', my: 'စာမျက်နှာ' },
} as const satisfies Record<string, TriLabel>

/**
 * Burmese item-name overrides (code → မြန်မာ).
 * ⚠️ DRAFT — ใส่คำแปลเป๊ะจากฟอร์มเดิมทับ · '' หรือไม่มี key = fallback ไทย+อังกฤษ
 * ปล่อยว่างไว้ก่อนได้ — ฟอร์มจะโชว์ ไทย+อังกฤษ ต่อ item ตามปกติ
 */
export const BURMESE_ITEM: Record<string, string> = {
  // ตัวอย่าง draft (ลบ/แก้ได้): 'B/F': 'မျက်နှာသုတ်ပဝါ',
}

/** 376.1 — Row density presets (จำนวนแถวที่ fit ต่อหน้าโดยประมาณ) */
export type FormDensity = 'normal' | 'compact' | 'ultra'

export const DENSITY: Record<FormDensity, { label: string; rowsPerPage: number; cellPy: string; fontPx: number }> = {
  normal: { label: 'ปกติ', rowsPerPage: 22, cellPy: 'py-1.5', fontPx: 11 },
  compact: { label: 'แน่น', rowsPerPage: 30, cellPy: 'py-1', fontPx: 10 },
  ultra: { label: 'แน่นมาก', rowsPerPage: 40, cellPy: 'py-0.5', fontPx: 9 },
}

/**
 * Render trilingual stack: ไทย (เด่น) / อังกฤษ (รอง) / พม่า (ถ้ามี)
 * คืน array ของบรรทัดที่ไม่ว่าง ตามภาษาที่เลือก
 */
export function triLines(label: TriLabel, langs: FormLang[]): string[] {
  return langs.map(l => label[l]).filter(Boolean)
}
