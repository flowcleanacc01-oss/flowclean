'use client'

import { useState, useMemo, useCallback } from 'react'
import { useStore } from '@/lib/store'
import { canManageItems } from '@/lib/permissions'
import { cn, sanitizeNumber, scrollToActiveRow } from '@/lib/utils'
import { highlightText } from '@/lib/highlight'
import { useSearchParams } from 'next/navigation'
import type { LinenItemDef, LinenCategoryDef } from '@/types'
import { Plus, Trash2, Edit2, Check, X, Search, ChevronUp, ChevronDown, ArrowUpDown, Printer, GripVertical } from 'lucide-react'
import Modal from '@/components/Modal'
import ExportButtons from '@/components/ExportButtons'
import { exportCSV } from '@/lib/export'
import { useScrollToMark } from '@/lib/use-scroll-to-mark'
import MergeCodesTool from '@/components/MergeCodesTool'
import SyncNamesTool from '@/components/SyncNamesTool'
import { canManageSettings } from '@/lib/permissions'
import { useAutoScrollOnDrag } from '@/lib/use-auto-scroll-on-drag'
import { useNameDrift } from '@/lib/use-name-drift'
import FloatingTotalBar from '@/components/FloatingTotalBar'
import { RefreshCcw } from 'lucide-react'

type TabKey = 'items' | 'categories' | 'merge' | 'sync'
type SortColumn = 'code' | 'name' | 'nameEn' | 'category' | 'unit' | 'defaultPrice' | 'sortOrder'
type SortDir = 'asc' | 'desc'

const EMPTY_NEW_ITEM: LinenItemDef = {
  code: '', name: '', nameEn: '', category: 'other', unit: 'ชิ้น', defaultPrice: 0, sortOrder: 0,
}

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: 'asc' | 'desc' }) {
  if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1" />
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-[#1B3A5C] ml-1" />
    : <ChevronDown className="w-3 h-3 text-[#1B3A5C] ml-1" />
}

export default function ItemsPage() {
  const {
    currentUser, defaultPrices, updateDefaultPrice,
    linenCatalog, addLinenItem, updateLinenItem, deleteLinenItem,
    linenCategories, addCategory, updateCategory, deleteCategory, getCategoryLabel,
  } = useStore()
  const sp = useSearchParams()
  const urlHighlightQ = sp.get('q') || '' // 147.2
  const [showItemPrintList, setShowItemPrintList] = useState(false) // 154.1

  const [tab, setTab] = useState<TabKey>('items')
  // 180: scroll to first <mark> when arriving from global search with ?q=
  useScrollToMark([tab])

  // ---- Items state ----
  const [search, setSearch] = useState('')
  // 162.1: combine local search + URL ?q so live typing also highlights
  const highlightQ = [search, urlHighlightQ].filter(Boolean).join(' ').trim()
  const [filterCat, setFilterCat] = useState<string>('all')
  const [sortCol, setSortCol] = useState<SortColumn>('sortOrder')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState<LinenItemDef>(EMPTY_NEW_ITEM)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<Partial<LinenItemDef>>({})
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [activeCode, setActiveCode] = useState<string | null>(null)
  // 173.1: reorder mode + drag tracking
  const [reorderMode, setReorderMode] = useState(false)
  const [dragCode, setDragCode] = useState<string | null>(null)
  const [dragOverCode, setDragOverCode] = useState<string | null>(null)

  // ---- Categories state ----
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatKey, setNewCatKey] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [editingCatKey, setEditingCatKey] = useState<string | null>(null)
  const [editCatLabel, setEditCatLabel] = useState('')
  // 173.1: reorder mode for categories
  const [catReorderMode, setCatReorderMode] = useState(false)
  const [dragCatKey, setDragCatKey] = useState<string | null>(null)
  const [dragOverCatKey, setDragOverCatKey] = useState<string | null>(null)

  // 186: auto-scroll page เมื่อลาก row ใกล้ขอบบน/ล่าง — ใช้ทั้ง items + categories
  useAutoScrollOnDrag(dragCode !== null || dragCatKey !== null)

  // 188: name drift detection — used for inline badge + Sync tab
  const { driftMap, totalCodes: driftCodeCount } = useNameDrift()
  const [syncFocusCode, setSyncFocusCode] = useState<string | null>(null)
  const goToSyncTab = (code?: string) => {
    setSyncFocusCode(code || null)
    setTab('sync')
  }

  // ---- Filtered & sorted items ----
  const filteredItems = useMemo(() => {
    let items = [...linenCatalog]
    // Search
    if (search) {
      const s = search.toLowerCase()
      items = items.filter(i =>
        i.code.toLowerCase().includes(s) ||
        i.name.toLowerCase().includes(s) ||
        i.nameEn.toLowerCase().includes(s)
      )
    }
    // Filter by category
    if (filterCat !== 'all') {
      items = items.filter(i => i.category === filterCat)
    }
    // Sort
    items.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'code': cmp = a.code.localeCompare(b.code); break
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'nameEn': cmp = a.nameEn.localeCompare(b.nameEn); break
        case 'category': cmp = getCategoryLabel(a.category).localeCompare(getCategoryLabel(b.category)); break
        case 'unit': cmp = a.unit.localeCompare(b.unit); break
        case 'defaultPrice': cmp = (defaultPrices[a.code] ?? a.defaultPrice) - (defaultPrices[b.code] ?? b.defaultPrice); break
        case 'sortOrder': cmp = a.sortOrder - b.sortOrder; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return items
  }, [linenCatalog, search, filterCat, sortCol, sortDir, defaultPrices, getCategoryLabel])

  const sortedCategories = useMemo(() =>
    [...linenCategories].sort((a, b) => a.sortOrder - b.sortOrder)
  , [linenCategories])

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }
  const sortedBg = (col: string) => sortCol === col ? 'bg-[#1B3A5C]/[0.04]' : ''
  const sortedThBg = (col: string) => sortCol === col ? 'bg-[#1B3A5C]/10 text-[#1B3A5C]' : 'text-slate-600'

  // ---- Item handlers ----
  const handleAddItem = () => {
    if (!newItem.code || !newItem.name) return
    if (linenCatalog.some(i => i.code === newItem.code)) {
      alert('รหัสนี้มีอยู่แล้ว')
      return
    }
    const maxOrder = linenCatalog.reduce((max, i) => Math.max(max, i.sortOrder), 0)
    const newCode = newItem.code
    addLinenItem({ ...newItem, sortOrder: maxOrder + 1 })
    setActiveCode(newCode)
    scrollToActiveRow(newCode)
    setNewItem(EMPTY_NEW_ITEM)
    setShowAddItem(false)
  }

  const handleStartEdit = (item: LinenItemDef) => {
    setEditingCode(item.code)
    setEditItem({ name: item.name, nameEn: item.nameEn, category: item.category, unit: item.unit })
  }

  const handleSaveEdit = (code: string) => {
    updateLinenItem(code, editItem)
    setEditingCode(null)
    setEditItem({})
  }

  const handleDeleteItem = (code: string, name: string) => {
    if (confirm(`ลบรายการ "${name}" (${code})?\nรายการที่ถูกใช้ในฟอร์มเดิมจะยังอยู่ แต่จะไม่แสดงในรายการเลือกใหม่`)) {
      deleteLinenItem(code)
      if (activeCode === code) setActiveCode(null)
      setSelectedCodes(prev => prev.filter(c => c !== code))
    }
  }

  const handleBulkDeleteItems = () => {
    if (!confirm(`ลบรายการผ้าที่เลือกทั้งหมด ${selectedCodes.length} รายการ?\nรายการที่ถูกใช้ในฟอร์มเดิมจะยังอยู่ แต่จะไม่แสดงในรายการเลือกใหม่`)) return
    for (const code of selectedCodes) {
      deleteLinenItem(code)
    }
    if (activeCode && selectedCodes.includes(activeCode)) setActiveCode(null)
    setSelectedCodes([])
  }

  const handleMoveItem = useCallback((code: string, direction: 'up' | 'down') => {
    const sorted = [...linenCatalog].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = sorted.findIndex(i => i.code === code)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const thisItem = sorted[idx]
    const otherItem = sorted[swapIdx]
    updateLinenItem(thisItem.code, { sortOrder: otherItem.sortOrder })
    updateLinenItem(otherItem.code, { sortOrder: thisItem.sortOrder })
  }, [linenCatalog, updateLinenItem])

  // 173.1: drop = move source to target position + reassign sequential sortOrder
  const handleReorderDropItem = useCallback((sourceCode: string, targetCode: string) => {
    if (sourceCode === targetCode) return
    const sorted = [...linenCatalog].sort((a, b) => a.sortOrder - b.sortOrder)
    const srcIdx = sorted.findIndex(i => i.code === sourceCode)
    const tgtIdx = sorted.findIndex(i => i.code === targetCode)
    if (srcIdx < 0 || tgtIdx < 0) return
    const [moved] = sorted.splice(srcIdx, 1)
    sorted.splice(tgtIdx, 0, moved)
    // Reassign sequential sortOrder (1..N) — only update items whose order changed
    sorted.forEach((it, i) => {
      const newOrder = i + 1
      if (it.sortOrder !== newOrder) updateLinenItem(it.code, { sortOrder: newOrder })
    })
  }, [linenCatalog, updateLinenItem])

  // ---- Category handlers ----
  const handleAddCategory = () => {
    if (!newCatKey || !newCatLabel) return
    if (linenCategories.some(c => c.key === newCatKey)) {
      alert('รหัสหมวดนี้มีอยู่แล้ว')
      return
    }
    const maxOrder = linenCategories.reduce((max, c) => Math.max(max, c.sortOrder), 0)
    addCategory({ key: newCatKey, label: newCatLabel, sortOrder: maxOrder + 1 })
    setNewCatKey('')
    setNewCatLabel('')
    setShowAddCat(false)
  }

  const handleMoveCat = useCallback((key: string, direction: 'up' | 'down') => {
    const sorted = [...linenCategories].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = sorted.findIndex(c => c.key === key)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const thisCat = sorted[idx]
    const otherCat = sorted[swapIdx]
    updateCategory(thisCat.key, { sortOrder: otherCat.sortOrder })
    updateCategory(otherCat.key, { sortOrder: thisCat.sortOrder })
  }, [linenCategories, updateCategory])

  // 173.1: drop reorder for categories
  const handleReorderDropCat = useCallback((sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return
    const sorted = [...linenCategories].sort((a, b) => a.sortOrder - b.sortOrder)
    const srcIdx = sorted.findIndex(c => c.key === sourceKey)
    const tgtIdx = sorted.findIndex(c => c.key === targetKey)
    if (srcIdx < 0 || tgtIdx < 0) return
    const [moved] = sorted.splice(srcIdx, 1)
    sorted.splice(tgtIdx, 0, moved)
    sorted.forEach((c, i) => {
      const newOrder = i + 1
      if (c.sortOrder !== newOrder) updateCategory(c.key, { sortOrder: newOrder })
    })
  }, [linenCategories, updateCategory])

  const handleDeleteCat = (cat: LinenCategoryDef) => {
    const usedCount = linenCatalog.filter(i => i.category === cat.key).length
    if (cat.key === 'other') {
      alert('ไม่สามารถลบหมวด "อื่นๆ" ได้ (เป็นหมวดเริ่มต้น)')
      return
    }
    if (usedCount > 0) {
      alert(`ไม่สามารถลบหมวด "${cat.label}" ได้ เพราะมีรายการผ้าใช้อยู่ ${usedCount} รายการ\nกรุณาย้ายรายการไปหมวดอื่นก่อน`)
      return
    }
    if (confirm(`ลบหมวด "${cat.label}" (${cat.key})?`)) {
      deleteCategory(cat.key)
    }
  }

  if (!canManageItems(currentUser)) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'items', label: 'รายการผ้า' },
    { key: 'categories', label: 'หมวด' },
    ...(canManageSettings(currentUser) ? [
      { key: 'merge' as TabKey, label: 'รวมรหัส' },
      { key: 'sync' as TabKey, label: 'ซิงก์ชื่อ', badge: driftCodeCount },
    ] : []),
  ]

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">รายการผ้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการรายการผ้าและหมวดหมู่</p>
        </div>
        {tab === 'items' && (
          <button onClick={() => setShowItemPrintList(true)} disabled={filteredItems.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium">
            <Printer className="w-4 h-4" />พิมพ์/ส่งออกเอกสารรายการ
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5',
              tab === t.key ? 'border-[#1B3A5C] text-[#1B3A5C]' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t.label}
            {t.badge && t.badge > 0 ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Items Tab */}
      {tab === 'items' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <div>
                <h3 className="font-medium text-slate-700">รายการผ้า ({linenCatalog.length} รายการ)</h3>
                <p className="text-xs text-slate-400 mt-0.5">เพิ่ม/แก้ไข/ลบรายการผ้า และตั้งราคา default</p>
              </div>
              <div className="flex-1" />
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="ค้นหา..."
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-48 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
              {/* Filter category */}
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="all">ทุกหมวด</option>
                {sortedCategories.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              {selectedCodes.length > 0 && (
                <button onClick={handleBulkDeleteItems}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs rounded-lg hover:bg-red-100 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />ลบที่เลือก ({selectedCodes.length})
                </button>
              )}
              {/* 173.1: reorder mode toggle — force sortCol=sortOrder so drag matches visual order */}
              <button onClick={() => {
                setReorderMode(m => {
                  const next = !m
                  if (next) { setSortCol('sortOrder'); setSortDir('asc') }
                  return next
                })
              }}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors border',
                  reorderMode
                    ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                )}>
                {reorderMode
                  ? <><Check className="w-3.5 h-3.5" />เสร็จสิ้น</>
                  : <><ArrowUpDown className="w-3.5 h-3.5" />จัดลำดับใหม่</>}
              </button>
              <button onClick={() => { setShowAddItem(true); setNewItem(EMPTY_NEW_ITEM) }}
                disabled={reorderMode}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#3DD8D8] text-[#1B3A5C] text-xs rounded-lg hover:bg-[#2bb8b8] transition-colors disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" />เพิ่มรายการ
              </button>
            </div>
            {/* 173.1: reorder hint banner */}
            {reorderMode && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <span className="font-semibold">โหมดจัดลำดับ:</span>
                จับ <span className="font-mono px-1.5 py-0.5 bg-white border border-amber-300 rounded">⋮⋮</span> ลากลงไปยังตำแหน่งที่ต้องการ — กด &quot;เสร็จสิ้น&quot; เมื่อจัดเสร็จ
                <span className="ml-auto text-amber-600">การเรียงในตารางจะ override sort เป็น sortOrder</span>
              </div>
            )}

            {/* Add Item Inline Form */}
            {showAddItem && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                <p className="text-sm font-medium text-blue-800 mb-2">เพิ่มรายการใหม่</p>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-sm">
                  <input value={newItem.code} onChange={e => setNewItem({ ...newItem, code: e.target.value.toUpperCase() })}
                    placeholder="รหัส (เช่น T/C)" maxLength={5}
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  <input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="ชื่อ (ไทย)"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  <input value={newItem.nameEn} onChange={e => setNewItem({ ...newItem, nameEn: e.target.value })}
                    placeholder="ชื่อ (EN)"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                    {sortedCategories.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <input value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="หน่วย"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  <input type="number" min={0} step={0.5} value={newItem.defaultPrice}
                    onChange={e => setNewItem({ ...newItem, defaultPrice: sanitizeNumber(e.target.value) })}
                    placeholder="ราคา"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm text-right focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={handleAddItem} disabled={!newItem.code || !newItem.name}
                    className="px-3 py-1.5 bg-[#3DD8D8] text-[#1B3A5C] text-xs rounded hover:bg-[#2bb8b8] disabled:opacity-50 transition-colors flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />บันทึก
                  </button>
                  <button onClick={() => setShowAddItem(false)}
                    className="px-3 py-1.5 text-slate-600 text-xs hover:bg-slate-100 rounded transition-colors flex items-center gap-1">
                    <X className="w-3.5 h-3.5" />ยกเลิก
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="w-8 px-2 py-2">
                      <input type="checkbox"
                        checked={filteredItems.length > 0 && selectedCodes.length === filteredItems.length}
                        onChange={e => setSelectedCodes(e.target.checked ? filteredItems.map(i => i.code) : [])}
                        className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8]" />
                    </th>
                    <th className="w-10 px-2 py-2"></th>
                    <th className={cn("text-left px-4 py-2 font-medium cursor-pointer select-none transition-colors hover:bg-slate-100", sortedThBg('code'))} onClick={() => handleSort('code')}>
                      <span className="flex items-center">รหัส<SortIcon col="code" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={cn("text-left px-4 py-2 font-medium cursor-pointer select-none transition-colors hover:bg-slate-100", sortedThBg('name'))} onClick={() => handleSort('name')}>
                      <span className="flex items-center">ชื่อ (ไทย)<SortIcon col="name" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={cn("text-left px-4 py-2 font-medium cursor-pointer select-none transition-colors hover:bg-slate-100", sortedThBg('nameEn'))} onClick={() => handleSort('nameEn')}>
                      <span className="flex items-center">ชื่อ (EN)<SortIcon col="nameEn" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={cn("text-left px-4 py-2 font-medium cursor-pointer select-none transition-colors hover:bg-slate-100", sortedThBg('category'))} onClick={() => handleSort('category')}>
                      <span className="flex items-center">หมวด<SortIcon col="category" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={cn("text-left px-4 py-2 font-medium cursor-pointer select-none transition-colors hover:bg-slate-100", sortedThBg('unit'))} onClick={() => handleSort('unit')}>
                      <span className="flex items-center">หน่วย<SortIcon col="unit" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className={cn("text-right px-4 py-2 font-medium w-28 cursor-pointer select-none transition-colors hover:bg-slate-100", sortedThBg('defaultPrice'))} onClick={() => handleSort('defaultPrice')}>
                      <span className="flex items-center justify-end">ราคา default<SortIcon col="defaultPrice" sortCol={sortCol} sortDir={sortDir} /></span>
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const isDragging = dragCode === item.code
                    const isDragOver = dragOverCode === item.code && dragCode !== item.code
                    return (
                    <tr key={item.code}
                      data-row-id={item.code}
                      onClick={() => setActiveCode(item.code)}
                      // 173.1: drag-drop only when in reorderMode
                      draggable={reorderMode}
                      onDragStart={reorderMode ? (e) => {
                        setDragCode(item.code)
                        e.dataTransfer.effectAllowed = 'move'
                      } : undefined}
                      onDragEnter={reorderMode ? () => setDragOverCode(item.code) : undefined}
                      onDragOver={reorderMode ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
                      onDragEnd={reorderMode ? () => { setDragCode(null); setDragOverCode(null) } : undefined}
                      onDrop={reorderMode ? (e) => {
                        e.preventDefault()
                        if (dragCode) handleReorderDropItem(dragCode, item.code)
                        setDragCode(null); setDragOverCode(null)
                      } : undefined}
                      className={cn(
                        'border-t border-slate-100 transition-colors cursor-pointer',
                        activeCode === item.code && !reorderMode
                          ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]'
                          : 'hover:bg-slate-50',
                        reorderMode && 'select-none',
                        isDragging && 'opacity-40',
                        isDragOver && 'border-t-2 border-t-amber-500 bg-amber-50',
                      )}>
                      <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedCodes.includes(item.code)}
                          disabled={reorderMode}
                          onChange={e => setSelectedCodes(prev =>
                            e.target.checked ? [...prev, item.code] : prev.filter(c => c !== item.code)
                          )}
                          className="w-4 h-4 rounded border-slate-300 text-[#1B3A5C] focus:ring-[#3DD8D8] disabled:opacity-30" />
                      </td>
                      {/* Sort arrows OR drag handle (173.1) */}
                      <td className="px-1 py-2 text-center">
                        {reorderMode ? (
                          <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-amber-500 hover:text-amber-600">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <button onClick={() => handleMoveItem(item.code, 'up')} disabled={idx === 0 && sortCol === 'sortOrder'}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-0.5">
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleMoveItem(item.code, 'down')} disabled={idx === filteredItems.length - 1 && sortCol === 'sortOrder'}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-0.5">
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className={cn("px-4 py-2 font-mono text-xs text-slate-500", sortedBg('code'))}>{highlightText(item.code, highlightQ)}</td>
                      <td className={cn("px-4 py-2 text-slate-700", sortedBg('name'))}>
                        {editingCode === item.code ? (
                          <input value={editItem.name ?? item.name}
                            onChange={e => setEditItem({ ...editItem, name: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            {highlightText(item.name, highlightQ)}
                            {/* 188 ขั้น B: drift indicator */}
                            {(() => {
                              const drift = driftMap.get(item.code)
                              if (!drift) return null
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); goToSyncTab(item.code) }}
                                  title={`มี ${drift.qts.length} QT ใช้ชื่อเก่า — คลิกเพื่อซิงก์`}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                >
                                  <RefreshCcw className="w-2.5 h-2.5" />
                                  {drift.qts.length} QT ตามไม่ทัน
                                </button>
                              )
                            })()}
                          </span>
                        )}
                      </td>
                      <td className={cn("px-4 py-2 text-slate-500 text-xs", sortedBg('nameEn'))}>
                        {editingCode === item.code ? (
                          <input value={editItem.nameEn ?? item.nameEn}
                            onChange={e => setEditItem({ ...editItem, nameEn: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                        ) : highlightText(item.nameEn, highlightQ)}
                      </td>
                      <td className={cn("px-4 py-2 text-xs text-slate-400", sortedBg('category'))}>
                        {editingCode === item.code ? (
                          <select value={editItem.category ?? item.category}
                            onChange={e => setEditItem({ ...editItem, category: e.target.value })}
                            className="px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                            {sortedCategories.map(c => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                        ) : getCategoryLabel(item.category)}
                      </td>
                      <td className={cn("px-4 py-2 text-xs text-slate-400", sortedBg('unit'))}>
                        {editingCode === item.code ? (
                          <input value={editItem.unit ?? item.unit}
                            onChange={e => setEditItem({ ...editItem, unit: e.target.value })}
                            className="w-16 px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                        ) : item.unit}
                      </td>
                      <td className={cn("px-4 py-2 text-right", sortedBg('defaultPrice'))}>
                        <input type="number" min={0} step={0.5}
                          value={defaultPrices[item.code] ?? item.defaultPrice}
                          onChange={e => updateDefaultPrice(item.code, sanitizeNumber(e.target.value))}
                          className="w-20 px-2 py-1 border border-slate-200 rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {editingCode === item.code ? (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleSaveEdit(item.code)}
                              className="text-emerald-600 hover:text-emerald-800 p-1">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setEditingCode(null); setEditItem({}) }}
                              className="text-slate-400 hover:text-slate-600 p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleStartEdit(item)}
                              className="text-slate-400 hover:text-blue-600 p-1">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteItem(item.code, item.name)}
                              className="text-slate-400 hover:text-red-500 p-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                  {filteredItems.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-400">ไม่พบรายการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* 185.1 (revised): floating total bar */}
          <FloatingTotalBar show={filteredItems.length > 0}>
            <span>รวม {filteredItems.length} รายการ</span>
          </FloatingTotalBar>
        </div>
      )}

      {/* Categories Tab */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-slate-700">หมวดหมู่ผ้า ({linenCategories.length} หมวด)</h3>
                <p className="text-xs text-slate-400 mt-0.5">เพิ่ม/แก้ไข/ลบหมวดหมู่ผ้า</p>
              </div>
              <div className="flex items-center gap-2">
                {/* 173.1: reorder mode toggle for categories */}
                <button onClick={() => setCatReorderMode(m => !m)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors border',
                    catReorderMode
                      ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                  )}>
                  {catReorderMode
                    ? <><Check className="w-3.5 h-3.5" />เสร็จสิ้น</>
                    : <><ArrowUpDown className="w-3.5 h-3.5" />จัดลำดับใหม่</>}
                </button>
                <button onClick={() => { setShowAddCat(true); setNewCatKey(''); setNewCatLabel('') }}
                  disabled={catReorderMode}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#3DD8D8] text-[#1B3A5C] text-xs rounded-lg hover:bg-[#2bb8b8] transition-colors disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" />เพิ่มหมวด
                </button>
              </div>
            </div>
            {catReorderMode && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <span className="font-semibold">โหมดจัดลำดับ:</span>
                จับ <span className="font-mono px-1.5 py-0.5 bg-white border border-amber-300 rounded">⋮⋮</span> ลากลงไปยังตำแหน่งที่ต้องการ — กด &quot;เสร็จสิ้น&quot; เมื่อจัดเสร็จ
              </div>
            )}

            {/* Add Category Form */}
            {showAddCat && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                <p className="text-sm font-medium text-blue-800 mb-2">เพิ่มหมวดใหม่</p>
                <div className="flex flex-wrap gap-2 text-sm">
                  <input value={newCatKey} onChange={e => setNewCatKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="key (เช่น spa_linen)"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm w-40 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                    placeholder="ชื่อหมวด (ไทย)"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm w-48 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  <button onClick={handleAddCategory} disabled={!newCatKey || !newCatLabel}
                    className="px-3 py-1.5 bg-[#3DD8D8] text-[#1B3A5C] text-xs rounded hover:bg-[#2bb8b8] disabled:opacity-50 transition-colors flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />บันทึก
                  </button>
                  <button onClick={() => setShowAddCat(false)}
                    className="px-3 py-1.5 text-slate-600 text-xs hover:bg-slate-100 rounded transition-colors flex items-center gap-1">
                    <X className="w-3.5 h-3.5" />ยกเลิก
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="w-10 px-2 py-2"></th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Key</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อหมวด</th>
                  <th className="text-center px-4 py-2 font-medium text-slate-600">จำนวนรายการ</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {sortedCategories.map((cat, idx) => {
                  const itemCount = linenCatalog.filter(i => i.category === cat.key).length
                  const isDragging = dragCatKey === cat.key
                  const isDragOver = dragOverCatKey === cat.key && dragCatKey !== cat.key
                  return (
                    <tr key={cat.key}
                      draggable={catReorderMode}
                      onDragStart={catReorderMode ? (e) => { setDragCatKey(cat.key); e.dataTransfer.effectAllowed = 'move' } : undefined}
                      onDragEnter={catReorderMode ? () => setDragOverCatKey(cat.key) : undefined}
                      onDragOver={catReorderMode ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
                      onDragEnd={catReorderMode ? () => { setDragCatKey(null); setDragOverCatKey(null) } : undefined}
                      onDrop={catReorderMode ? (e) => {
                        e.preventDefault()
                        if (dragCatKey) handleReorderDropCat(dragCatKey, cat.key)
                        setDragCatKey(null); setDragOverCatKey(null)
                      } : undefined}
                      className={cn(
                        'border-t border-slate-100 hover:bg-slate-50',
                        catReorderMode && 'select-none',
                        isDragging && 'opacity-40',
                        isDragOver && 'border-t-2 border-t-amber-500 bg-amber-50',
                      )}>
                      <td className="px-1 py-2 text-center">
                        {catReorderMode ? (
                          <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-amber-500 hover:text-amber-600">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <button onClick={() => handleMoveCat(cat.key, 'up')} disabled={idx === 0}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-0.5">
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleMoveCat(cat.key, 'down')} disabled={idx === sortedCategories.length - 1}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-0.5">
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{cat.key}</td>
                      <td className="px-4 py-2 text-slate-700">
                        {editingCatKey === cat.key ? (
                          <div className="flex gap-1 items-center">
                            <input value={editCatLabel}
                              onChange={e => setEditCatLabel(e.target.value)}
                              className="px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                            <button onClick={() => { updateCategory(cat.key, { label: editCatLabel }); setEditingCatKey(null) }}
                              className="text-emerald-600 hover:text-emerald-800 p-1">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingCatKey(null)}
                              className="text-slate-400 hover:text-slate-600 p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : cat.label}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          itemCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                          {itemCount}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => { setEditingCatKey(cat.key); setEditCatLabel(cat.label) }}
                            className="text-slate-400 hover:text-blue-600 p-1">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteCat(cat)}
                            className="text-slate-400 hover:text-red-500 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 174 ขั้น 2: Merge Codes Tool tab */}
      {tab === 'merge' && (
        <MergeCodesTool />
      )}

      {/* 188 ขั้น A: Sync Names Tool tab */}
      {tab === 'sync' && (
        <SyncNamesTool initialFocusCode={syncFocusCode} />
      )}

      {/* 154.1: Items Print List Modal */}
      <Modal open={showItemPrintList} onClose={() => setShowItemPrintList(false)} title="รายการผ้า" size="xl" closeLabel="close" className="print-target">
        {(() => {
          const handleCSV = () => {
            const headers = ['ลำดับ', 'รหัส', 'ชื่อรายการ', 'ชื่ออังกฤษ', 'หมวดหมู่', 'หน่วย', 'ราคา default']
            const rows = filteredItems.map((it, i) => [
              String(i+1), it.code, it.name, it.nameEn || '', getCategoryLabel(it.category) || it.category, it.unit, String(it.defaultPrice ?? 0)
            ])
            exportCSV(headers, rows, 'รายการผ้า')
          }
          return (
            <div>
              <div className="mb-2 text-sm text-slate-500">ทั้งหมด {filteredItems.length} รายการ</div>
              <div id="print-item-list" className="border border-slate-200 rounded-lg overflow-hidden">
                <h2 className="hidden print:block text-lg font-bold text-center mb-2">รายการผ้า</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-3 py-2 font-medium text-slate-600 w-12">ลำดับ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อรายการ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่ออังกฤษ</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">หมวด</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">หน่วย</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">ราคา default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it, idx) => (
                      <tr key={it.code} className="border-t border-slate-100">
                        <td className="text-center px-3 py-1.5 text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{it.code}</td>
                        <td className="px-3 py-1.5 text-slate-800">{it.name}</td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">{it.nameEn || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">{getCategoryLabel(it.category) || it.category}</td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">{it.unit}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{(it.defaultPrice ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-4">
                <ExportButtons targetId="print-item-list" filename="รายการผ้า" onExportCSV={handleCSV} />
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
