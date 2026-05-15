/**
 * 268 — Trust Customer candidate detection
 *
 * Heuristic: หาลูกค้าที่ pattern คล้าย trust_customer
 *   - col5 (โรงซักนับเข้า) ส่วนใหญ่ว่าง (factory ไม่นับเข้าจริง)
 *   - หรือ col5 = col2+col3 ทุก row (ไม่มี discrepancy = อาจ copy ตรงๆ ไม่ได้นับจริง)
 *
 * Score ≥ 0.5 → candidate (ควรพิจารณา set workflowMode = trust_customer)
 */
import type { LinenForm } from '@/types'

export interface TrustCandidateScore {
  customerId: string
  totalLFs: number
  emptyCol5Pct: number   // % LFs ที่ col5 = 0 ทุก row
  matchCol5Pct: number   // % LFs ที่ col5 = col2+col3 ทุก row (suspect copy)
  score: number          // 0..1+ → ≥0.5 = candidate
}

const ELIGIBLE_STATUSES = ['washing', 'packed', 'delivered', 'confirmed'] as const

export function scoreTrustCandidate(
  customerId: string,
  linenForms: LinenForm[],
): TrustCandidateScore | null {
  const customerLFs = linenForms.filter(lf =>
    lf.customerId === customerId &&
    (ELIGIBLE_STATUSES as readonly string[]).includes(lf.status),
  )
  if (customerLFs.length < 5) return null // ต้องมี ≥5 LFs ถึงจะ confidence

  let emptyCol5Count = 0
  let matchCol5Count = 0
  let assessedLFs = 0

  for (const lf of customerLFs) {
    const rows = lf.rows.filter(r => (r.col2_hotelCountIn + r.col3_hotelClaimCount) > 0)
    if (rows.length === 0) continue
    assessedLFs++

    const allEmpty = rows.every(r => (r.col5_factoryClaimApproved || 0) === 0)
    if (allEmpty) {
      emptyCol5Count++
      continue
    }

    const allMatch = rows.every(r =>
      r.col5_factoryClaimApproved === r.col2_hotelCountIn + r.col3_hotelClaimCount,
    )
    if (allMatch) matchCol5Count++
  }

  if (assessedLFs < 3) return null

  const emptyCol5Pct = emptyCol5Count / assessedLFs
  const matchCol5Pct = matchCol5Count / assessedLFs
  // empty col5 = strong signal (factory ไม่ได้นับเลย)
  // match col5 = weaker signal (อาจ copy paste แต่อาจจริงจัง)
  const score = emptyCol5Pct + matchCol5Pct * 0.5

  if (score < 0.5) return null

  return { customerId, totalLFs: assessedLFs, emptyCol5Pct, matchCol5Pct, score }
}

export function listTrustCandidates(
  customerIds: string[],
  linenForms: LinenForm[],
): TrustCandidateScore[] {
  return customerIds
    .map(id => scoreTrustCandidate(id, linenForms))
    .filter((s): s is TrustCandidateScore => s !== null)
    .sort((a, b) => b.score - a.score)
}
