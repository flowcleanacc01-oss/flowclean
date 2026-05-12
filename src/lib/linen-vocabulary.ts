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
// 247: ขยายให้ครอบคลุม catalog จริง (317 รายการ) — เพิ่ม 18 types
// ────────────────────────────────────────────────────────────────
export const TYPE_OPTIONS: FacetOption[] = [
  // ── Bed Linens ──────────────────────────────────────────
  { value: 'bed_sheet',           labelTh: 'ผ้าปูที่นอน',           labelEn: 'Bed Sheet',          codeShort: 'BSH' },
  { value: 'massage_bed_sheet',   labelTh: 'ผ้าปูเตียงนวด',       labelEn: 'Massage Bed Sheet',  codeShort: 'MBS' },
  { value: 'pillow_case',         labelTh: 'ปลอกหมอน',          labelEn: 'Pillow Case',        codeShort: 'PCS' },
  { value: 'pillow',              labelTh: 'หมอน',              labelEn: 'Pillow',             codeShort: 'PLW' },
  { value: 'duvet_cover',         labelTh: 'ปลอกผ้านวม',         labelEn: 'Duvet Cover',        codeShort: 'DCV' },
  { value: 'duvet_insert',        labelTh: 'ไส้ผ้านวม',           labelEn: 'Duvet Insert',       codeShort: 'DIN' },
  { value: 'mattress_pad',        labelTh: 'รองกันเปื้อน',         labelEn: 'Mattress Pad',       codeShort: 'MTP' },
  { value: 'topper',              labelTh: 'ท็อปเปอร์',            labelEn: 'Topper',             codeShort: 'TOP' },
  { value: 'top_sheet',           labelTh: 'ท๊อปชีท',             labelEn: 'Top Sheet',          codeShort: 'TSH' },
  { value: 'bed_skirt',           labelTh: 'สเกิ๊ตเตียง',          labelEn: 'Bed Skirt',          codeShort: 'BSK' },
  { value: 'blanket',             labelTh: 'ผ้าห่ม',              labelEn: 'Blanket',            codeShort: 'BLK' },
  { value: 'bed_cover',           labelTh: 'ผ้าคลุมเตียง',         labelEn: 'Bed Cover',          codeShort: 'BCV' },

  // ── Towels & Bath ───────────────────────────────────────
  { value: 'towel',               labelTh: 'ผ้าขนหนู',           labelEn: 'Towel',              codeShort: 'TWL' },
  { value: 'foot_massage_towel',  labelTh: 'ผ้านวดเท้า',         labelEn: 'Foot Massage Towel', codeShort: 'FMT' },
  { value: 'bath_mat',            labelTh: 'ผ้าเช็ดเท้า',          labelEn: 'Bath Mat',           codeShort: 'BMT' },
  { value: 'bathrobe',            labelTh: 'เสื้อคลุมอาบน้ำ',       labelEn: 'Bathrobe',           codeShort: 'RBE' },
  { value: 'pool_towel',          labelTh: 'ผ้าสระน้ำ',           labelEn: 'Pool Towel',         codeShort: 'PTW' },

  // ── Furniture Covers ────────────────────────────────────
  { value: 'sofa_cover',          labelTh: 'ปลอกโซฟา',          labelEn: 'Sofa Cover',         codeShort: 'SFC' },
  { value: 'chair_cover',         labelTh: 'ผ้าคลุมเก้าอี้',         labelEn: 'Chair Cover',        codeShort: 'CHC' },
  { value: 'table_cover',         labelTh: 'ผ้าคลุมโต๊ะ',          labelEn: 'Table Cover',        codeShort: 'TBC' },
  { value: 'table_cloth',         labelTh: 'ผ้าปูโต๊ะ',            labelEn: 'Table Cloth',        codeShort: 'TBL' },
  { value: 'curtain',             labelTh: 'ผ้าม่าน',             labelEn: 'Curtain',            codeShort: 'CTN' },
  { value: 'rug',                 labelTh: 'พรม',               labelEn: 'Rug',                codeShort: 'RUG' },

  // ── Uniforms & Apparel ──────────────────────────────────
  { value: 'uniform_top',         labelTh: 'เสื้อ (พนักงาน)',       labelEn: 'Top (Uniform)',      codeShort: 'UTP' },
  { value: 'uniform_bottom',      labelTh: 'กางเกง (พนักงาน)',     labelEn: 'Pants (Uniform)',    codeShort: 'UPT' },
  { value: 'uniform_dress',       labelTh: 'ชุด (พนักงาน)',         labelEn: 'Dress/Set (Uniform)', codeShort: 'UDR' },
  { value: 'apron',               labelTh: 'ผ้ากันเปื้อน',         labelEn: 'Apron',              codeShort: 'APR' },
  { value: 'spa_cover',           labelTh: 'ผ้าคลุมเตียงสปา',     labelEn: 'Spa Cover',          codeShort: 'SPC' },
  { value: 'spa_uniform',         labelTh: 'ชุดสปา',            labelEn: 'Spa Uniform',        codeShort: 'SPU' },
  { value: 'staff_uniform',       labelTh: 'เครื่องแบบพนักงาน',     labelEn: 'Staff Uniform',      codeShort: 'UNI' },

  // ── Generic Apparel (255: ไม่ใช่เครื่องแบบพนักงาน) ────────
  { value: 'shirt',               labelTh: 'เสื้อ (ทั่วไป)',         labelEn: 'Shirt (Generic)',    codeShort: 'SHT' },
  { value: 'pants',               labelTh: 'กางเกง (ทั่วไป)',       labelEn: 'Pants (Generic)',    codeShort: 'PNT' },

  // ── Specialty / Utility (255: คลุม catalog edge cases) ───
  { value: 'cleaning_cloth',      labelTh: 'ผ้าทำสะอาด',         labelEn: 'Cleaning Cloth',     codeShort: 'CCL' },
  { value: 'bag',                 labelTh: 'ถุง',                labelEn: 'Bag',                codeShort: 'BAG' },
  { value: 'fabric_roll',         labelTh: 'ผ้าหลา/โดยเมตร',      labelEn: 'Fabric Roll',        codeShort: 'FBR' },
  { value: 'salon_cloth',         labelTh: 'ผ้าซาลอน/ทำเล็บ',    labelEn: 'Salon Cloth',        codeShort: 'SLN' },
  { value: 'lamp_cover',          labelTh: 'โป๊ะไฟผ้า',           labelEn: 'Lamp Cover',         codeShort: 'LMP' },

  // ── Accessories ─────────────────────────────────────────
  { value: 'napkin',              labelTh: 'ผ้าเช็ดปาก',          labelEn: 'Napkin',             codeShort: 'NPK' },
  { value: 'placemat',            labelTh: 'ผ้ารองจาน',          labelEn: 'Placemat',           codeShort: 'PLM' },
  { value: 'slipper',             labelTh: 'รองเท้า',            labelEn: 'Slipper',            codeShort: 'SLP' },
  { value: 'sock',                labelTh: 'ถุงเท้า',             labelEn: 'Sock',               codeShort: 'SCK' },
  { value: 'headband',            labelTh: 'ผ้าคาดศีรษะ',        labelEn: 'Headband',           codeShort: 'HDB' },

  // ── Catch-all ───────────────────────────────────────────
  { value: 'other',               labelTh: 'อื่นๆ',                labelEn: 'Other',              codeShort: 'OTH' },
]

// ────────────────────────────────────────────────────────────────
// APPLICATION — การใช้งาน / subtype (depends on type)
// 247: ขยายตาม catalog จริง — pillow_case มี ปีก/ใน/ซิบ/อิง/ข้าง/รองคอ
// ────────────────────────────────────────────────────────────────
export const APPLICATION_OPTIONS_BY_TYPE: Record<string, FacetOption[]> = {
  towel: [
    { value: 'bath',          labelTh: 'อาบน้ำ',          labelEn: 'Bath',         codeShort: 'BTH' },
    { value: 'face',          labelTh: 'หน้า',            labelEn: 'Face',         codeShort: 'FCE' },
    { value: 'hand',          labelTh: 'มือ',             labelEn: 'Hand',         codeShort: 'HND' },
    { value: 'foot',          labelTh: 'เช็ดเท้า',          labelEn: 'Foot',         codeShort: 'FT'  },
    { value: 'blanket',       labelTh: 'ห่ม',              labelEn: 'Blanket',      codeShort: 'BLK' },
    { value: 'pool',          labelTh: 'สระว่ายน้ำ',         labelEn: 'Pool',         codeShort: 'POL' },
    { value: 'spa',           labelTh: 'สปา',             labelEn: 'Spa',          codeShort: 'SPA' },
    { value: 'kids',          labelTh: 'เด็ก',             labelEn: 'Kids',         codeShort: 'KID' },
  ],
  foot_massage_towel: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'logo',          labelTh: 'โลโก้',           labelEn: 'Logo',         codeShort: 'LGO' },
  ],
  pillow_case: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'large',         labelTh: 'ใหญ่',             labelEn: 'Large',        codeShort: 'L'   },
    { value: 'small',         labelTh: 'เล็ก',             labelEn: 'Small',        codeShort: 'S'   },
    { value: 'wing',          labelTh: 'ปีก',              labelEn: 'Wing',         codeShort: 'WNG' },
    { value: 'inner',         labelTh: 'ใน',               labelEn: 'Inner',        codeShort: 'INN' },
    { value: 'zipper',        labelTh: 'ซิบ',              labelEn: 'Zipper',       codeShort: 'ZIP' },
    { value: 'decorative',    labelTh: 'อิง',              labelEn: 'Decorative',   codeShort: 'DEC' },
    { value: 'side',          labelTh: 'ข้าง',             labelEn: 'Side',         codeShort: 'SD'  },
    { value: 'neck',          labelTh: 'รองคอ',          labelEn: 'Neck',         codeShort: 'NCK' },
    { value: 'massage',       labelTh: 'นวด',             labelEn: 'Massage',      codeShort: 'MSG' },
  ],
  pillow: [
    { value: 'standard',      labelTh: 'หนุน',             labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'small',         labelTh: 'หนุนเล็ก',          labelEn: 'Small',        codeShort: 'S'   },
    { value: 'decorative',    labelTh: 'อิง',              labelEn: 'Decorative',   codeShort: 'DEC' },
  ],
  bed_sheet: [
    { value: 'fitted',        labelTh: 'รัดมุม',           labelEn: 'Fitted',       codeShort: 'FIT' },
    { value: 'flat',          labelTh: 'แบน',             labelEn: 'Flat',         codeShort: 'FLT' },
    { value: 'bottom',        labelTh: 'ปูล่าง',           labelEn: 'Bottom',       codeShort: 'BTM' },
  ],
  massage_bed_sheet: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'face_hole',     labelTh: 'หลุม',             labelEn: 'Face Hole',    codeShort: 'FHL' },
  ],
  duvet_cover: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'zipper',        labelTh: 'ซิบ',              labelEn: 'Zipper',       codeShort: 'ZIP' },
  ],
  blanket: [
    { value: 'standard',      labelTh: 'ธรรมดา',          labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'thin',          labelTh: 'บาง',              labelEn: 'Thin',         codeShort: 'THN' },
    { value: 'quilted',       labelTh: 'นวม (มีไส้)',       labelEn: 'Quilted',      codeShort: 'QLT' },
    { value: 'towel',         labelTh: 'ขนหนู',           labelEn: 'Towel-type',   codeShort: 'TWL' },
    { value: 'nano',          labelTh: 'นาโน',             labelEn: 'Nano',         codeShort: 'NAN' },
  ],
  sofa_cover: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'small',         labelTh: 'เล็ก',             labelEn: 'Small',        codeShort: 'S'   },
    { value: 'medium',        labelTh: 'กลาง',             labelEn: 'Medium',       codeShort: 'M'   },
    { value: 'large',         labelTh: 'ใหญ่',             labelEn: 'Large',        codeShort: 'L'   },
  ],
  bed_cover: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'with_ruffle',   labelTh: 'มีระบาย',          labelEn: 'With Ruffle',  codeShort: 'RFL' },
    { value: 'head_only',     labelTh: 'คลุมหัวเตียง',     labelEn: 'Headboard',    codeShort: 'HD'  },
    { value: 'massage_hole',  labelTh: 'เตียงหลุม',          labelEn: 'Massage Hole', codeShort: 'MHL' },
  ],
  curtain: [
    { value: 'thin',          labelTh: 'บาง',              labelEn: 'Sheer',        codeShort: 'THN' },
    { value: 'thick',         labelTh: 'หนา/ทึบ',          labelEn: 'Thick/Black',  codeShort: 'THK' },
  ],
  rug: [
    { value: 'bath',          labelTh: 'เช็ดเท้า',          labelEn: 'Bath',         codeShort: 'BTH' },
    { value: 'caterpillar',   labelTh: 'ตัวหนอน',         labelEn: 'Caterpillar',  codeShort: 'CTP' },
    { value: 'general',       labelTh: 'ทั่วไป',           labelEn: 'General',      codeShort: 'GEN' },
  ],
  uniform_top: [
    { value: 'shirt',         labelTh: 'เชิ้ต',             labelEn: 'Shirt',        codeShort: 'SHR' },
    { value: 'polo',          labelTh: 'โปโล',            labelEn: 'Polo',         codeShort: 'PLO' },
    { value: 't_shirt',       labelTh: 'ยืด',              labelEn: 'T-Shirt',      codeShort: 'TSH' },
    { value: 'scrub',         labelTh: 'สครับ',           labelEn: 'Scrub',        codeShort: 'SCR' },
    { value: 'medical',       labelTh: 'พยาบาล/แพทย์',    labelEn: 'Medical',      codeShort: 'MED' },
    { value: 'chef',          labelTh: 'กุ๊ก',              labelEn: 'Chef',         codeShort: 'CHF' },
    { value: 'jacket',        labelTh: 'แจ็คเก็ต',          labelEn: 'Jacket',       codeShort: 'JKT' },
    { value: 'suit',          labelTh: 'สูท',              labelEn: 'Suit',         codeShort: 'SUT' },
    { value: 'vest',          labelTh: 'กั๊ก',              labelEn: 'Vest',         codeShort: 'VST' },
    { value: 'sleeveless',    labelTh: 'กล้าม',            labelEn: 'Sleeveless',   codeShort: 'SLV' },
    { value: 'long_sleeve',   labelTh: 'แขนยาว',          labelEn: 'Long Sleeve',  codeShort: 'LNG' },
    { value: 'short_sleeve',  labelTh: 'แขนสั้น',          labelEn: 'Short Sleeve', codeShort: 'SHT' },
    { value: 'gown',          labelTh: 'กาวน์',           labelEn: 'Gown',         codeShort: 'GWN' },
    { value: 'massage',       labelTh: 'นวด',             labelEn: 'Massage',      codeShort: 'MSG' },
    { value: 'spa_onsen',     labelTh: 'ออนเซ็น',         labelEn: 'Onsen',        codeShort: 'ONS' },
  ],
  uniform_bottom: [
    { value: 'trousers',      labelTh: 'ขายาว',           labelEn: 'Trousers',     codeShort: 'TRS' },
    { value: 'shorts',        labelTh: 'ขาสั้น',           labelEn: 'Shorts',       codeShort: 'SHT' },
    { value: 'massage',       labelTh: 'นวด',             labelEn: 'Massage',      codeShort: 'MSG' },
    { value: 'medical',       labelTh: 'พยาบาล/แพทย์',    labelEn: 'Medical',      codeShort: 'MED' },
    { value: 'underwear',     labelTh: 'ชั้นใน',           labelEn: 'Underwear',    codeShort: 'UND' },
    { value: 'skirt',         labelTh: 'กระโปรง',         labelEn: 'Skirt',        codeShort: 'SKR' },
    { value: 'skirt_long',    labelTh: 'กระโปรงยาว',     labelEn: 'Long Skirt',   codeShort: 'SKL' },
    { value: 'skirt_short',   labelTh: 'กระโปรงสั้น',     labelEn: 'Short Skirt',  codeShort: 'SKS' },
  ],
  uniform_dress: [
    { value: 'dress',         labelTh: 'เดรส',             labelEn: 'Dress',        codeShort: 'DRS' },
    { value: 'scrub_set',     labelTh: 'ชุดสครับ',        labelEn: 'Scrub Set',    codeShort: 'SCR' },
    { value: 'suit_set',      labelTh: 'ชุดสูท (2ชิ้น)',     labelEn: 'Suit Set',     codeShort: 'STS' },
    { value: 'sleep_set',     labelTh: 'ชุดนอน',          labelEn: 'Sleep Set',    codeShort: 'SLP' },
    { value: 'pt_set',        labelTh: 'ชุดกายภาพ',       labelEn: 'PT Set',       codeShort: 'PTS' },
    { value: 'thai_massage',  labelTh: 'นวดไทย',         labelEn: 'Thai Massage', codeShort: 'TMS' },
  ],
  spa_cover: [
    { value: 'bed',           labelTh: 'เตียง',            labelEn: 'Bed',          codeShort: 'BED' },
    { value: 'pillow',        labelTh: 'หมอน',            labelEn: 'Pillow',       codeShort: 'PIL' },
    { value: 'face_hole',     labelTh: 'รูเตียงหน้า',        labelEn: 'Face Hole',    codeShort: 'FHL' },
  ],
  table_cover: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'lace',          labelTh: 'ลูกไม้',            labelEn: 'Lace',         codeShort: 'LAC' },
    { value: 'pleated',       labelTh: 'จีบ',              labelEn: 'Pleated',      codeShort: 'PLT' },
    { value: 'fitted',        labelTh: 'ตรึง',              labelEn: 'Fitted',       codeShort: 'FIT' },
  ],
  bed_skirt: [
    { value: 'small',         labelTh: 'เล็ก',             labelEn: 'Small',        codeShort: 'S' },
    { value: 'large',         labelTh: 'ใหญ่',             labelEn: 'Large',        codeShort: 'L' },
  ],
  // 255: Generic apparel (ไม่ใช่เครื่องแบบพนักงาน)
  shirt: [
    { value: 'standard',      labelTh: 'มาตรฐาน',         labelEn: 'Standard',     codeShort: 'STD' },
    { value: 'short_sleeve',  labelTh: 'แขนสั้น',          labelEn: 'Short Sleeve', codeShort: 'SHT' },
    { value: 'long_sleeve',   labelTh: 'แขนยาว',          labelEn: 'Long Sleeve',  codeShort: 'LNG' },
    { value: 'inner',         labelTh: 'ตัวใน/ชั้นใน',       labelEn: 'Inner',        codeShort: 'INN' },
  ],
  pants: [
    { value: 'long',          labelTh: 'ขายาว',           labelEn: 'Long',         codeShort: 'LNG' },
    { value: 'short',         labelTh: 'ขาสั้น',           labelEn: 'Short',        codeShort: 'SHT' },
    { value: 'medium',        labelTh: 'กลาง',            labelEn: 'Medium',       codeShort: 'MED' },
    { value: 'outer',         labelTh: 'นอก',              labelEn: 'Outer',        codeShort: 'OUT' },
    { value: 'inner',         labelTh: 'ตัวใน/ชั้นใน',       labelEn: 'Inner',        codeShort: 'INN' },
  ],
  // 255: Specialty / utility
  cleaning_cloth: [
    { value: 'rag',           labelTh: 'ขี้ริ้ว',            labelEn: 'Rag',          codeShort: 'RAG' },
    { value: 'mop',           labelTh: 'ถูพื้น',            labelEn: 'Mop',          codeShort: 'MOP' },
    { value: 'dishcloth',     labelTh: 'เช็ดจาน',          labelEn: 'Dishcloth',    codeShort: 'DSH' },
  ],
  bag: [
    { value: 'cloth_bag',     labelTh: 'ผ้าถุง',            labelEn: 'Cloth Bag',    codeShort: 'CB' },
    { value: 'tote',          labelTh: 'ถุงผ้า',            labelEn: 'Tote',         codeShort: 'TOT' },
    { value: 'saline_cover',  labelTh: 'คลุมน้ำเกลือ',      labelEn: 'Saline Cover', codeShort: 'SAL' },
  ],
  fabric_roll: [
    { value: 'by_meter',      labelTh: 'โดยเมตร',         labelEn: 'By Meter',     codeShort: 'MTR' },
    { value: 'by_yard',       labelTh: 'โดยหลา',          labelEn: 'By Yard',      codeShort: 'YRD' },
    { value: 'by_kg',         labelTh: 'โดยกิโลกรัม',      labelEn: 'By Kg',        codeShort: 'KG' },
  ],
  salon_cloth: [
    { value: 'nail',          labelTh: 'ทำเล็บ',           labelEn: 'Nail',         codeShort: 'NL' },
    { value: 'short_band',    labelTh: 'คาดสั้น',         labelEn: 'Short Band',   codeShort: 'SB' },
    { value: 'hair_cover',    labelTh: 'คลุมซอย/ผม',     labelEn: 'Hair Cover',   codeShort: 'HC' },
    { value: 'medium',        labelTh: 'ซาลอนกลาง M',  labelEn: 'Salon M',      codeShort: 'M' },
  ],
}

// ────────────────────────────────────────────────────────────────
// SIZE — preset sizes per type family
// 247: ขยายตาม catalog จริง — เพิ่ม 3'/7' + towel WxH presets + uniform sizes
// ────────────────────────────────────────────────────────────────
export const BED_SIZE_PRESETS: FacetOption[] = [
  { value: 'mini',       labelTh: '3 ฟุต',              labelEn: '3ft (mini)',         codeShort: '3FT' },
  { value: 'single',     labelTh: '3.5 ฟุต (เล็ก)',       labelEn: 'Single (3.5ft)',     codeShort: '35FT' },
  { value: 'queen',      labelTh: '5 ฟุต (ใหญ่)',         labelEn: 'Queen (5ft)',        codeShort: '5FT' },
  { value: 'king',       labelTh: '6 ฟุต (ใหญ่)',         labelEn: 'King (6ft)',         codeShort: '6FT' },
  { value: 'super_king', labelTh: '7 ฟุต (พิเศษ)',        labelEn: 'Super King (7ft)',   codeShort: '7FT' },
]

export const PILLOW_SIZE_PRESETS: FacetOption[] = [
  { value: 'standard',  labelTh: 'มาตรฐาน',  labelEn: 'Standard',  codeShort: 'STD' },
  { value: 'king',      labelTh: 'King',     labelEn: 'King',      codeShort: 'K'   },
  { value: 'euro',      labelTh: 'Euro',     labelEn: 'Euro',      codeShort: 'EU'  },
  { value: 'boudoir',   labelTh: 'Boudoir',  labelEn: 'Boudoir',   codeShort: 'BD'  },
]

/** 247 — Towel WxH presets (inches) ตาม catalog จริง */
export const TOWEL_SIZE_PRESETS: FacetOption[] = [
  { value: '12x12',  labelTh: '12" x 12"',  labelEn: '12x12',  codeShort: '1212' },
  { value: '15x30',  labelTh: '15" x 30"',  labelEn: '15x30',  codeShort: '1530' },
  { value: '27x54',  labelTh: '27" x 54"',  labelEn: '27x54',  codeShort: '2754' },
  { value: '30x60',  labelTh: '30" x 60"',  labelEn: '30x60',  codeShort: '3060' },
  { value: '35x70',  labelTh: '35" x 70"',  labelEn: '35x70',  codeShort: '3570' },
  { value: '40x60',  labelTh: '40" x 60"',  labelEn: '40x60',  codeShort: '4060' },
  { value: '40x70',  labelTh: '40" x 70"',  labelEn: '40x70',  codeShort: '4070' },
  { value: '40x80',  labelTh: '40" x 80"',  labelEn: '40x80',  codeShort: '4080' },
  { value: '40x90',  labelTh: '40" x 90"',  labelEn: '40x90',  codeShort: '4090' },
  { value: '45x90',  labelTh: '45" x 90"',  labelEn: '45x90',  codeShort: '4590' },
  { value: '60x80',  labelTh: '60" x 80"',  labelEn: '60x80',  codeShort: '6080' },
  { value: '60x100', labelTh: '60" x 100"', labelEn: '60x100', codeShort: '60100' },
  { value: '90x180', labelTh: '90" x 180"', labelEn: '90x180', codeShort: '90180' },
]

/** 247 — Uniform sizes (S/M/L/XL/2XL/3XL) สำหรับเสื้อ-กางเกง-ชุด */
export const UNIFORM_SIZE_PRESETS: FacetOption[] = [
  { value: 'XS',  labelTh: 'XS',  labelEn: 'XS',  codeShort: 'XS'  },
  { value: 'S',   labelTh: 'S',   labelEn: 'S',   codeShort: 'S'   },
  { value: 'M',   labelTh: 'M',   labelEn: 'M',   codeShort: 'M'   },
  { value: 'L',   labelTh: 'L',   labelEn: 'L',   codeShort: 'L'   },
  { value: 'XL',  labelTh: 'XL',  labelEn: 'XL',  codeShort: 'XL'  },
  { value: '2XL', labelTh: '2XL', labelEn: '2XL', codeShort: '2XL' },
  { value: '3XL', labelTh: '3XL', labelEn: '3XL', codeShort: '3XL' },
]

export const GENERIC_SIZE_PRESETS: FacetOption[] = [
  { value: 'small',     labelTh: 'เล็ก',     labelEn: 'Small',  codeShort: 'S' },
  { value: 'medium',    labelTh: 'กลาง',    labelEn: 'Medium', codeShort: 'M' },
  { value: 'large',     labelTh: 'ใหญ่',    labelEn: 'Large',  codeShort: 'L' },
  { value: 'extra',     labelTh: 'พิเศษ',    labelEn: 'Extra',  codeShort: 'XL' },
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
// PATTERN — 247: เพิ่ม ลายไทย / ลายริ้ว ตาม catalog
// ────────────────────────────────────────────────────────────────
export const PATTERN_OPTIONS: FacetOption[] = [
  { value: 'plain',      labelTh: 'พื้น',          labelEn: 'Plain',       codeShort: 'PLN' },
  { value: 'stripe',     labelTh: 'ลายทาง',       labelEn: 'Stripe',      codeShort: 'STP' },
  { value: 'striped',    labelTh: 'ลายริ้ว',       labelEn: 'Striped',     codeShort: 'STR' },
  { value: 'check',      labelTh: 'ลายตาราง',     labelEn: 'Check',       codeShort: 'CHK' },
  { value: 'floral',     labelTh: 'ลายดอก',       labelEn: 'Floral',      codeShort: 'FLR' },
  { value: 'thai_motif', labelTh: 'ลายไทย',       labelEn: 'Thai Motif',  codeShort: 'THM' },
  { value: 'logo',       labelTh: 'โลโก้',         labelEn: 'Logo',        codeShort: 'LGO' },
  { value: 'print',      labelTh: 'พิมพ์ลาย',      labelEn: 'Print',       codeShort: 'PRN' },
]

// ────────────────────────────────────────────────────────────────
// TREATMENT — 247: special handling (น้ำมัน / อบแห้ง / ถอดซักปลอก)
// catalog ใช้บ่อย "(น้ำมัน)" สำหรับสปา
// ────────────────────────────────────────────────────────────────
export const TREATMENT_OPTIONS: FacetOption[] = [
  { value: 'none',             labelTh: 'ไม่มี',           labelEn: 'None',             codeShort: ''    },
  { value: 'oil_resistant',    labelTh: 'น้ำมัน',          labelEn: 'Oil-Resistant',    codeShort: 'OIL' },
  { value: 'dry_clean',        labelTh: 'อบแห้ง',         labelEn: 'Dry Clean',        codeShort: 'DRY' },
  { value: 'removable_cover',  labelTh: 'ถอดซักปลอก',   labelEn: 'Removable Cover',  codeShort: 'RMC' },
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
    treatment: TREATMENT_OPTIONS,
    size_bed: BED_SIZE_PRESETS,
    size_pillow: PILLOW_SIZE_PRESETS,
    size_towel: TOWEL_SIZE_PRESETS,
    size_uniform: UNIFORM_SIZE_PRESETS,
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

/**
 * ดึง size presets ตาม type
 * 247: รองรับ towel WxH + uniform S/M/L + bed ฟุต + pillow standard/king/euro
 */
export function getSizePresetsForType(type: string): FacetOption[] {
  // Towel family — WxH inches
  if (type === 'towel' || type === 'foot_massage_towel' || type === 'pool_towel' || type === 'bath_mat' || type === 'napkin' || type === 'placemat') {
    return TOWEL_SIZE_PRESETS
  }
  // Bed-size family (ฟุต)
  if (type === 'bed_sheet' || type === 'massage_bed_sheet' || type === 'duvet_cover' || type === 'duvet_insert' || type === 'mattress_pad' || type === 'topper' || type === 'top_sheet' || type === 'bed_cover' || type === 'blanket' || type === 'spa_cover') {
    return BED_SIZE_PRESETS
  }
  // Pillow case
  if (type === 'pillow_case' || type === 'pillow') {
    return PILLOW_SIZE_PRESETS
  }
  // Uniforms + generic apparel — S/M/L/XL/2XL/3XL · 255: + shirt/pants
  if (type === 'uniform_top' || type === 'uniform_bottom' || type === 'uniform_dress' || type === 'apron' || type === 'spa_uniform' || type === 'staff_uniform' || type === 'bathrobe' || type === 'shirt' || type === 'pants') {
    return UNIFORM_SIZE_PRESETS
  }
  return GENERIC_SIZE_PRESETS
}
