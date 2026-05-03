/**
 * 213.2 Phase 1.1 — Linen Vocabulary
 *
 * Industry-standard facet vocabulary สำหรับ catalog
 * อ้างอิง Hilton/Marriott/Aramark hospitality laundry
 *
 * Pattern: Faceted classification (Approach E)
 * - กำหนด vocab ล่วงหน้า — ไม่ให้ user พิมพ์ free text (ยกเว้น variant)
 * - facetKey ของรายการที่ facets เหมือนกันต้องเหมือนกัน → กัน duplicate ระดับ schema
 * - Code + canonical name auto-generated จาก facets
 * - Per-customer nickname override display เท่านั้น (ไม่กระทบ canonical)
 */

export interface FacetOption {
  value: string
  labelTh: string
  labelEn: string
  /** prefix ใช้สร้าง code (1-3 ตัวอักษร) — capital letters */
  codeShort: string
}

// ────────────────────────────────────────────────────────────────
// TYPE — ประเภทผ้า (REQUIRED)
// ────────────────────────────────────────────────────────────────
export const TYPE_OPTIONS: FacetOption[] = [
  { value: 'towel',          labelTh: 'ผ้าขนหนู',           labelEn: 'Towel',           codeShort: 'TWL' },
  { value: 'bed_sheet',      labelTh: 'ผ้าปูที่นอน',           labelEn: 'Bed Sheet',       codeShort: 'BSH' },
  { value: 'pillow_case',    labelTh: 'ปลอกหมอน',          labelEn: 'Pillow Case',     codeShort: 'PCS' },
  { value: 'duvet_cover',    labelTh: 'ปลอกดูเว่',           labelEn: 'Duvet Cover',     codeShort: 'DCV' },
  { value: 'duvet_insert',   labelTh: 'ไส้ดูเว่',              labelEn: 'Duvet Insert',    codeShort: 'DIN' },
  { value: 'mattress_pad',   labelTh: 'รองกันเปื้อน',         labelEn: 'Mattress Pad',    codeShort: 'MTP' },
  { value: 'bath_mat',       labelTh: 'ผ้าเช็ดเท้า',          labelEn: 'Bath Mat',        codeShort: 'BMT' },
  { value: 'bathrobe',       labelTh: 'เสื้อคลุมอาบน้ำ',       labelEn: 'Bathrobe',        codeShort: 'RBE' },
  { value: 'pool_towel',     labelTh: 'ผ้าสระน้ำ',           labelEn: 'Pool Towel',      codeShort: 'PTW' },
  { value: 'spa_cover',      labelTh: 'ผ้าคลุมเตียงสปา',     labelEn: 'Spa Cover',       codeShort: 'SPC' },
  { value: 'spa_uniform',    labelTh: 'ชุดสปา',            labelEn: 'Spa Uniform',     codeShort: 'SPU' },
  { value: 'table_cloth',    labelTh: 'ผ้าปูโต๊ะ',            labelEn: 'Table Cloth',     codeShort: 'TBL' },
  { value: 'napkin',         labelTh: 'ผ้าเช็ดปาก',          labelEn: 'Napkin',          codeShort: 'NPK' },
  { value: 'staff_uniform',  labelTh: 'เครื่องแบบพนักงาน',     labelEn: 'Staff Uniform',   codeShort: 'UNI' },
  { value: 'other',          labelTh: 'อื่นๆ',                labelEn: 'Other',           codeShort: 'OTH' },
]

// ────────────────────────────────────────────────────────────────
// APPLICATION — การใช้งาน (depends on type)
// ────────────────────────────────────────────────────────────────
export const APPLICATION_OPTIONS_BY_TYPE: Record<string, FacetOption[]> = {
  towel: [
    { value: 'bath',          labelTh: 'อาบน้ำ',          labelEn: 'Bath',         codeShort: 'BTH' },
    { value: 'face',          labelTh: 'หน้า',            labelEn: 'Face',         codeShort: 'FCE' },
    { value: 'hand',          labelTh: 'มือ',             labelEn: 'Hand',         codeShort: 'HND' },
    { value: 'foot_massage',  labelTh: 'นวดเท้า',         labelEn: 'Foot Massage', codeShort: 'FTM' },
    { value: 'pool',          labelTh: 'สระว่ายน้ำ',         labelEn: 'Pool',         codeShort: 'POL' },
    { value: 'spa',           labelTh: 'สปา',             labelEn: 'Spa',          codeShort: 'SPA' },
    { value: 'kids',          labelTh: 'เด็ก',             labelEn: 'Kids',         codeShort: 'KID' },
  ],
  pillow_case: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'decorative',    labelTh: 'ตกแต่ง',          labelEn: 'Decorative',   codeShort: 'DEC' },
    { value: 'massage',       labelTh: 'นวด',             labelEn: 'Massage',      codeShort: 'MSG' },
  ],
  bed_sheet: [
    { value: 'fitted',        labelTh: 'รัดมุม',           labelEn: 'Fitted',       codeShort: 'FIT' },
    { value: 'flat',          labelTh: 'แบน',             labelEn: 'Flat',         codeShort: 'FLT' },
    { value: 'bottom',        labelTh: 'ปูล่าง',           labelEn: 'Bottom',       codeShort: 'BTM' },
  ],
  spa_cover: [
    { value: 'bed',           labelTh: 'เตียง',            labelEn: 'Bed',          codeShort: 'BED' },
    { value: 'pillow',        labelTh: 'หมอน',            labelEn: 'Pillow',       codeShort: 'PIL' },
    { value: 'face_hole',     labelTh: 'รูเตียงหน้า',        labelEn: 'Face Hole',    codeShort: 'FHL' },
  ],
}

// ────────────────────────────────────────────────────────────────
// SIZE — preset bed/pillow sizes
// ────────────────────────────────────────────────────────────────
export const BED_SIZE_PRESETS: FacetOption[] = [
  { value: 'single',     labelTh: '3.5 ฟุต (single)',  labelEn: 'Single (3.5ft)',     codeShort: 'S' },
  { value: 'queen',      labelTh: '5 ฟุต (queen)',     labelEn: 'Queen (5ft)',        codeShort: 'Q' },
  { value: 'king',       labelTh: '6 ฟุต (king)',      labelEn: 'King (6ft)',         codeShort: 'K' },
  { value: 'super_king', labelTh: '6.5+ ฟุต (super)',  labelEn: 'Super King (6.5+)',  codeShort: 'SK' },
]

export const PILLOW_SIZE_PRESETS: FacetOption[] = [
  { value: 'standard',  labelTh: 'มาตรฐาน',  labelEn: 'Standard',  codeShort: 'STD' },
  { value: 'king',      labelTh: 'King',     labelEn: 'King',      codeShort: 'K'   },
  { value: 'euro',      labelTh: 'Euro',     labelEn: 'Euro',      codeShort: 'EU'  },
  { value: 'boudoir',   labelTh: 'Boudoir',  labelEn: 'Boudoir',   codeShort: 'BD'  },
]

export const GENERIC_SIZE_PRESETS: FacetOption[] = [
  { value: 'small',     labelTh: 'เล็ก',     labelEn: 'Small',  codeShort: 'S' },
  { value: 'medium',    labelTh: 'กลาง',    labelEn: 'Medium', codeShort: 'M' },
  { value: 'large',     labelTh: 'ใหญ่',    labelEn: 'Large',  codeShort: 'L' },
]

export const SIZE_UNIT_OPTIONS = [
  { value: 'inch',     labelTh: 'นิ้ว',  labelEn: '"',  codeShort: 'IN' },
  { value: 'cm',       labelTh: 'ซม.', labelEn: 'cm', codeShort: 'CM' },
  { value: 'ft',       labelTh: 'ฟุต', labelEn: 'ft', codeShort: 'FT' },
  { value: 'standard', labelTh: 'มาตรฐาน', labelEn: 'std', codeShort: '' },
] as const

export type SizeUnit = 'inch' | 'cm' | 'ft' | 'standard'

// ────────────────────────────────────────────────────────────────
// COLOR
// ────────────────────────────────────────────────────────────────
export const COLOR_OPTIONS: FacetOption[] = [
  { value: 'white',      labelTh: 'ขาว',          labelEn: 'White',      codeShort: 'WH'  },
  { value: 'off_white',  labelTh: 'ขาวนวล',        labelEn: 'Off-White',  codeShort: 'OWH' },
  { value: 'gray',       labelTh: 'เทา',          labelEn: 'Gray',       codeShort: 'GY'  },
  { value: 'light_gray', labelTh: 'เทาอ่อน',       labelEn: 'Light Gray', codeShort: 'LGY' },
  { value: 'charcoal',   labelTh: 'เทาเข้ม',        labelEn: 'Charcoal',   codeShort: 'CHR' },
  { value: 'tan',        labelTh: 'น้ำตาลอ่อน',     labelEn: 'Tan',        codeShort: 'TN'  },
  { value: 'brown',      labelTh: 'น้ำตาล',        labelEn: 'Brown',      codeShort: 'BR'  },
  { value: 'black',      labelTh: 'ดำ',           labelEn: 'Black',      codeShort: 'BK'  },
  { value: 'navy',       labelTh: 'กรมท่า',         labelEn: 'Navy',       codeShort: 'NV'  },
  { value: 'blue',       labelTh: 'ฟ้า',           labelEn: 'Blue',       codeShort: 'BL'  },
  { value: 'green',      labelTh: 'เขียว',         labelEn: 'Green',      codeShort: 'GR'  },
  { value: 'pink',       labelTh: 'ชมพู',         labelEn: 'Pink',       codeShort: 'PK'  },
  { value: 'yellow',     labelTh: 'เหลือง',        labelEn: 'Yellow',     codeShort: 'YL'  },
  { value: 'red',        labelTh: 'แดง',          labelEn: 'Red',        codeShort: 'RD'  },
  { value: 'pattern',    labelTh: 'ลาย (ดู pattern)', labelEn: 'Patterned', codeShort: 'PT'  },
]

// ────────────────────────────────────────────────────────────────
// WEIGHT (towels หลัก)
// ────────────────────────────────────────────────────────────────
export const WEIGHT_OPTIONS: FacetOption[] = [
  { value: 'thin',   labelTh: 'บาง',     labelEn: 'Thin',   codeShort: 'TN' },
  { value: 'medium', labelTh: 'กลาง',    labelEn: 'Medium', codeShort: 'MD' },
  { value: 'thick',  labelTh: 'หนา',     labelEn: 'Thick',  codeShort: 'TH' },
]

// ────────────────────────────────────────────────────────────────
// MATERIAL
// ────────────────────────────────────────────────────────────────
export const MATERIAL_OPTIONS: FacetOption[] = [
  { value: 'cotton',       labelTh: 'ฝ้าย 100%',       labelEn: 'Cotton 100%',  codeShort: 'COT' },
  { value: 'cotton_blend', labelTh: 'ฝ้ายผสม',         labelEn: 'Cotton Blend', codeShort: 'CTB' },
  { value: 'microfiber',   labelTh: 'ไมโครไฟเบอร์',     labelEn: 'Microfiber',   codeShort: 'MCF' },
  { value: 'polyester',    labelTh: 'โพลีเอสเตอร์',     labelEn: 'Polyester',    codeShort: 'PLY' },
  { value: 'bamboo',       labelTh: 'ไผ่',             labelEn: 'Bamboo',       codeShort: 'BMB' },
  { value: 'linen',        labelTh: 'ลินิน',           labelEn: 'Linen',        codeShort: 'LIN' },
]

// ────────────────────────────────────────────────────────────────
// PATTERN
// ────────────────────────────────────────────────────────────────
export const PATTERN_OPTIONS: FacetOption[] = [
  { value: 'plain',  labelTh: 'พื้น',          labelEn: 'Plain',  codeShort: 'PLN' },
  { value: 'stripe', labelTh: 'ลายทาง',       labelEn: 'Stripe', codeShort: 'STP' },
  { value: 'check',  labelTh: 'ลายตาราง',     labelEn: 'Check',  codeShort: 'CHK' },
  { value: 'floral', labelTh: 'ลายดอก',       labelEn: 'Floral', codeShort: 'FLR' },
  { value: 'logo',   labelTh: 'โลโก้',         labelEn: 'Logo',   codeShort: 'LGO' },
  { value: 'print',  labelTh: 'พิมพ์ลาย',      labelEn: 'Print',  codeShort: 'PRN' },
]

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/** หา label ภาษาไทย จาก facet key + value */
export function getFacetLabel(key: string, value: string | null | undefined, lang: 'th' | 'en' = 'th'): string {
  if (!value) return ''
  const map: Record<string, FacetOption[] | Record<string, FacetOption[]>> = {
    type: TYPE_OPTIONS,
    application: APPLICATION_OPTIONS_BY_TYPE,
    color: COLOR_OPTIONS,
    weight: WEIGHT_OPTIONS,
    material: MATERIAL_OPTIONS,
    pattern: PATTERN_OPTIONS,
    size_bed: BED_SIZE_PRESETS,
    size_pillow: PILLOW_SIZE_PRESETS,
    size_generic: GENERIC_SIZE_PRESETS,
  }
  const opts = map[key]
  if (!opts) return value
  // application is keyed by type
  const list = Array.isArray(opts) ? opts : Object.values(opts).flat()
  const found = list.find(o => o.value === value)
  if (!found) return value
  return lang === 'th' ? found.labelTh : found.labelEn
}

/** ดึง applications ที่เป็นไปได้สำหรับ type นี้ */
export function getApplicationsForType(type: string): FacetOption[] {
  return APPLICATION_OPTIONS_BY_TYPE[type] || []
}

/** ดึง size presets ตาม type */
export function getSizePresetsForType(type: string): FacetOption[] {
  if (type === 'bed_sheet' || type === 'duvet_cover' || type === 'duvet_insert' || type === 'mattress_pad') {
    return BED_SIZE_PRESETS
  }
  if (type === 'pillow_case') {
    return PILLOW_SIZE_PRESETS
  }
  return GENERIC_SIZE_PRESETS
}
