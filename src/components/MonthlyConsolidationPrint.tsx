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
  // 226.B: ใช้ priceMap จาก caller (QT) — ไม่ fallback ไป customer.priceList อีกแล้ว
  const resolvedPriceMap = priceMapProp ?? {}
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

  // Build matrices: code → dnId → qty
  // 312: แยก gross (ผ้าส่งคืนจริง = isClaim=false) จาก claim (ส่วนลดบัญชี = isClaim=true)
  //   - main rows แสดง gross → ลูกค้า track ผ้าส่งจริงได้
  //   - claim section แยกใต้ item rows → "ส่วนลดทางบัญชี" clean
  //   - dnTotals ยังคำนวณ net (gross - claim) = ยอดที่ลูกค้าจ่าย
  const grossMatrix: Record<string, Record<string, number>> = {}
  const claimMatrix: Record<string, Record<string, number>> = {}
  for (const item of items) {
    grossMatrix[item.code] = {}
    claimMatrix[item.code] = {}
  }
  for (const dn of notes) {
    for (const di of dn.items) {
      if (grossMatrix[di.code] === undefined) continue
      if (di.isClaim) {
        claimMatrix[di.code][dn.id] = (claimMatrix[di.code][dn.id] || 0) + di.quantity
      } else {
        grossMatrix[di.code][dn.id] = (grossMatrix[di.code][dn.id] || 0) + di.quantity
      }
    }
  }

  // Fee/adjustment presence
  const hasTransportTrip = notes.some(dn => (dn.transportFeeTrip || 0) > 0)
  const hasTransportMonth = notes.some(dn => (dn.transportFeeMonth || 0) > 0)
  const hasExtraCharge = notes.some(dn => (dn.extraCharge || 0) > 0)
  const hasDiscount = notes.some(dn => (dn.discount || 0) > 0)

  // Row totals — gross (pack) + claim (discount)
  const rowQty: Record<string, number> = {}        // gross qty per item
  const rowAmt: Record<string, number> = {}        // gross amount per item
  const claimRowQty: Record<string, number> = {}   // claim qty per item
  const claimRowAmt: Record<string, number> = {}   // claim amount per item (positive — display as -)
  for (const item of items) {
    const grossQ = notes.reduce((s, dn) => s + (grossMatrix[item.code][dn.id] || 0), 0)
    const claimQ = notes.reduce((s, dn) => s + (claimMatrix[item.code][dn.id] || 0), 0)
    const price = getPrice(item.code)
    rowQty[item.code] = grossQ
    rowAmt[item.code] = grossQ * price
    claimRowQty[item.code] = claimQ
    claimRowAmt[item.code] = claimQ * price
  }
  // Items ที่มี claim — แสดงใน section แยก
  const claimItems = items.filter(i => claimRowQty[i.code] > 0)

  // Total amount per SD — net (gross - claim) × price + fees
  const dnTotals: Record<string, number> = {}
  for (const dn of notes) {
    let total = 0
    for (const item of items) {
      const price = getPrice(item.code)
      total += (grossMatrix[item.code][dn.id] || 0) * price
      total -= (claimMatrix[item.code][dn.id] || 0) * price
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

  // Financial totals — 312: claim ลบจาก gross ก่อนคำนวณ subtotal (ตรงกับ dnTotals + WB/IV)
  const itemSubtotalGross = Object.values(rowAmt).reduce((s, v) => s + v, 0)
  const totalClaimAmt = Object.values(claimRowAmt).reduce((s, v) => s + v, 0)
  const itemSubtotal = itemSubtotalGross - totalClaimAmt
  const subtotal = itemSubtotal + totalTransportTrip + totalTransportMonth + totalExtraCharge - totalDiscount
  const vat = customer.enableVat ? Math.round(subtotal * 0.07 * 100) / 100 : 0
  const totalWithVat = subtotal + vat
  const wht = customer.enableWithholding ? Math.round(subtotal * 0.03 * 100) / 100 : 0
  const netAmount = totalWithVat - wht

  const fmtN = (n: number) => (n === 0 ? '' : n.toLocaleString('en-US'))
  const fmtM = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // 296: per-SD cell style — fontSize ปรับตามชนิดข้อมูล + overflow safety
  //   ห้าม round (บัญชี) — overflow:hidden + title=<full value> เป็น safety net เท่านั้น
  // 301: tdSdInt 6pt → 7pt (เท่า ราคา) เพื่ออ่านง่าย — qty integer 1-4 หลัก fit สบาย
  //      tdSdNum keep 6pt — รับ "999,999.99" full precision (เพิ่ม font จะ overflow)
  const tdSdNum: React.CSSProperties = {
    ...tdR, fontSize: '6pt', overflow: 'hidden', whiteSpace: 'nowrap',
  }
  const tdSdInt: React.CSSProperties = {
    ...tdC, fontSize: '7pt', overflow: 'hidden', whiteSpace: 'nowrap',
  }

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
        // 296: col widths เป็น % ของ table — fixed cols 35% + per-SD cols 65% / N
        //   ที่ 16 SDs/page = 4.06% per col = ~11mm → รับ "999,999.99" @ 6pt full precision
        const sdColPct = 65 / Math.max(chunk.length, 1)
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
                <col style={{ width: '2%' }} />     {/* No — 301: ลด 2.5→2 ให้ที่ราคา */}
                <col style={{ width: '15%' }} />    {/* รายการ — 301: ลด 16→15 ให้ที่ราคา */}
                <col style={{ width: '5%' }} />     {/* ราคา — 301: ขยาย 3.5→5 รับ fmtM "1,500.00" */}
                <col style={{ width: '5%' }} />     {/* จำนวน */}
                <col style={{ width: '8%' }} />     {/* เป็นเงิน */}
                {chunk.map(dn => <col key={dn.id} style={{ width: `${sdColPct}%` }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={thS}>No</th>
                  <th style={{ ...thS, textAlign: 'left' }}>รายการ</th>
                  <th style={thS}>ราคา</th>
                  <th style={thS}>จำนวน</th>
                  <th style={thS}>เป็นเงิน</th>
                  {chunk.map(dn => {
                    // 290: abbreviate noteNumber to #NNN (last running number) — กัน overflow
                    //   Full format: SD-YYYYMMDD-NNN → ดึง 3 หลักท้าย
                    //   วันที่+เดือนแสดงในแถวบน → user reverse-lookup ได้
                    const runningNo = dn.noteNumber.split('-').pop() || dn.noteNumber
                    return (
                      <th key={dn.id} style={{ ...thS, fontSize: '6pt', lineHeight: '1.3' }}>
                        <div>{parseInt(dn.date.split('-')[2])}</div>
                        <div style={{ fontSize: '5pt', color: '#888', fontWeight: 'normal' }} title={dn.noteNumber}>#{runningNo}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Item rows — 312: gross qty (ผ้าส่งคืนจริง) — ไม่หักเคลม
                    ลูกค้าสามารถ track จำนวนผ้าที่ส่งกลับจริงจากแถวนี้ได้เลย */}
                {items.map((item, idx) => (
                  <tr key={item.code}>
                    <td style={tdC}>{idx + 1}</td>
                    <td style={tdL}>{item.name}</td>
                    {/* 301.1: ราคา → fmtM (.00) เป็นมาตรฐานเงินทั้งโปรแกรม */}
                    <td style={tdR}>{getPrice(item.code) > 0 ? fmtM(getPrice(item.code)) : ''}</td>
                    <td style={tdR}>{fmtN(rowQty[item.code])}</td>
                    <td style={tdR}>{rowAmt[item.code] ? fmtM(rowAmt[item.code]) : ''}</td>
                    {chunk.map(dn => {
                      const v = grossMatrix[item.code][dn.id]
                      return (
                        <td key={dn.id} style={tdSdInt}>
                          {v ? v : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* 312: ส่วนลดทางบัญชี (เคลม) — section แยกใต้ item rows ถ้ามี claim */}
                {claimItems.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={5 + chunk.length} style={{
                        ...tdL, fontSize: '7pt', fontWeight: 'bold',
                        backgroundColor: '#fef3e9', color: '#9a3412',
                        borderTop: '1px solid #fb923c', borderBottom: '0.5px solid #fb923c',
                        paddingTop: '3px', paddingBottom: '3px',
                      }}>
                        ส่วนลดทางบัญชี (เคลม) — ค่าซักที่ลดคืนกลับให้ในวันที่ส่งมาเคลม · ไม่ใช่จำนวนผ้าเคลมที่ส่งคืน
                      </td>
                    </tr>
                    {claimItems.map(item => (
                      <tr key={`claim-${item.code}`} style={{ backgroundColor: '#fff7ed' }}>
                        <td style={tdC}></td>
                        <td style={tdL}>{item.name} <span style={{ color: '#9a3412', fontSize: '6pt' }}>(เคลม)</span></td>
                        <td style={tdR}>{fmtM(getPrice(item.code))}</td>
                        <td style={{ ...tdR, color: '#9a3412' }}>{fmtN(claimRowQty[item.code])}</td>
                        <td style={{ ...tdR, color: '#9a3412' }}>
                          {claimRowAmt[item.code] ? `-${fmtM(claimRowAmt[item.code])}` : ''}
                        </td>
                        {chunk.map(dn => {
                          const v = claimMatrix[item.code][dn.id]
                          return (
                            <td key={dn.id} style={{ ...tdSdInt, color: '#9a3412' }}>
                              {v ? `-${v}` : ''}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </>
                )}

                {/* ค่ารถ (ครั้ง) row */}
                {hasTransportTrip && (
                  <tr>
                    <td style={tdC}></td>
                    <td style={tdL}>ค่ารถ (ครั้ง)</td>
                    <td style={tdC}></td>
                    <td style={tdR}></td>
                    <td style={tdR}>{totalTransportTrip ? fmtM(totalTransportTrip) : ''}</td>
                    {chunk.map(dn => {
                      const v = dn.transportFeeTrip || 0
                      return (
                        <td key={dn.id} style={tdSdNum} title={v > 0 ? fmtM(v) : ''}>
                          {v > 0 ? fmtM(v) : ''}
                        </td>
                      )
                    })}
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
                    {chunk.map(dn => {
                      const v = dn.transportFeeMonth || 0
                      return (
                        <td key={dn.id} style={tdSdNum} title={v > 0 ? fmtM(v) : ''}>
                          {v > 0 ? fmtM(v) : ''}
                        </td>
                      )
                    })}
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
                    {chunk.map(dn => {
                      const v = dn.extraCharge || 0
                      return (
                        <td key={dn.id} style={tdSdNum} title={v > 0 ? fmtM(v) : ''}>
                          {v > 0 ? fmtM(v) : ''}
                        </td>
                      )
                    })}
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
                    {chunk.map(dn => {
                      const v = dn.discount || 0
                      return (
                        <td key={dn.id} style={tdSdNum} title={v > 0 ? `-${fmtM(v)}` : ''}>
                          {v > 0 ? `-${fmtM(v)}` : ''}
                        </td>
                      )
                    })}
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
                  {chunk.map(dn => {
                    const v = dnTotals[dn.id] ?? 0
                    return (
                      <td key={dn.id} style={{ ...tdSdNum, fontWeight: 'bold', backgroundColor: '#f0f0f0' }} title={fmtM(v)}>
                        {fmtM(v)}
                      </td>
                    )
                  })}
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
