// 465.2 (B) — ความหนาแน่นงาน รอบ × วัน (Capacity Heatmap)
//   matrix จำนวนคิว (chip ที่เป็นคิวจริง) ต่อรอบ ต่อวัน + รวมต่อรอบ/ต่อวัน + max (ไว้ทำ heat scale)
//   pure (testable) · caller map LogisticsRow → RowLike (roundId + cellActive ต่อวัน)
export interface DensityRowInput {
  roundId: string          // รอบหลักของลูกค้า ('' = ไม่มีรอบ)
  cellActive: boolean[]    // ต่อวัน: เป็นคิวจริงไหม (length = dayCount)
}

export interface DensityRound {
  roundId: string
  perDay: number[]         // จำนวนคิวต่อวัน
  total: number
}

export interface DensityResult {
  rounds: DensityRound[]   // เรียงตาม roundOrder · '' (ไม่มีรอบ) ต่อท้าย
  perDayTotal: number[]    // รวมทุกรอบ ต่อวัน
  grandTotal: number
  max: number              // ค่าสูงสุดใน cell เดียว (ไว้ normalize heat color)
}

export function buildDensity(rows: DensityRowInput[], dayCount: number, roundOrder: string[]): DensityResult {
  const byRound = new Map<string, number[]>()
  for (const r of rows) {
    let arr = byRound.get(r.roundId)
    if (!arr) { arr = new Array(dayCount).fill(0); byRound.set(r.roundId, arr) }
    for (let i = 0; i < dayCount; i++) if (r.cellActive[i]) arr[i]++
  }

  // เรียง: ตาม roundOrder ก่อน → รอบที่เหลือ (เช่น '') ต่อท้าย
  const ordered = roundOrder.filter(id => byRound.has(id))
  const rest = [...byRound.keys()].filter(id => !roundOrder.includes(id))
  const ids = [...ordered, ...rest]

  const rounds: DensityRound[] = ids.map(roundId => {
    const perDay = byRound.get(roundId)!
    return { roundId, perDay, total: perDay.reduce((s, n) => s + n, 0) }
  })

  const perDayTotal = new Array(dayCount).fill(0)
  let max = 0
  for (const rr of rounds) {
    for (let i = 0; i < dayCount; i++) {
      perDayTotal[i] += rr.perDay[i]
      if (rr.perDay[i] > max) max = rr.perDay[i]
    }
  }
  return { rounds, perDayTotal, grandTotal: perDayTotal.reduce((s, n) => s + n, 0), max }
}
