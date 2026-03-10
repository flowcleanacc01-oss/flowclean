'use client'

import { useState, useEffect } from 'react'
import type { LinenFormRow, Customer, LinenItemDef } from '@/types'
import { cn, sanitizeNumber } from '@/lib/utils'

interface LinenFormGridProps {
  customer: Customer
  rows: LinenFormRow[]
  onChange: (rows: LinenFormRow[]) => void
  catalog: LinenItemDef[]
  carryOver?: Record<string, number>
  formDate?: string
  readOnly?: boolean
  editableColumns?: ('col1' | 'col2' | 'col3' | 'col4' | 'col5' | 'col6' | 'note')[]
}

const COL_LABELS = [
  { key: 'col1', label: 'ยกยอดมา', short: 'ยกมา', tip: 'ยอดค้างจากรอบก่อน: ลบ=ค้างส่ง, บวก=ส่งเกิน (คำนวณอัตโนมัติ)' },
  { key: 'col2', label: 'ลูกค้านับผ้าส่งซัก', short: 'ส่งซัก', tip: 'จำนวนผ้าที่ลูกค้า (โรงแรม) นับส่งมาซัก' },
  { key: 'col3', label: 'ลูกค้านับผ้าส่งเคลม', short: 'ส่งเคลม', tip: 'จำนวนผ้าที่ลูกค้าแจ้งเคลม (ชำรุด/เสียหาย)' },
  { key: 'col5', label: 'โรงซักนับเข้า', short: 'นับเข้า', tip: 'จำนวนผ้าที่โรงซักนับรับเข้าจริง' },
  { key: 'col6', label: 'โรงซักแพคส่ง', short: 'แพคส่ง', tip: 'จำนวนผ้าที่โรงซักแพคส่งกลับลูกค้า' },
  { key: 'calc', label: '(-) = ผ้าค้าง / (+) = คืนค้าง', short: 'ค้าง/คืน', tip: 'แพคส่ง - นับเข้า: ลบ(แดง)=ผ้าค้าง, บวก(เขียว)=คืนค้าง' },
  { key: 'note', label: 'หมายเหตุ', short: 'Note', tip: 'บันทึกเพิ่มเติม เช่น ผ้าชำรุด สีตก' },
  { key: 'col4', label: 'ลูกค้านับผ้ากลับ', short: 'นับกลับ', tip: 'จำนวนผ้าที่ลูกค้านับรับกลับ (⚠ ถ้าไม่ตรงกับแพคส่ง)' },
] as const

export default function LinenFormGrid({
  customer,
  rows,
  onChange,
  catalog,
  carryOver = {},
  formDate,
  readOnly = false,
  editableColumns = ['col2', 'col3', 'col4', 'col5', 'col6', 'note'],
}: LinenFormGridProps) {
  const enabledItems = catalog.filter(item =>
    customer.enabledItems.includes(item.code)
  )

  const [localRows, setLocalRows] = useState<LinenFormRow[]>(rows)

  useEffect(() => {
    setLocalRows(rows)
  }, [rows])

  const getRow = (code: string): LinenFormRow => {
    return localRows.find(r => r.code === code) || {
      code, col1_carryOver: 0, col2_hotelCountIn: 0, col3_hotelClaimCount: 0,
      col4_factoryApproved: 0, col5_factoryClaimApproved: 0, col6_factoryPackSend: 0, note: '',
    }
  }

  const updateRow = (code: string, field: string, value: number | string) => {
    const updated = localRows.map(r => {
      if (r.code !== code) return r
      return { ...r, [field]: value }
    })
    if (!updated.find(r => r.code === code)) {
      const newRow = { ...getRow(code), [field]: value }
      updated.push(newRow)
    }
    setLocalRows(updated)
    onChange(updated)
  }

  const isEditable = (colKey: string) => !readOnly && editableColumns.includes(colKey as typeof editableColumns[number])

  // Check if there are any carry-over values (± both)
  const hasCarryOver = Object.keys(carryOver).some(k => carryOver[k] !== 0)

  // Totals
  const totals = {
    col1: 0, col2: 0, col3: 0, col4: 0, col5: 0, col6: 0,
  }
  for (const item of enabledItems) {
    const row = getRow(item.code)
    const co = carryOver[item.code] || 0
    totals.col1 += co
    totals.col2 += row.col2_hotelCountIn
    totals.col3 += row.col3_hotelClaimCount
    totals.col4 += row.col4_factoryApproved
    totals.col5 += row.col5_factoryClaimApproved
    totals.col6 += (row.col6_factoryPackSend || 0)
  }

  return (
    <div>
      {/* Date display */}
      {formDate && (
        <div className="mb-2 text-sm text-slate-600">
          <span className="font-medium">วันที่:</span> {formDate}
        </div>
      )}

      {/* Carry-over alert */}
      {hasCarryOver && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-1">ยกยอดจากรอบก่อน:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(carryOver).filter(([, qty]) => qty !== 0).map(([code, qty]) => (
              <span key={code} className={cn(
                'text-xs px-2 py-1 rounded',
                qty < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
              )}>
                {code} {qty > 0 ? '+' : ''}{qty}
                {qty < 0 ? ' (ค้างส่ง)' : ' (ส่งเกิน)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">รหัส</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600 w-32">รายการ</th>
              {COL_LABELS.map(col => {
                const editable = isEditable(col.key)
                return (
                  <th key={col.key} title={col.tip} className={cn(
                    'px-3 py-2 font-medium text-center cursor-help',
                    col.key === 'note' ? 'w-32 text-left' : 'w-20',
                    editable
                      ? 'text-[#1B3A5C] bg-teal-50/70 border-b-2 border-[#3DD8D8]'
                      : 'text-slate-600'
                  )}>
                    <span className="hidden sm:inline">{col.label}</span>
                    <span className="sm:hidden">{col.short}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {enabledItems.map((item) => {
              const row = getRow(item.code)
              const co = carryOver[item.code] || 0
              // Discrepancy 1: นับเข้า (col5) ≠ นับส่ง + เคลม (col2 + col3)
              const expectedCountIn = row.col2_hotelCountIn + row.col3_hotelClaimCount
              const hasCountInDisc = row.col5_factoryClaimApproved > 0 && row.col5_factoryClaimApproved !== expectedCountIn
              // Discrepancy 2: นับกลับ (col4) ≠ แพคส่ง (col6)
              const packSend = row.col6_factoryPackSend || 0
              const hasCountBackDisc = row.col4_factoryApproved > 0 && row.col4_factoryApproved !== packSend

              return (
                <tr key={item.code} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                  <td className="px-3 py-1.5 text-slate-700">{item.name}</td>
                  {/* Col 1 - ยกยอดมา (auto, ± ได้) */}
                  <td className="px-1 py-1 text-center">
                    <span className={cn(
                      'text-slate-700',
                      co < 0 && 'text-red-600 font-medium',
                      co > 0 && 'text-emerald-600 font-medium',
                    )}>
                      {co !== 0 ? (co > 0 ? `+${co}` : co) : '-'}
                    </span>
                  </td>
                  {/* Col 2 - ลูกค้านับส่ง */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col2') ? (
                      <input type="number" min={0}
                        value={row.col2_hotelCountIn || ''}
                        onChange={e => updateRow(item.code, 'col2_hotelCountIn', sanitizeNumber(e.target.value, 99999))}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col2_hotelCountIn || '-'}</span>
                    )}
                  </td>
                  {/* Col 3 - เคลม */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col3') ? (
                      <input type="number" min={0}
                        value={row.col3_hotelClaimCount || ''}
                        onChange={e => updateRow(item.code, 'col3_hotelClaimCount', sanitizeNumber(e.target.value, 99999))}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col3_hotelClaimCount || '-'}</span>
                    )}
                  </td>
                  {/* Col 5 - โรงซักนับเข้า (⚠ ถ้า ≠ นับส่ง+เคลม) */}
                  <td className={cn('px-1 py-1 text-center', hasCountInDisc && 'bg-orange-50')}>
                    {isEditable('col5') ? (
                      <input type="number" min={0}
                        value={row.col5_factoryClaimApproved || ''}
                        onChange={e => updateRow(item.code, 'col5_factoryClaimApproved', sanitizeNumber(e.target.value, 99999))}
                        className={cn(
                          'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                          hasCountInDisc ? 'border-orange-400 bg-orange-50' : 'border-slate-200'
                        )}
                      />
                    ) : (
                      <span className={cn('text-slate-700', hasCountInDisc && 'text-orange-600 font-medium')}>
                        {row.col5_factoryClaimApproved || '-'}
                        {hasCountInDisc && ' ⚠'}
                      </span>
                    )}
                  </td>
                  {/* Col 6 - โรงซักแพคส่ง */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col6') ? (
                      <input type="number" min={0}
                        value={row.col6_factoryPackSend || ''}
                        onChange={e => updateRow(item.code, 'col6_factoryPackSend', sanitizeNumber(e.target.value, 99999))}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col6_factoryPackSend || '-'}</span>
                    )}
                  </td>
                  {/* Calculated - ค้าง(-)/คืน(+) = แพคส่ง - นับเข้า */}
                  <td className="px-1 py-1 text-center">
                    {(() => {
                      const val = (row.col6_factoryPackSend || 0) - row.col5_factoryClaimApproved
                      if (val === 0) return <span className="text-slate-400">-</span>
                      return (
                        <span className={cn(
                          val < 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'
                        )}>
                          {val > 0 ? `+${val}` : val}
                        </span>
                      )
                    })()}
                  </td>
                  {/* Note - หมายเหตุ */}
                  <td className="px-1 py-1">
                    {isEditable('note') ? (
                      <input type="text"
                        value={row.note}
                        onChange={e => updateRow(item.code, 'note', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                        placeholder="..."
                      />
                    ) : (
                      <span className="text-slate-500 text-xs">{row.note || '-'}</span>
                    )}
                  </td>
                  {/* Col 4 - ลูกค้านับกลับ (⚠ ถ้า ≠ แพคส่ง) */}
                  <td className={cn('px-1 py-1 text-center', hasCountBackDisc && 'bg-orange-50')}>
                    {isEditable('col4') ? (
                      <input type="number" min={0}
                        value={row.col4_factoryApproved || ''}
                        onChange={e => updateRow(item.code, 'col4_factoryApproved', sanitizeNumber(e.target.value, 99999))}
                        className={cn(
                          'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                          hasCountBackDisc ? 'border-orange-400 bg-orange-50' : 'border-slate-200'
                        )}
                      />
                    ) : (
                      <span className={cn('text-slate-700', hasCountBackDisc && 'text-orange-600 font-medium')}>
                        {row.col4_factoryApproved || '-'}
                        {hasCountBackDisc && ' ⚠'}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium text-slate-700">
              <td className="px-3 py-2" colSpan={2}>รวม</td>
              <td className="px-3 py-2 text-center">
                <span className={cn(
                  totals.col1 < 0 && 'text-red-600',
                  totals.col1 > 0 && 'text-emerald-600',
                )}>
                  {totals.col1 !== 0 ? (totals.col1 > 0 ? `+${totals.col1}` : totals.col1) : '-'}
                </span>
              </td>
              <td className="px-3 py-2 text-center">{totals.col2}</td>
              <td className="px-3 py-2 text-center">{totals.col3}</td>
              <td className="px-3 py-2 text-center">{totals.col5}</td>
              <td className="px-3 py-2 text-center">{totals.col6}</td>
              <td className="px-3 py-2 text-center">
                {(() => {
                  const val = totals.col6 - totals.col5
                  if (val === 0) return '-'
                  return (
                    <span className={cn(
                      val < 0 ? 'text-red-600' : 'text-emerald-600'
                    )}>
                      {val > 0 ? `+${val}` : val}
                    </span>
                  )
                })()}
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-center">{totals.col4}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
