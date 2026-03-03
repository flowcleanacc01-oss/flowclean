'use client'

import { useState, useEffect } from 'react'
import type { LinenFormRow, Customer, LinenItemDef } from '@/types'
import { cn } from '@/lib/utils'

interface LinenFormGridProps {
  customer: Customer
  rows: LinenFormRow[]
  onChange: (rows: LinenFormRow[]) => void
  catalog: LinenItemDef[]
  carryOver?: Record<string, number>
  readOnly?: boolean
  editableColumns?: ('col1' | 'col2' | 'col3' | 'col4' | 'col5' | 'col6')[]
}

const COL_LABELS = [
  { key: 'col1', label: 'ส่งซักปกติ', short: 'ปกติ' },
  { key: 'col2', label: 'เคลม', short: 'เคลม' },
  { key: 'col3', label: 'ซักแล้วกลับ', short: 'กลับ' },
  { key: 'col4', label: 'นับเข้า', short: 'นับ' },
  { key: 'col5', label: 'แพคส่ง', short: 'แพค' },
  { key: 'col6', label: 'หมายเหตุ', short: 'Note' },
] as const

export default function LinenFormGrid({
  customer,
  rows,
  onChange,
  catalog,
  carryOver = {},
  readOnly = false,
  editableColumns = ['col1', 'col2', 'col3', 'col4', 'col5', 'col6'],
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
      code, col1_normalSend: 0, col2_claimSend: 0, col3_washedReturn: 0,
      col4_factoryCountIn: 0, col5_factoryPackSend: 0, col6_note: '',
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

  // Totals
  const totals = {
    col1: 0, col2: 0, col3: 0, col4: 0, col5: 0,
  }
  for (const item of enabledItems) {
    const row = getRow(item.code)
    totals.col1 += row.col1_normalSend
    totals.col2 += row.col2_claimSend
    totals.col3 += row.col3_washedReturn
    totals.col4 += row.col4_factoryCountIn
    totals.col5 += row.col5_factoryPackSend
  }

  const hasCarryOver = Object.keys(carryOver).length > 0

  return (
    <div>
      {/* Carry-over alert */}
      {hasCarryOver && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-1">ผ้าค้างจากรอบก่อน:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(carryOver).map(([code, qty]) => (
              <span key={code} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                {code} x{qty}
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
              {COL_LABELS.map(col => (
                <th key={col.key} className={cn(
                  'px-3 py-2 font-medium text-slate-600 text-center',
                  col.key === 'col6' ? 'w-32 text-left' : 'w-20'
                )}>
                  <span className="hidden sm:inline">{col.label}</span>
                  <span className="sm:hidden">{col.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enabledItems.map((item) => {
              const row = getRow(item.code)
              const sent = row.col1_normalSend + row.col2_claimSend
              const counted = row.col4_factoryCountIn
              const hasDiscrepancy = counted > 0 && sent !== counted

              return (
                <tr key={item.code} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                  <td className="px-3 py-1.5 text-slate-700">{item.name}</td>
                  {/* Col 1 - ส่งซักปกติ */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col1') ? (
                      <input type="number" min={0}
                        value={row.col1_normalSend || ''}
                        onChange={e => updateRow(item.code, 'col1_normalSend', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col1_normalSend || '-'}</span>
                    )}
                  </td>
                  {/* Col 2 - เคลม */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col2') ? (
                      <input type="number" min={0}
                        value={row.col2_claimSend || ''}
                        onChange={e => updateRow(item.code, 'col2_claimSend', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col2_claimSend || '-'}</span>
                    )}
                  </td>
                  {/* Col 3 - ซักแล้วกลับ */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col3') ? (
                      <input type="number" min={0}
                        value={row.col3_washedReturn || ''}
                        onChange={e => updateRow(item.code, 'col3_washedReturn', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col3_washedReturn || '-'}</span>
                    )}
                  </td>
                  {/* Col 4 - นับเข้า */}
                  <td className={cn('px-1 py-1 text-center', hasDiscrepancy && 'bg-orange-50')}>
                    {isEditable('col4') ? (
                      <input type="number" min={0}
                        value={row.col4_factoryCountIn || ''}
                        onChange={e => updateRow(item.code, 'col4_factoryCountIn', parseInt(e.target.value) || 0)}
                        className={cn(
                          'w-16 px-2 py-1 border rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none',
                          hasDiscrepancy ? 'border-orange-400 bg-orange-50' : 'border-slate-200'
                        )}
                      />
                    ) : (
                      <span className={cn('text-slate-700', hasDiscrepancy && 'text-orange-600 font-medium')}>
                        {row.col4_factoryCountIn || '-'}
                        {hasDiscrepancy && ' ⚠'}
                      </span>
                    )}
                  </td>
                  {/* Col 5 - แพคส่ง */}
                  <td className="px-1 py-1 text-center">
                    {isEditable('col5') ? (
                      <input type="number" min={0}
                        value={row.col5_factoryPackSend || ''}
                        onChange={e => updateRow(item.code, 'col5_factoryPackSend', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{row.col5_factoryPackSend || '-'}</span>
                    )}
                  </td>
                  {/* Col 6 - หมายเหตุ */}
                  <td className="px-1 py-1">
                    {isEditable('col6') ? (
                      <input type="text"
                        value={row.col6_note}
                        onChange={e => updateRow(item.code, 'col6_note', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none"
                        placeholder="..."
                      />
                    ) : (
                      <span className="text-slate-500 text-xs">{row.col6_note || '-'}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium text-slate-700">
              <td className="px-3 py-2" colSpan={2}>รวม</td>
              <td className="px-3 py-2 text-center">{totals.col1}</td>
              <td className="px-3 py-2 text-center">{totals.col2}</td>
              <td className="px-3 py-2 text-center">{totals.col3}</td>
              <td className="px-3 py-2 text-center">{totals.col4}</td>
              <td className="px-3 py-2 text-center">{totals.col5}</td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
