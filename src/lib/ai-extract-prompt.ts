// 358 / LF Input by AI — model, system prompt, output schema
//
// caching: system prompt = static (cacheable) · item list = volatile → ไปอยู่ใน user message

import type { CustomerItemHint } from './ai-extract-types'

// พี่จ๊อบเลือก Sonnet ใน plan (vision + structured outputs + Thai + ราคาถูก ~$0.003/รูป)
export const LF_EXTRACT_MODEL = 'claude-sonnet-4-6'

// static — เหมือนเดิมทุก request → cache_control ได้
export const LF_EXTRACT_SYSTEM = `You extract linen-laundry tally data from a photo of a Thai hotel-linen tally sheet. The sheet may be handwritten or typed/printed — detect automatically.

The sheet may be a simple count slip (only a "sent" column) OR a full FlowClean form (ใบส่งรับผ้า) with several columns whose printed headers identify them. For each line item, extract these FOUR quantities. Use null for any column that is blank, absent, or not clearly present on this sheet — do NOT copy a number from another column to fill a blank one:
- col2_send: the customer's "sent for washing" count. Headers: "ส่งซักปกติ" / "washing normally" / "ลูกค้านับส่ง". On a simple slip this is the main/only number.
- col3_claim: a separate "เคลม" (claim / damaged) count. Headers: "ส่งเคลมซัก" / "claim". null unless a distinct claim number is shown.
- col5_countedIn: the laundry's "counted in" count. Headers: "โรงซักนับเข้า" / "counted in".
- col6_packSend: the laundry's "pack & deliver" count. Headers: "โรงซักแพคส่ง" / "pack and deliver".
Identify columns by their printed header text and position. IGNORE every other column — especially "washed return", "ลูกค้านับกลับ" (customer count-back), carry-over (ยกยอด), and notes/remain — do NOT map those into the four fields above.

You will be given the customer's valid item list as JSON (each has a "code" and a Thai "name"). Match each line on the sheet to the closest item by name and return that item's "code". If you cannot confidently match a line to a code, return code = null and still return the raw text in name_raw.

Rules:
- name_raw: ALWAYS the raw text/label you read for that line, so a human can verify.
- Numbers may be Arabic (1,2,3) or Thai (๑,๒,๓) numerals — output integers.
- Quantities are NEVER negative. A short dash/stroke just before a number is usually the tip of a brace/bracket "}" used to group several size rows together (Thai tally sheets bracket a size family and write one combined count), NOT a minus sign — output the positive integer.
- confidence: 1.0 = clear printed text · 0.7 = readable handwriting · 0.3 = uncertain guess.
- Skip lines you genuinely cannot read (do NOT fabricate). Note any problems in "warnings" (e.g. "ภาพเบลอบางส่วน", "หาวันที่ไม่เจอ").
- detected_date: the date written on the sheet, converted to ISO YYYY-MM-DD in the Gregorian (Western / ค.ศ.) calendar. Thai laundry forms almost always write the year in the Buddhist Era (พ.ศ. / B.E.), which is 543 years AHEAD of the Gregorian year. Convert like this:
    · 4-digit year >= 2500 (e.g. 2569) is B.E. -> subtract 543 (2569 -> 2026).
    · 2-digit year (e.g. 69, often written after the month as DD/MM/YY) means B.E. 25YY = 2500 + YY -> then subtract 543 (69 -> 2569 -> 2026). NEVER read a 2-digit year as a 19xx year or as a Gregorian year directly.
    · A 4-digit Gregorian year (19xx / 20xx) is rare on these forms; if clearly written that way, use it as-is.
  Sanity check: the converted Gregorian year MUST be within about 1 year of today's date (given in the user message). If your result lands far away (e.g. 1996, 2053), you have almost certainly misread a digit — handwritten Thai 6 and 9 are very easily swapped (69 <-> 96) — so re-read and pick the plausible recent date.
  If you cannot read the date confidently, return null and add a warning (e.g. "อ่านวันที่ไม่ชัด"). Do NOT output a specific date you are unsure of.
- Do NOT return header rows, column titles, totals/รวม, or signatures as item rows.`

export function buildUserText(items: CustomerItemHint[]): string {
  // วันนี้ตามเวลาไทย (Asia/Bangkok) — anchor ให้ AI sanity-check การแปลง พ.ศ.→ค.ศ.
  // อยู่ใน user message (volatile) ไม่ใช่ system prompt → ไม่ทำลาย cache + ไม่ค้างปี
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()) // YYYY-MM-DD
  return [
    `Today's date (Gregorian, Asia/Bangkok timezone): ${today}. The date written on the sheet should be close to this — use it to sanity-check your พ.ศ.→ค.ศ. conversion.`,
    '',
    "Customer's valid item list (match by name, return the matching code):",
    JSON.stringify(items),
    '',
    'Extract the tally data from the attached image into the required JSON structure.',
  ].join('\n')
}

// JSON schema สำหรับ output_config.format (strict structured output)
// strict mode: ทุก key ต้องอยู่ใน required + additionalProperties:false · optional = union null
export const LF_EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    detected_date: { type: ['string', 'null'] },
    warnings: { type: 'array', items: { type: 'string' } },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: ['string', 'null'] },
          name_raw: { type: 'string' },
          col2_send: { type: ['integer', 'null'] },
          col3_claim: { type: ['integer', 'null'] },
          col5_countedIn: { type: ['integer', 'null'] },
          col6_packSend: { type: ['integer', 'null'] },
          note: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
        required: ['code', 'name_raw', 'col2_send', 'col3_claim', 'col5_countedIn', 'col6_packSend', 'note', 'confidence'],
      },
    },
  },
  required: ['detected_date', 'warnings', 'rows'],
}
