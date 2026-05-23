'use client'

/**
 * 317 Phase 1 — Aggregate Size Groups Setup Modal
 *
 * เปิดจาก customer detail → ตั้งค่าว่าลูกค้านี้นับ "รวมไซส์" ตอนรับเข้าสำหรับ group ไหนบ้าง
 *
 * Per group config:
 *   - groupKey (จาก catalog) — รายการที่อยู่ใน group นี้แสดงใต้ checkbox
 *   - col2Mode: ลูกค้าส่งซัก (col2) แบบไหน
 *     - 'aggregate' = ส่งรวมไม่แยกไซส์ (มี input ที่ group level ใน LF)
 *     - 'per_row'   = ส่งแยกไซส์ตามปกติ
 *   - col3 (เคลม) แยกเสมอ
 *   - col5 (โรงซักนับเข้า) รวมเสมอเมื่อ opt-in
 *   - col6 (โรงซักแพคส่ง) แยกเสมอ
 */

import { useMemo, useState } from 'react'
import { Package, Info } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { getGroupAnchorCode } from '@/lib/aggregate-groups'
import type { Customer, AggregateSizeGroupConfig, LinenItemDef } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  customer: Customer
}

export default function AggregateGroupsModal({ open, onClose, customer }: Props) {
  const { updateCustomer, linenCatalog } = useStore()

  const [configs, setConfigs] = useState<AggregateSizeGroupConfig[]>(
    customer.aggregateSizeGroups ?? [],
  )

  // หา size groups ทั้งหมดใน catalog (unique, sorted) + รวบรวม items ในแต่ละ group
  const groupsInCatalog = useMemo(() => {
    const map = new Map<string, LinenItemDef[]>()
    for (const item of linenCatalog) {
      if (!item.sizeGroup) continue
      if (!map.has(item.sizeGroup)) map.set(item.sizeGroup, [])
      map.get(item.sizeGroup)!.push(item)
    }
    return Array.from(map.entries())
      .map(([groupKey, items]) => ({
        groupKey,
        items: items.sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      .sort((a, b) => a.groupKey.localeCompare(b.groupKey))
  }, [linenCatalog])

  const isEnabled = (groupKey: string) => configs.some(c => c.groupKey === groupKey)
  const getCol2Mode = (groupKey: string): 'aggregate' | 'per_row' =>
    configs.find(c => c.groupKey === groupKey)?.col2Mode ?? 'aggregate'
  const getCol5Mode = (groupKey: string): 'aggregate' | 'per_row' =>
    configs.find(c => c.groupKey === groupKey)?.col5Mode ?? 'aggregate'
  // 335: manual anchor — undefined = auto median
  const getAnchorCode = (groupKey: string): string | undefined =>
    configs.find(c => c.groupKey === groupKey)?.anchorCode

  const toggleGroup = (groupKey: string) => {
    setConfigs(prev =>
      isEnabled(groupKey)
        ? prev.filter(c => c.groupKey !== groupKey)
        : [...prev, { groupKey, col2Mode: 'aggregate', col5Mode: 'aggregate' }],
    )
  }

  const setCol2Mode = (groupKey: string, mode: 'aggregate' | 'per_row') => {
    setConfigs(prev =>
      prev.map(c => (c.groupKey === groupKey ? { ...c, col2Mode: mode } : c)),
    )
  }

  const setCol5Mode = (groupKey: string, mode: 'aggregate' | 'per_row') => {
    setConfigs(prev =>
      prev.map(c => (c.groupKey === groupKey ? { ...c, col5Mode: mode } : c)),
    )
  }

  // 335: เลือก anchor manually — undefined = auto median
  const setAnchorCode = (groupKey: string, code: string | undefined) => {
    setConfigs(prev =>
      prev.map(c => (c.groupKey === groupKey ? { ...c, anchorCode: code } : c)),
    )
  }

  const handleSave = () => {
    updateCustomer(customer.id, { aggregateSizeGroups: configs })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`การนับรวมไซส์ — ${customer.shortName || customer.name}`}
      size="lg"
    >
      <div className="space-y-5">

        {/* Intro */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 text-sm text-slate-700">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-indigo-900 mb-1">เลือก group ที่นับรวมไซส์ตอนรับเข้า</p>
              <p className="text-xs">
                ในความเป็นจริง ผ้าใหญ่ (ผ้าปูเตียง, ผ้านวม) แยกไซส์ตอนนับเข้ายาก → โรงซักนับรวมแล้วใส่ใน LF ที่ row กลาง<br />
                Phase 1 (ตอนนี้): เลือกได้แล้ว · Carry-over จะคำนวณ <strong>at group level</strong> ใน view by-group<br />
                Phase 2: LF UI จะมีช่องกรอก "ยอดรวมเข้า" แยกจาก rows
              </p>
            </div>
          </div>
        </div>

        {groupsInCatalog.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            ยังไม่มี size group ใน catalog · ไปตั้งค่าที่หน้า <strong>รายการผ้า → 📦 Group</strong> ก่อน
          </div>
        ) : (
          <div className="space-y-3">
            {groupsInCatalog.map(({ groupKey, items }) => {
              const enabled = isEnabled(groupKey)
              const col2Mode = getCol2Mode(groupKey)
              const col5Mode = getCol5Mode(groupKey)
              return (
                <div
                  key={groupKey}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    enabled ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white',
                  )}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleGroup(groupKey)}
                      className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="font-mono font-bold text-indigo-900">{groupKey}</span>
                        <span className="text-xs text-slate-500">· {items.length} รายการ</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map(it => (
                          <span
                            key={it.code}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white border border-slate-200 text-slate-600"
                          >
                            <code className="font-mono text-slate-400">{it.code}</code>
                            <span>{it.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>

                  {enabled && (
                    <div className="mt-3 pt-3 border-t border-indigo-100 pl-7 space-y-3">
                      {/* col2 — ลูกค้านับส่ง */}
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-2">
                          ลูกค้านับส่งซัก (col2)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCol2Mode(groupKey, 'aggregate')}
                            className={cn(
                              'text-left rounded-lg border px-3 py-2 text-xs transition-colors',
                              col2Mode === 'aggregate'
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            )}
                          >
                            <div className="font-semibold">🧺 ส่งรวม (ไม่แยกไซส์)</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">ลูกค้าส่งมาในถุงเดียว ไม่แยกขนาด</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCol2Mode(groupKey, 'per_row')}
                            className={cn(
                              'text-left rounded-lg border px-3 py-2 text-xs transition-colors',
                              col2Mode === 'per_row'
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            )}
                          >
                            <div className="font-semibold">📋 ส่งแยกไซส์</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">ลูกค้าระบุจำนวนแต่ละไซส์มาให้</div>
                          </button>
                        </div>
                      </div>

                      {/* col5 — โรงซักนับเข้า (321) */}
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-2">
                          โรงซักนับเข้า (col5)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCol5Mode(groupKey, 'aggregate')}
                            className={cn(
                              'text-left rounded-lg border px-3 py-2 text-xs transition-colors',
                              col5Mode === 'aggregate'
                                ? 'border-blue-400 bg-blue-50 text-blue-900'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            )}
                          >
                            <div className="font-semibold">🧺 นับรวม (default)</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">โรงซักนับรวมไซส์ตอนรับเข้า (ปกติ)</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCol5Mode(groupKey, 'per_row')}
                            className={cn(
                              'text-left rounded-lg border px-3 py-2 text-xs transition-colors',
                              col5Mode === 'per_row'
                                ? 'border-blue-400 bg-blue-50 text-blue-900'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            )}
                          >
                            <div className="font-semibold">📋 นับแยกไซส์</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">ลูกค้าขอให้แยกนับเข้าแต่ละไซส์</div>
                          </button>
                        </div>
                      </div>

                      {/* 335: Anchor selector — row ที่จะเก็บค่ายอดรวมใน LF */}
                      {(col2Mode === 'aggregate' || col5Mode === 'aggregate') && (() => {
                        const anchorCode = getAnchorCode(groupKey)
                        const autoAnchor = getGroupAnchorCode(items)
                        const effective = anchorCode && items.some(i => i.code === anchorCode)
                          ? anchorCode : autoAnchor
                        const effItem = items.find(i => i.code === effective)
                        return (
                          <div>
                            <div className="text-xs font-semibold text-slate-600 mb-2">
                              ตำแหน่ง row "รวม" (anchor)
                              <span className="text-[10px] font-normal text-slate-400 ml-2">— ที่เก็บค่ายอดรวมและแสดงผ้าค้าง/คืน</span>
                            </div>
                            <select
                              value={anchorCode || ''}
                              onChange={e => setAnchorCode(groupKey, e.target.value || undefined)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-[#3DD8D8] focus:border-[#3DD8D8] focus:outline-none bg-white"
                            >
                              <option value="">
                                (อัตโนมัติ — ตำแหน่งกลาง: {items.find(i => i.code === autoAnchor)?.name || autoAnchor})
                              </option>
                              {items.map(it => (
                                <option key={it.code} value={it.code}>
                                  {it.code} — {it.name}
                                </option>
                              ))}
                            </select>
                            <div className="text-[10px] text-slate-500 mt-1">
                              ปัจจุบันใช้: <span className="font-mono font-semibold text-indigo-700">{effective}</span>
                              {effItem && <span className="ml-1 text-slate-600">— {effItem.name}</span>}
                              {!anchorCode && <span className="text-slate-400 ml-1">(เลือกด้วย median sortOrder อัตโนมัติ)</span>}
                            </div>
                          </div>
                        )
                      })()}

                      {/* All-split warning */}
                      {col2Mode === 'per_row' && col5Mode === 'per_row' && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
                          ⚠ เลือกทั้งคู่ "แยกไซส์" → group นี้ทำงานเหมือนไม่ opt-in (ยกเว้นเห็น by-group view ใน report)
                        </div>
                      )}

                      <div className="text-[10px] text-slate-400">
                        💡 col3 (เคลม) · col4 (นับกลับ) · col6 (แพคส่ง) แยกไซส์เสมอ
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#1B3A5C] text-white hover:bg-[#122740] transition-colors"
          >
            บันทึก
          </button>
        </div>
      </div>
    </Modal>
  )
}
