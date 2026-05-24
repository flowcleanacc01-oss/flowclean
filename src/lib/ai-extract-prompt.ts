// 358 / LF Input by AI — model, system prompt, output schema
//
// caching: system prompt = static (cacheable) · item list = volatile → ไปอยู่ใน user message

import type { CustomerItemHint } from './ai-extract-types'

// พี่จ๊อบเลือก Sonnet ใน plan (vision + structured outputs + Thai + ราคาถูก ~$0.003/รูป)
export const LF_EXTRACT_MODEL = 'claude-sonnet-4-6'

// static — เหมือนเดิมทุก request → cache_control ได้
export const LF_EXTRACT_SYSTEM = `You extract linen-laundry tally data from a photo of a Thai hotel-linen tally sheet. The sheet may be handwritten or typed/printed — detect automatically.

The sheet lists linen items with the quantity the HOTEL is sending to the laundry. For each line item, extract:
- col2_send: the main quantity the customer is sending. Use null if no number is present.
- col3_claim: a separate "เคลม" (claim / damaged) count ONLY if the sheet clearly shows one for that line; otherwise null.

You will be given the customer's valid item list as JSON (each has a "code" and a Thai "name"). Match each line on the sheet to the closest item by name and return that item's "code". If you cannot confidently match a line to a code, return code = null and still return the raw text in name_raw.

Rules:
- name_raw: ALWAYS the raw text/label you read for that line, so a human can verify.
- Numbers may be Arabic (1,2,3) or Thai (๑,๒,๓) numerals — output integers.
- confidence: 1.0 = clear printed text · 0.7 = readable handwriting · 0.3 = uncertain guess.
- Skip lines you genuinely cannot read (do NOT fabricate). Note any problems in "warnings" (e.g. "ภาพเบลอบางส่วน", "หาวันที่ไม่เจอ").
- detected_date: if a date is visible, return ISO YYYY-MM-DD; otherwise null.
- Do NOT return header rows, column titles, totals/รวม, or signatures as item rows.`

export function buildUserText(items: CustomerItemHint[]): string {
  return [
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
          note: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
        required: ['code', 'name_raw', 'col2_send', 'col3_claim', 'note', 'confidence'],
      },
    },
  },
  required: ['detected_date', 'warnings', 'rows'],
}
