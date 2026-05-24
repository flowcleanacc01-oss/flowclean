// 358 / LF Input by AI (Phase 1) — shared types
//
// ถ่ายรูปใบนับผ้า → Claude Sonnet vision สกัดเป็น rows → review → เติม col2/col3 ของ LF
// Phase 1 โฟกัส col2 (ลูกค้านับส่ง) + col3 (เคลม) — เพราะ "ตอนสร้าง LF" = ลูกค้านับส่ง (draft)

/** item ของลูกค้าที่ส่งให้ AI ใช้ match (code + ชื่อที่ลูกค้าใช้) */
export interface CustomerItemHint {
  code: string
  name: string
}

/** 1 แถวที่ AI สกัดได้จากรูป */
export interface ExtractedRow {
  code: string | null        // item code ที่ AI match ได้ (null = match ไม่ได้)
  name_raw: string           // ข้อความดิบที่อ่านจากรูป (ให้คนตรวจ)
  col2_send: number | null   // ลูกค้านับส่ง
  col3_claim: number | null  // เคลม (ถ้ามี)
  note: string | null
  confidence: number         // 0-1
}

export interface ExtractedLF {
  detected_date: string | null   // วันที่ถ้าเห็นในรูป (ISO)
  rows: ExtractedRow[]
  warnings: string[]
}

export interface LFExtractRequest {
  imageBase64: string            // base64 (ไม่รวม data: prefix)
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  items: CustomerItemHint[]
}

export interface LFExtractResponse {
  ok: boolean
  data?: ExtractedLF
  error?: string
}

/** ค่าที่ accept แล้วส่งกลับไปเติม LF: code → counts */
export type AiFillMap = Record<string, { col2: number; col3: number }>
