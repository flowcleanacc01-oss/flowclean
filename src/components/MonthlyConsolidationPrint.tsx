'use client'

import type { Customer, DeliveryNote, LinenItemDef, CompanyInfo } from '@/types'

interface Props {
  customer: Customer
  month: string // YYYY-MM
  deliveryNotes: DeliveryNote[]
  catalog: LinenItemDef[]
  company: CompanyInfo
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

export default function MonthlyConsolidationPrint({ customer, month, deliveryNotes, catalog }: Props) {
  // Filter delivery notes for this customer + month, sorted by date
  const notes = deliveryNotes
    .filter(dn => dn.customerId === customer.id && dn.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Collect item codes used this month + items in customer priceList
  const usedCodes = new Set<string>()
  for (const dn of notes) {
    for (const item of dn.items) usedCodes.add(item.code)
  }
  for (const p of customer.priceList) usedCodes.add(p.code)

  // Items sorted by catalog sortOrder
  const items = catalog
    .filter(i => usedCodes.has(i.code))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Days in month
  const [year, mon] = month.split('-').map(Number)
  const daysInMonth = new Date(year, mon, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const thaiMonth = new Date(year, mon - 1).toLocaleString('th-TH', { month: 'long' })
  const thaiYear = year + 543

  // Build matrix: code -> day -> qty (from delivery notes)
  const matrix: Record<string, Record<number, number>> = {}
  for (const item of items) matrix[item.code] = {}
  for (const dn of notes) {
    const day = parseInt(dn.date.split('-')[2])
    for (const di of dn.items) {
      if (matrix[di.code] !== undefined) {
        matrix[di.code][day] = (matrix[di.code][day] || 0) + di.quantity
      }
    }
  }

  // Price: customer-specific first, then catalog default
  const priceMap = Object.fromEntries(customer.priceList.map(p => [p.code, p.price]))
  const getPrice = (code: string): number =>
    priceMap[code] ?? catalog.find(i => i.code === code)?.defaultPrice ?? 0

  // Row totals & amounts
  const rowQty: Record<string, number> = {}
  const rowAmt: Record<string, number> = {}
  for (const item of items) {
    const qty = Object.values(matrix[item.code]).reduce((s, v) => s + v, 0)
    rowQty[item.code] = qty
    rowAmt[item.code] = qty * getPrice(item.code)
  }

  // Daily piece totals
  const dailyQty: Record<number, number> = {}
  for (const day of days) {
    dailyQty[day] = items.reduce((s, item) => s + (matrix[item.code][day] || 0), 0)
  }

  // Financial totals
  const subtotal = Object.values(rowAmt).reduce((s, v) => s + v, 0)
  const vat = customer.enableVat ? Math.round(subtotal * 0.07 * 100) / 100 : 0
  const totalWithVat = subtotal + vat
  const wht = customer.enableWithholding ? Math.round(subtotal * 0.03 * 100) / 100 : 0
  const netAmount = totalWithVat - wht

  const fmtN = (n: number) => (n === 0 ? '' : n.toLocaleString('en-US'))
  const fmtM = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtP = (n: number) => (n === 0 ? '' : n.toLocaleString('en-US'))

  return (
    <div
      id="print-consolidation"
      style={{ fontFamily: "'Sarabun', 'TH Sarabun New', sans-serif", padding: '6mm 5mm', minWidth: '270mm' }}
    >
      {/* Title */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', marginBottom: '6px', letterSpacing: '2px' }}>
        {customer.shortName || customer.name}
      </div>
      <div style={{ textAlign: 'center', fontSize: '8pt', marginBottom: '8px', color: '#444' }}>
        ประจำเดือน {thaiMonth} {thaiYear}
      </div>

      {/* Main table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '18px' }} />   {/* No */}
          <col style={{ width: '76px' }} />   {/* รายการ */}
          <col style={{ width: '18px' }} />   {/* ราคา */}
          <col style={{ width: '28px' }} />   {/* จำนวน */}
          <col style={{ width: '38px' }} />   {/* เป็นเงิน */}
          {days.map(d => <col key={d} style={{ width: `${Math.floor(110 / daysInMonth)}px` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={thS}>No</th>
            <th style={{ ...thS, textAlign: 'left' }}>รายการ</th>
            <th style={thS}>ราคา</th>
            <th style={thS}>จำนวน</th>
            <th style={thS}>เป็นเงิน</th>
            {days.map(d => <th key={d} style={{ ...thS, fontSize: '6pt' }}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.code}>
              <td style={tdC}>{idx + 1}</td>
              <td style={tdL}>{item.name}</td>
              <td style={tdC}>{fmtP(getPrice(item.code))}</td>
              <td style={tdR}>{fmtN(rowQty[item.code])}</td>
              <td style={tdR}>{rowAmt[item.code] ? fmtM(rowAmt[item.code]) : ''}</td>
              {days.map(d => (
                <td key={d} style={{ ...tdC, fontSize: '6pt' }}>
                  {matrix[item.code][d] ? matrix[item.code][d] : ''}
                </td>
              ))}
            </tr>
          ))}

          {/* Footer: daily totals row */}
          <tr style={{ borderTop: '1.5px solid #666' }}>
            <td colSpan={2} style={{ ...tdL, fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
              ยอด {customer.shortName || customer.name}
            </td>
            <td style={{ ...tdC, backgroundColor: '#f0f0f0' }}></td>
            <td style={{ ...tdR, fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>รวม</td>
            <td style={{ ...tdR, fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>{fmtM(subtotal)}</td>
            {days.map(d => (
              <td key={d} style={{ ...tdC, fontWeight: 'bold', fontSize: '6pt', backgroundColor: '#f0f0f0' }}>
                {dailyQty[d] ? dailyQty[d].toLocaleString('en-US') : '-'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Summary block */}
      <div style={{ marginTop: '10px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left: รวมหักค่าผ้า placeholder */}
        <div style={{ fontSize: '7pt', color: '#777', minWidth: '120px' }}>
          รวมหักค่าผ้าทั้งหมด
        </div>

        {/* Right: VAT summary box */}
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
    </div>
  )
}
