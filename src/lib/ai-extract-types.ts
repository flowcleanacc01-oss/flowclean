// 358 / LF Input by AI — shared types
//
// ถ่ายรูปใบนับผ้า → Claude Sonnet vision สกัดเป็น rows → review → เติม LF
// 362: สกัด 4 คอลัมน์ในสแกนเดียว — col2 (ลูกค้านับส่ง) · col3 (เคลม) · col5 (โรงซักนับเข้า) · col6 (โรงซักแพคส่ง)
//   ใช้ได้ตั้งแต่ draft → washing (4/7) — ฟอร์มที่กรอกครบจะสแกนทีเดียวได้ทุกช่อง

/** item ของลูกค้าที่ส่งให้ AI ใช้ match (code + ชื่อที่ลูกค้าใช้) */
export interface CustomerItemHint {
  code: string
  name: string
}

/** 1 แถวที่ AI สกัดได้จากรูป */
export interface ExtractedRow {
  code: string | null          // item code ที่ AI match ได้ (null = match ไม่ได้)
  name_raw: string             // ข้อความดิบที่อ่านจากรูป (ให้คนตรวจ)
  col2_send: number | null     // ลูกค้านับส่ง (ส่งซักปกติ / washing normally)
  col3_claim: number | null    // เคลม (ส่งเคลมซัก / claim)
  col5_countedIn: number | null // โรงซักนับเข้า (counted in)
  col6_packSend: number | null  // โรงซักแพคส่ง (pack and deliver)
  note: string | null
  confidence: number           // 0-1
}

export interface ExtractedLF {
  detected_date: string | null      // วันที่ถ้าเห็นในรูป (ISO)
  detected_customer: string | null  // 368: ชื่อ/รหัสลูกค้าที่เขียนบนใบ (ช่อง "ชื่อ") — ดิบ ไว้ auto-match
  rows: ExtractedRow[]
  warnings: string[]
}

export interface LFExtractRequest {
  imageBase64: string            // base64 (ไม่รวม data: prefix)
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  items: CustomerItemHint[]
  mode?: 'form' | 'checklist'    // 363: 'checklist' = ใบเช็คผ้า (per-bag) · default 'form'
}

// 363 — ใบเช็คผ้า (pack checklist): per item อ่านเลขต่อถุง (น้ำเงิน) + reference (แดง)
export interface ExtractedChecklistRow {
  code: string | null
  name_raw: string
  reference: number | null   // เลขแดง (ลูกค้านับส่ง/นับเข้า) — cross-check
  bags: number[]             // เลขน้ำเงินต่อถุง เช่น [43, 36] · col6 = sum(bags)
  confidence: number
}
export interface ExtractedChecklist {
  detected_customer: string | null
  detected_date: string | null
  rows: ExtractedChecklistRow[]
  warnings: string[]
}
export interface LFChecklistResponse {
  ok: boolean
  data?: ExtractedChecklist
  error?: string
}

export interface LFExtractResponse {
  ok: boolean
  data?: ExtractedLF
  error?: string
}

/** ค่าที่ accept แล้วส่งกลับไปเติม LF: code → counts (4 คอลัมน์)
 *  null = AI ไม่เห็นคอลัมน์นั้นบนเอกสาร → ห้ามเขียนทับค่าเดิม (กัน data loss ตอนสแกนเอกสารไม่ครบช่อง) */
export type AiFillMap = Record<string, { col2: number | null; col3: number | null; col5: number | null; col6: number | null }>
