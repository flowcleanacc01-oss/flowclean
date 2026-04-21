'use client'

import type { Customer, DeliveryNote, LinenItemDef, CompanyInfo } from '@/types'

interface Props {
  customer: Customer
  month: string // YYYY-MM
  deliveryNotes: DeliveryNote[]
  catalog: LinenItemDef[]
  company: CompanyInfo
  priceMap?: Record<string, number>
}

const thS: React.CSSProperties = {
  textAlign: 'center', padding: '2px 1px', fontSize: '7pt', fontWeight: 'bold',
  border: '0.5px solid #aaa', backgroundColor: '#e8e8e8', whiteSpace: 'nowrap',
}
const tdC: React.CSSProperties = {
  textAlign: 'center', padding: '1px', fontSize: '7pt', border: '0.5px solid #ccc',
}
const tdR: React.CSSProperties = {
  textAlign: 'right', padding: '1px 2px', fontSize: '7pt', border: '0.5px solid #ccc',
}
const tdL: React.CSSProperties = {
  textAlign: 'left', padding: '1px 2px', fontSize: '7pt', border: '0.5px solid #ccc',
}

export default function MonthlyConsolidationPrint({ customer, month, deliveryNotes, catalog, priceMap: priceMapProp }: Props) {
  // Filter + sort delivery notes for this customer + month
  const notes = deliveryNotes
    .filter(dn => dn.customerId === customer.id && dn.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  // Collect item codes used this month + items in priceMap
  const usedCodes = new Set<string>()
  for (const dn of notes) {
    for (const item of dn.items) {
      if (!item.isClaim) usedCodes.add(item.code)
    }
  }
  const resolvedPriceMap = priceMapProp ?? Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  for (const code of Object.keys(resolvedPriceMap)) usedCodes.add(code)

  // Items sorted by catalog sortOrder
  const items = catalog
    .filter(i => usedCodes.has(i.code))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const [year, mon] = month.split('-').map(Number)
  const thaiMonth = new Date(year, mon - 1).toLocaleString('th-TH', { month: 'long' })
  const thaiYear = year + 543

  // Price lookup
  const getPrice = (code: string): number =>
    resolvedPriceMap[code] ?? catalog.find(i => i.code === code)?.defaultPrice ?? 0

  // Build matrix: code → dnId → qty (non-claim items only)
  const matrix: Record<string, Record<string, number>> = {}
  for (const item of items) matrix[item.code] = {}
  for (const dn of notes) {
    for (const di of dn.items) {
      if (di.isClaim) continue
      if (matrix[di.code] !== undefined) {
        matrix[di.code][dn.id] = (matrix[di.code][dn.id] || 0) + di.quantity
      }
    }
  }

  // Fee/adjustment presence
  const hasTransportTrip = notes.some(dn => (dn.transportFeeTrip || 0) > 0)
  const hasTransportMonth = notes.some(dn => (dn.transportFeeMonth || 0) > 0)
  const hasExtraCharge = notes.some(dn => (dn.extraCharge || 0) > 0)
  const hasDiscount = notes.some(dn => (dn.discount || 0) > 0)

  // Row totals (across all SDs)
  const rowQty: Record<string, number> = {}
  const rowAmt: Record<string, number> = {}
  for (const item of items) {
    const qty = notes.reduce((s, dn) => s + (matrix[item.code][dn.id] || 0), 0)
    rowQty[item.code] = qty
    rowAmt[item.code] = qty * getPrice(item.code)
  }

  // Total amount per SD (items × price + transport fees + adjustments)
  const dnTotals: Record<string, number> = {}
  for (const dn of notes) {
    let total = 0
    for (const item of items) {
      total += (matrix[item.code][dn.id] || 0) * getPrice(item.code)
    }
    total += dn.transportFeeTrip || 0
    total += dn.transportFeeMonth || 0
    total += dn.extraCharge || 0
    total -= dn.discount || 0
    dnTotals[dn.id] = total
  }

  // Totals by category
  const totalTransportTrip = notes.reduce((s, dn) => s + (dn.transportFeeTrip || 0), 0)
  const totalTransportMonth = notes.reduce((s, dn) => s + (dn.transportFeeMonth || 0), 0)
  const totalExtraCharge = notes.reduce((s, dn) => s + (dn.extraCharge || 0), 0)
  const totalDiscount = notes.reduce((s, dn) => s + (dn.discount || 0), 0)

  // Financial totals
  const itemSubtotal = Object.values(rowAmt).reduce((s, v) => s + v, 0)
  const subtotal = itemSubtotal + totalTransportTrip + totalTransportMonth + totalExtraCharge - totalDiscount
  const vat = customer.enableVat ? Math.round(subtotal * 0.07 * 100) / 100 : 0
  const totalWithVat = subtotal + vat
  const wht = customer.enableWithholding ? Math.round(subtotal * 0.03 * 100) / 100 : 0
  const netAmount = totalWithVat - wht

  const fmtN = (n: number) => (n === 0 ? '' : n.toLocaleString('en-US'))
  const fmtM = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // 123: Split SDs into pages — max 16 per page, distribute evenly (smaller pages first)
  // e.g. N=30 → 15+15, N=31 → 15+16, N=47 → 15+16+16
  const MAX_PER_PAGE = 16
  const totalSds = notes.length
  const numPages = totalSds === 0 ? 1 : Math.ceil(totalSds / MAX_PER_PAGE)
  const baseCount = Math.floor(totalSds / numPages)
  const extraPages = totalSds % numPages  // number of pages that get baseCount+1
  const chunks: DeliveryNote[][] = []
  let cursor = 0
  for (let i = 0; i < numPages; i++) {
    // Last `extraPages` pages get +1 (so the smaller page comes first — matches "15+16+16")
    const size = i >= numPages - extraPages ? baseCount + 1 : baseCount
    chunks.push(notes.slice(cursor, cursor + size))
    cursor += size
  }
  if (chunks.length === 0) chunks.push([])  // guard zero-SD case

  return (
    <div
      id="print-consolidation"
      style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif" }}
    >
      {chunks.map((chunk, pageIdx) => {
        const isLastPage = pageIdx === chunks.length - 1
        const pageColW = Math.max(12, Math.floor(110 / Math.max(chunk.length, 1)))
        return (
          <div
            key={pageIdx}
            style={{
              padding: '6mm 5mm',
              minWidth: '270mm',
              pageBreakAfter: isLastPage ? 'auto' : 'always',
              breakAfter: isLastPage ? 'auto' : 'page',
            }}
          >
            {/* Title — repeat on each page */}
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', marginBottom: '6px', letterSpacing: '2px' }}>
              {customer.shortName || customer.name}
            </div>
            <div style={{ textAlign: 'center', fontSize: '8pt', marginBottom: '8px', color: '#444' }}>
              ประจำเดือน {thaiMonth} {thaiYear}
              {chunks.length > 1 && (
                <span style={{ marginLeft: '8px', color: '#888' }}>(หน้า {pageIdx + 1}/{chunks.length})</span>
              )}
            </div>

            {/* Main table — columns: one per SD in this chunk */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '18px' }} />   {/* No */}
                <col style={{ width: '76px' }} />   {/* รายการ */}
                <col style={{ width: '18px' }} />   {/* ราคา */}
                <col style={{ width: '28px' }} />   {/* จำนวน */}
                <col style={{ width: '38px' }} />   {/* เป็นเงิน */}
                {chunk.map(dn => <col key={dn.id} style={{ width: `${pageColW}px` }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={thS}>No</th>
                  <th style={{ ...thS, textAlign: 'left' }}>รายการ</th>
                  <th style={thS}>ราคา</th>
                  <th style={thS}>จำนวน</th>
                  <th style={thS}>เป็นเงิน</th>
                  {chunk.map(dn => (
                    <th key={dn.id} style={{ ...thS, fontSize: '6pt', lineHeight: '1.3' }}>
                      <div>{parseInt(dn.date.split('-')[2])}</div>
                      <div style={{ fontSize: '5pt', color: '#888', fontWeight: 'normal' }}>{dn.noteNumber}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Item rows — รวม/เป็นเงิน คอลัม แสดงยอดทั้งเดือน (context เต็มทุกหน้า) */}
                {items.map((item, idx) => (
                  <tr key={item.code}>
                    <td style={tdC}>{idx + 1}</td>
                    <td style={tdL}>{item.name}</td>
                    <td style={tdC}>{getPrice(item.code) || ''}</td>
                    <td style={tdR}>{fmtN(rowQty[item.code])}</td>
                    <td style={tdR}>{rowAmt[item.code] ? fmtM(rowAmt[item.code]) : ''}</td>
                    {chunk.map(dn => (
                      <td key={dn.id} style={{ ...tdC, fontSize: '6pt' }}>
                        {matrix[item.code][dn.id] ? matrix[item.code][dn.id] : ''}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* ค่ารถ (ครั้ง) row */}
                {hasTransportTrip && (
                  <tr>
                    <td style={tdC}></td>
                    <td style={tdL}>ค่ารถ (ครั้ง)</td>
                    <td style={tdC}></td>
                    <td style={tdR}></td>
                    <td style={tdR}>{totalTransportTrip ? fmtM(totalTransportTrip) : ''}</td>
                    {chunk.map(dn => (
                      <td key={dn.id} style={{ ...tdR, fontSize: '6pt' }}>
                        {(dn.transportFeeTrip || 0) > 0 ? fmtM(dn.transportFeeTrip) : ''}
                      </td>
                    ))}
                  </tr>
                )}

                {/* ค่ารถ (เดือน) row */}
                {hasTransportMonth && (
                  <tr>
                    <td style={tdC}></td>
                    <td style={tdL}>ค่ารถ (เดือน)</td>
                    <td style={tdC}></td>
                    <td style={tdR}></td>
                    <td style={tdR}>{totalTransportMonth ? fmtM(totalTransportMonth) : ''}</td>
                    {chunk.map(dn => (
                      <td key={dn.id} style={{ ...tdR, fontSize: '6pt' }}>
                        {(dn.transportFeeMonth || 0) > 0 ? fmtM(dn.transportFeeMonth) : ''}
                      </td>
                    ))}
                  </tr>
                )}

                {/* ค่าใช้จ่ายเพิ่มเติม row */}
                {hasExtraCharge && (
                  <tr>
                    <td style={tdC}></td>
                    <td style={tdL}>ค่าใช้จ่ายเพิ่มเติม</td>
                    <td style={tdC}></td>
                    <td style={tdR}></td>
                    <td style={tdR}>{totalExtraCharge ? fmtM(totalExtraCharge) : ''}</td>
                    {chunk.map(dn => (
                      <td key={dn.id} style={{ ...tdR, fontSize: '6pt' }}>
                        {(dn.extraCharge || 0) > 0 ? fmtM(dn.extraCharge!) : ''}
                      </td>
                    ))}
                  </tr>
                )}

                {/* ส่วนลด row */}
                {hasDiscount && (
                  <tr>
                    <td style={tdC}></td>
                    <td style={tdL}>ส่วนลด</td>
                    <td style={tdC}></td>
                    <td style={tdR}></td>
                    <td style={tdR}>{totalDiscount ? `-${fmtM(totalDiscount)}` : ''}</td>
                    {chunk.map(dn => (
                      <td key={dn.id} style={{ ...tdR, fontSize: '6pt' }}>
                        {(dn.discount || 0) > 0 ? `-${fmtM(dn.discount!)}` : ''}
                      </td>
                    ))}
                  </tr>
                )}

                {/* Footer: ยอดรวมทั้งหมด — left "เป็นเงิน" = subtotal เต็มเดือน, per-SD col = dnTotals */}
                <tr style={{ borderTop: '1.5px solid #666' }}>
                  <td colSpan={2} style={{ ...tdL, fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                    ยอดรวมทั้งหมด
                  </td>
                  <td style={{ ...tdC, backgroundColor: '#f0f0f0' }}></td>
                  <td style={{ ...tdR, fontWeight: 'bold', backgroundColor: '#f0f0f0' }}></td>
                  <td style={{ ...tdR, fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>{fmtM(subtotal)}</td>
                  {chunk.map(dn => (
                    <td key={dn.id} style={{ ...tdR, fontWeight: 'bold', fontSize: '6pt', backgroundColor: '#f0f0f0' }}>
                      {fmtM(dnTotals[dn.id] ?? 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* Summary block — show only on LAST page */}
            {isLastPage && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '7pt', color: '#777', minWidth: '120px' }}>
                  รวมหักค่าผ้าทั้งหมด
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: '8pt', minWidth: '200px' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '2px 8px 2px 4px', textAlign: 'right', minWidth: '140px' }}>ยอดคงเหลือ</td>
                      <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: 'bold', minWidth: '70px', borderBottom: '0.5px solid #ccc' }}>{fmtM(subtotal)}</td>
                    </tr>
                    {customer.enableVat && (
                      <tr>
                        <td style={{ padding: '2px 8px 2px 4px', textAlign: 'right' }}>ภาษีมูลค่าเพิ่ม 7% (VAT)</td>
                        <td style={{ padding: '2px 4px', textAlign: 'right', borderBottom: '0.5px solid #ccc' }}>{fmtM(vat)}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '2px 8px 2px 4px', textAlign: 'right' }}>ราคารวม VAT 7%</td>
                      <td style={{ padding: '2px 4px', textAlign: 'right', borderBottom: '0.5px solid #ccc' }}>{fmtM(totalWithVat)}</td>
                    </tr>
                    {customer.enableWithholding && (
                      <tr>
                        <td style={{ padding: '2px 8px 2px 4px', textAlign: 'right' }}>ภาษีหัก ณ ที่จ่าย 3%</td>
                        <td style={{ padding: '2px 4px', textAlign: 'right', borderBottom: '0.5px solid #ccc' }}>{fmtM(wht)}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '3px 8px 2px 4px', textAlign: 'right', fontWeight: 'bold' }}>จำนวนสุทธิ</td>
                      <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 'bold', borderTop: '1px solid #888' }}>{fmtM(netAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
