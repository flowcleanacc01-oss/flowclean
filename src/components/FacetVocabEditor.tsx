'use client'

/**
 * 255 Phase 2 — Facet Vocabulary Editor (admin UI)
 *
 * Edits store.facetVocab (loaded from app_settings.facet_vocab).
 * Save → updateFacetVocab(local) → DB write via /api/db
 * Reset → resetFacetVocab() → DB write DEFAULT_FACET_VOCAB
 *
 * Sub-tabs:
 *   - Types & Groups   (most important — drag-drop within groups)
 *   - Applications     (per-type subtypes)
 *   - Color / Pattern / Material / Weight / Treatment (list editors)
 *   - Sizes            (5 size families: bed / pillow / towel / uniform / generic)
 */
import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import {
  type FacetVocab, type FacetVocabGroup, type FacetOption, type SizePresetFamily,
  DEFAULT_FACET_VOCAB,
} from '@/lib/linen-vocabulary'
import type { LinenItemDef } from '@/types'
import { cn } from '@/lib/utils'
import Modal from '@/components/Modal'
import {
  Plus, Edit2, Trash2, Save, RotateCcw, AlertTriangle,
  ChevronDown, ChevronRight, GripVertical, Check, X,
} from 'lucide-react'

type SubTab = 'types' | 'apps' | 'color' | 'pattern' | 'material' | 'weight' | 'treatment' | 'sizes' | 'suggest'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'types', label: 'ประเภทผ้า + กลุ่ม' },
  { key: 'suggest', label: '🔍 Auto-Suggest' },
  { key: 'apps', label: 'ลักษณะ (per type)' },
  { key: 'color', label: 'สี' },
  { key: 'pattern', label: 'ลาย' },
  { key: 'material', label: 'วัสดุ' },
  { key: 'weight', label: 'น้ำหนัก' },
  { key: 'treatment', label: 'พิเศษ' },
  { key: 'sizes', label: 'ขนาด' },
]

export default function FacetVocabEditor() {
  const { facetVocab, updateFacetVocab, resetFacetVocab, linenCatalog } = useStore()
  const [local, setLocal] = useState<FacetVocab>(facetVocab)
  const [subTab, setSubTab] = useState<SubTab>('types')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Sync local state when store changes (e.g., other admin edits)
  useEffect(() => {
    if (!dirty) setLocal(facetVocab)
  }, [facetVocab, dirty])

  const markDirty = (updater: (v: FacetVocab) => FacetVocab) => {
    setLocal(prev => {
      const next = updater(prev)
      setDirty(true)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateFacetVocab(local)
      setDirty(false)
    } catch {
      alert('บันทึกไม่สำเร็จ — ลองอีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset Facet Vocabulary กลับเป็นค่าเริ่มต้น?\n\nการแก้ไขทั้งหมดจะหาย — Items ที่ใช้ types ปัจจุบันยังคงอยู่ แต่ทาง Wizard 2.0 จะแสดงตามค่า default หลัง reset')) return
    setSaving(true)
    try {
      await resetFacetVocab()
      setLocal(DEFAULT_FACET_VOCAB)
      setDirty(false)
    } catch {
      alert('Reset ไม่สำเร็จ — ลองอีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  // Usage count per type (for warning before delete)
  const typeUsage = useMemo(() => {
    const map: Record<string, number> = {}
    for (const it of linenCatalog) {
      const t = it.facets?.type
      if (t) map[t] = (map[t] || 0) + 1
    }
    return map
  }, [linenCatalog])

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              subTab === t.key ? 'border-[#1B3A5C] text-[#1B3A5C]' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {subTab === 'types' && (
          <TypesEditor vocab={local} setVocab={markDirty} usage={typeUsage} />
        )}
        {subTab === 'suggest' && (
          <SuggestTypesTab vocab={local} setVocab={markDirty} catalog={linenCatalog} />
        )}
        {subTab === 'apps' && (
          <ApplicationsEditor vocab={local} setVocab={markDirty} />
        )}
        {subTab === 'color' && (
          <ListEditor name="สี" options={local.colors}
            setOptions={opts => markDirty(v => ({ ...v, colors: opts }))} />
        )}
        {subTab === 'pattern' && (
          <ListEditor name="ลาย" options={local.patterns}
            setOptions={opts => markDirty(v => ({ ...v, patterns: opts }))} />
        )}
        {subTab === 'material' && (
          <ListEditor name="วัสดุ" options={local.materials}
            setOptions={opts => markDirty(v => ({ ...v, materials: opts }))} />
        )}
        {subTab === 'weight' && (
          <ListEditor name="น้ำหนัก" options={local.weights}
            setOptions={opts => markDirty(v => ({ ...v, weights: opts }))} />
        )}
        {subTab === 'treatment' && (
          <ListEditor name="พิเศษ (treatment)" options={local.treatments}
            setOptions={opts => markDirty(v => ({ ...v, treatments: opts }))} />
        )}
        {subTab === 'sizes' && (
          <SizesEditor vocab={local} setVocab={markDirty} />
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white border-t border-slate-200 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {dirty ? <span className="text-amber-600 font-medium">● แก้ไขแล้ว ยังไม่บันทึก</span> : 'ไม่มีการแก้ไข'}
          <span className="ml-3 text-slate-400">version {local.version}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button onClick={handleSave} disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] disabled:opacity-40">
            <Save className="w-3.5 h-3.5" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Types & Groups editor — drag-drop within groups + reorder groups
// ════════════════════════════════════════════════════════════════

function TypesEditor({ vocab, setVocab, usage }: {
  vocab: FacetVocab
  setVocab: (u: (v: FacetVocab) => FacetVocab) => void
  usage: Record<string, number>
}) {
  const [dragType, setDragType] = useState<string | null>(null)
  const [dragGroup, setDragGroup] = useState<string | null>(null)
  const [editingType, setEditingType] = useState<FacetOption | null>(null)
  const [editingGroup, setEditingGroup] = useState<FacetVocabGroup | null>(null)
  const [addToGroupKey, setAddToGroupKey] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const handleDropType = (targetGroupKey: string, targetTypeKey: string | null) => {
    if (!dragType) return
    setVocab(v => {
      const newGroups = v.groups.map(g => ({ ...g, typeKeys: [...g.typeKeys] }))
      // Remove dragType from all groups
      for (const g of newGroups) {
        g.typeKeys = g.typeKeys.filter(k => k !== dragType)
      }
      // Insert into target group at position (before targetTypeKey, or at end)
      const targetG = newGroups.find(g => g.key === targetGroupKey)
      if (targetG) {
        const idx = targetTypeKey ? targetG.typeKeys.indexOf(targetTypeKey) : targetG.typeKeys.length
        targetG.typeKeys.splice(idx >= 0 ? idx : targetG.typeKeys.length, 0, dragType)
      }
      return { ...v, groups: newGroups }
    })
    setDragType(null)
  }

  const handleDropGroup = (targetGroupKey: string) => {
    if (!dragGroup || dragGroup === targetGroupKey) return
    setVocab(v => {
      const src = v.groups.findIndex(g => g.key === dragGroup)
      const dst = v.groups.findIndex(g => g.key === targetGroupKey)
      if (src < 0 || dst < 0) return v
      const newGroups = [...v.groups]
      const [moved] = newGroups.splice(src, 1)
      newGroups.splice(dst, 0, moved)
      return { ...v, groups: newGroups }
    })
    setDragGroup(null)
  }

  const handleDeleteType = (typeKey: string) => {
    const count = usage[typeKey] || 0
    if (count > 0) {
      if (!confirm(`Type "${typeKey}" ถูกใช้โดย ${count} items ใน catalog\n\nลบ type นี้จะทำให้ items เหล่านั้นไม่สามารถ render ใน Wizard 2.0 facet ได้ถูกต้อง (ยังคง render ผ่าน name+code เดิม)\n\nยืนยันลบ?`)) return
    } else {
      if (!confirm(`ลบ type "${typeKey}"?`)) return
    }
    setVocab(v => ({
      ...v,
      types: v.types.filter(t => t.value !== typeKey),
      groups: v.groups.map(g => ({ ...g, typeKeys: g.typeKeys.filter(k => k !== typeKey) })),
      applicationsByType: Object.fromEntries(Object.entries(v.applicationsByType).filter(([k]) => k !== typeKey)),
      sizePresetByType: Object.fromEntries(Object.entries(v.sizePresetByType).filter(([k]) => k !== typeKey)),
    }))
  }

  const handleSaveType = (updated: FacetOption, isNew: boolean, groupKey: string | null) => {
    setVocab(v => {
      const types = isNew
        ? [...v.types, updated]
        : v.types.map(t => t.value === updated.value ? updated : t)
      let groups = v.groups
      if (isNew && groupKey) {
        groups = v.groups.map(g => g.key === groupKey
          ? { ...g, typeKeys: [...g.typeKeys, updated.value] }
          : g)
      }
      return { ...v, types, groups }
    })
    setEditingType(null)
    setAddToGroupKey(null)
  }

  const handleSaveGroup = (updated: FacetVocabGroup, isNew: boolean) => {
    setVocab(v => ({
      ...v,
      groups: isNew
        ? [...v.groups, updated]
        : v.groups.map(g => g.key === updated.key ? updated : g),
    }))
    setEditingGroup(null)
    setAddingGroup(false)
  }

  const handleDeleteGroup = (groupKey: string) => {
    const group = vocab.groups.find(g => g.key === groupKey)
    if (!group) return
    if (group.typeKeys.length > 0) {
      if (!confirm(`กลุ่ม "${group.labelTh}" มี ${group.typeKeys.length} types — ลบกลุ่มจะย้าย types ไป "อื่นๆ"\n\nยืนยันลบ?`)) return
    } else {
      if (!confirm(`ลบกลุ่ม "${group.labelTh}"?`)) return
    }
    setVocab(v => {
      // Move types to a "misc" or last group, or detach
      const orphanTypes = group.typeKeys
      const remaining = v.groups.filter(g => g.key !== groupKey)
      if (orphanTypes.length > 0 && remaining.length > 0) {
        const last = remaining[remaining.length - 1]
        last.typeKeys = [...last.typeKeys, ...orphanTypes]
      }
      return { ...v, groups: remaining }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">
          ⋮⋮ ลากเพื่อจัดลำดับ · คลิก type/group เพื่อแก้ไข · ลบจะ warn ถ้ามี items ใช้อยู่
        </p>
        <button
          onClick={() => setAddingGroup(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740]"
        >
          <Plus className="w-3.5 h-3.5" /> เพิ่มกลุ่มใหม่
        </button>
      </div>

      {vocab.groups.map(g => {
        const isCollapsed = collapsed.has(g.key)
        return (
          <div key={g.key}
            draggable
            onDragStart={() => setDragGroup(g.key)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDropGroup(g.key)}
            onDragEnd={() => setDragGroup(null)}
            className={cn('border border-slate-200 rounded-lg', dragGroup === g.key && 'opacity-50')}
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 rounded-t-lg">
              <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
              <button onClick={() => setCollapsed(prev => {
                const next = new Set(prev); if (next.has(g.key)) next.delete(g.key); else next.add(g.key); return next
              })} className="text-slate-500 hover:text-slate-700">
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <span className="text-sm font-medium text-slate-800 flex-1">
                {g.labelTh} <span className="text-xs text-slate-400">({g.typeKeys.length})</span>
              </span>
              <button onClick={() => setEditingGroup(g)} className="p-1 text-slate-400 hover:text-[#1B3A5C]" title="แก้ไขกลุ่ม">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDeleteGroup(g.key)} className="p-1 text-slate-400 hover:text-red-500" title="ลบกลุ่ม">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {!isCollapsed && (
              <div className="p-2 space-y-1">
                {g.typeKeys.map(typeKey => {
                  const t = vocab.types.find(x => x.value === typeKey)
                  if (!t) return null
                  const count = usage[typeKey] || 0
                  return (
                    <div key={typeKey}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDragType(typeKey) }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDropType(g.key, typeKey) }}
                      onDragEnd={() => setDragType(null)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-slate-200 hover:bg-slate-50',
                        dragType === typeKey && 'opacity-40',
                      )}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab" />
                      <span className="text-sm text-slate-700 flex-1">{t.labelTh}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{t.codeShort}</span>
                      {count > 0 && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{count} items</span>}
                      <button onClick={() => setEditingType(t)} className="p-1 text-slate-400 hover:text-[#1B3A5C]">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDeleteType(typeKey)} className="p-1 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
                <button onClick={() => setAddToGroupKey(g.key)}
                  className="w-full px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 rounded border border-dashed border-slate-200 inline-flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" /> เพิ่ม type ในกลุ่มนี้
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Edit/Add type modal */}
      {(editingType || addToGroupKey) && (
        <OptionEditModal
          initial={editingType || { value: '', labelTh: '', labelEn: '', codeShort: '' }}
          isNew={!editingType}
          onSave={(o) => handleSaveType(o, !editingType, addToGroupKey)}
          onClose={() => { setEditingType(null); setAddToGroupKey(null) }}
          title={editingType ? `แก้ไข type: ${editingType.labelTh}` : 'เพิ่ม type ใหม่'}
        />
      )}

      {/* Edit/Add group modal */}
      {(editingGroup || addingGroup) && (
        <GroupEditModal
          initial={editingGroup || { key: '', labelTh: '', typeKeys: [] }}
          isNew={!editingGroup}
          onSave={(g) => handleSaveGroup(g, !editingGroup)}
          onClose={() => { setEditingGroup(null); setAddingGroup(false) }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Applications editor — select type → CRUD its applications
// ════════════════════════════════════════════════════════════════

function ApplicationsEditor({ vocab, setVocab }: {
  vocab: FacetVocab
  setVocab: (u: (v: FacetVocab) => FacetVocab) => void
}) {
  const [selectedType, setSelectedType] = useState<string>(vocab.types[0]?.value || '')
  const apps = vocab.applicationsByType[selectedType] || []

  const updateApps = (newApps: FacetOption[]) => {
    setVocab(v => ({
      ...v,
      applicationsByType: { ...v.applicationsByType, [selectedType]: newApps },
    }))
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-600 block mb-1">เลือก Type</label>
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          {vocab.types.map(t => (
            <option key={t.value} value={t.value}>{t.labelTh}</option>
          ))}
        </select>
      </div>
      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500 mb-2">
          Applications สำหรับ <span className="font-medium text-[#1B3A5C]">{vocab.types.find(t => t.value === selectedType)?.labelTh}</span> ({apps.length})
        </p>
        <ListEditor name="application" options={apps} setOptions={updateApps} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Sizes editor — 5 size families
// ════════════════════════════════════════════════════════════════

const SIZE_FAMILIES: { key: SizePresetFamily; label: string }[] = [
  { key: 'bed', label: 'Bed (ฟุต)' },
  { key: 'pillow', label: 'Pillow (Std/King/Euro)' },
  { key: 'towel', label: 'Towel (WxH inches)' },
  { key: 'uniform', label: 'Uniform (S-3XL)' },
  { key: 'generic', label: 'Generic (เล็ก/กลาง/ใหญ่)' },
]

function SizesEditor({ vocab, setVocab }: {
  vocab: FacetVocab
  setVocab: (u: (v: FacetVocab) => FacetVocab) => void
}) {
  const [family, setFamily] = useState<SizePresetFamily>('bed')

  const updateSizes = (newOpts: FacetOption[]) => {
    setVocab(v => ({
      ...v,
      sizes: { ...v.sizes, [family]: newOpts },
    }))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {SIZE_FAMILIES.map(f => (
          <button key={f.key} onClick={() => setFamily(f.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              family === f.key ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="border-t border-slate-100 pt-3">
        <ListEditor name={`size (${family})`} options={vocab.sizes[family]} setOptions={updateSizes} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Generic List Editor — CRUD + drag-drop reorder
// ════════════════════════════════════════════════════════════════

function ListEditor({ name, options, setOptions }: {
  name: string
  options: FacetOption[]
  setOptions: (opts: FacetOption[]) => void
}) {
  const [editing, setEditing] = useState<FacetOption | null>(null)
  const [adding, setAdding] = useState(false)
  const [dragValue, setDragValue] = useState<string | null>(null)

  const handleDrop = (targetValue: string) => {
    if (!dragValue || dragValue === targetValue) return
    const src = options.findIndex(o => o.value === dragValue)
    const dst = options.findIndex(o => o.value === targetValue)
    if (src < 0 || dst < 0) return
    const next = [...options]
    const [moved] = next.splice(src, 1)
    next.splice(dst, 0, moved)
    setOptions(next)
    setDragValue(null)
  }

  const handleDelete = (value: string) => {
    if (!confirm(`ลบ "${value}"?`)) return
    setOptions(options.filter(o => o.value !== value))
  }

  const handleSave = (opt: FacetOption, isNew: boolean) => {
    if (isNew) setOptions([...options, opt])
    else setOptions(options.map(o => o.value === opt.value ? opt : o))
    setEditing(null)
    setAdding(false)
  }

  return (
    <div className="space-y-1.5">
      {options.map(o => (
        <div key={o.value}
          draggable
          onDragStart={() => setDragValue(o.value)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(o.value)}
          onDragEnd={() => setDragValue(null)}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded border border-slate-100 hover:bg-slate-50',
            dragValue === o.value && 'opacity-40',
          )}
        >
          <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab" />
          <span className="text-sm text-slate-700 flex-1">{o.labelTh}</span>
          <span className="text-[10px] text-slate-400 font-mono">{o.value} · {o.codeShort}</span>
          {o.labelEn && <span className="text-[10px] text-slate-400">{o.labelEn}</span>}
          <button onClick={() => setEditing(o)} className="p-1 text-slate-400 hover:text-[#1B3A5C]">
            <Edit2 className="w-3 h-3" />
          </button>
          <button onClick={() => handleDelete(o.value)} className="p-1 text-slate-400 hover:text-red-500">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button onClick={() => setAdding(true)}
        className="w-full px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 rounded border border-dashed border-slate-200 inline-flex items-center justify-center gap-1">
        <Plus className="w-3 h-3" /> เพิ่ม {name}
      </button>
      {(editing || adding) && (
        <OptionEditModal
          initial={editing || { value: '', labelTh: '', labelEn: '', codeShort: '' }}
          isNew={!editing}
          onSave={(o) => handleSave(o, !editing)}
          onClose={() => { setEditing(null); setAdding(false) }}
          title={editing ? `แก้ไข: ${editing.labelTh}` : `เพิ่ม ${name}`}
          existingValues={options.map(o => o.value).filter(v => v !== editing?.value)}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Edit modals
// ════════════════════════════════════════════════════════════════

function OptionEditModal({ initial, isNew, onSave, onClose, title, existingValues = [] }: {
  initial: FacetOption
  isNew: boolean
  onSave: (o: FacetOption) => void
  onClose: () => void
  title: string
  existingValues?: string[]
}) {
  const [value, setValue] = useState(initial.value)
  const [labelTh, setLabelTh] = useState(initial.labelTh)
  const [labelEn, setLabelEn] = useState(initial.labelEn || '')
  const [codeShort, setCodeShort] = useState(initial.codeShort)
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!value.trim()) { setError('value (key) ห้ามว่าง'); return }
    if (!labelTh.trim()) { setError('labelTh ห้ามว่าง'); return }
    if (isNew && existingValues.includes(value.trim())) { setError(`value "${value}" ซ้ำ`); return }
    onSave({ value: value.trim(), labelTh: labelTh.trim(), labelEn: labelEn.trim(), codeShort: codeShort.trim() })
  }

  return (
    <Modal open onClose={onClose} title={title} size="md" closeLabel="cancel">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Value (key)
            <span className="text-[10px] text-slate-400 ml-1">(unique, no spaces — เช่น `pants`)</span>
          </label>
          <input type="text" value={value} onChange={e => setValue(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
            disabled={!isNew}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none disabled:bg-slate-50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">ภาษาไทย *</label>
            <input type="text" value={labelTh} onChange={e => setLabelTh(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">English (optional)</label>
            <input type="text" value={labelEn} onChange={e => setLabelEn(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Code short
            <span className="text-[10px] text-slate-400 ml-1">(สำหรับ code generation — เช่น `PNT`)</span>
          </label>
          <input type="text" value={codeShort} onChange={e => setCodeShort(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />{error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-3.5 h-3.5 inline" /> ยกเลิก
          </button>
          <button onClick={handleSubmit} className="inline-flex items-center gap-1 px-4 py-1.5 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium">
            <Check className="w-3.5 h-3.5" /> บันทึก
          </button>
        </div>
      </div>
    </Modal>
  )
}

function GroupEditModal({ initial, isNew, onSave, onClose }: {
  initial: FacetVocabGroup
  isNew: boolean
  onSave: (g: FacetVocabGroup) => void
  onClose: () => void
}) {
  const [key, setKey] = useState(initial.key)
  const [labelTh, setLabelTh] = useState(initial.labelTh)
  const [labelEn, setLabelEn] = useState(initial.labelEn || '')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!key.trim()) { setError('key ห้ามว่าง'); return }
    if (!labelTh.trim()) { setError('labelTh ห้ามว่าง'); return }
    onSave({ key: key.trim(), labelTh: labelTh.trim(), labelEn: labelEn.trim() || undefined, typeKeys: initial.typeKeys })
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'เพิ่มกลุ่มใหม่' : `แก้ไขกลุ่ม: ${initial.labelTh}`} size="md" closeLabel="cancel">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Group key
            <span className="text-[10px] text-slate-400 ml-1">(unique — เช่น `bed`, `utility`)</span>
          </label>
          <input type="text" value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
            disabled={!isNew}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none disabled:bg-slate-50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">ชื่อกลุ่ม (ไทย) *</label>
            <input type="text" value={labelTh} onChange={e => setLabelTh(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">English (optional)</label>
            <input type="text" value={labelEn} onChange={e => setLabelEn(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />{error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-3.5 h-3.5 inline" /> ยกเลิก
          </button>
          <button onClick={handleSubmit} className="inline-flex items-center gap-1 px-4 py-1.5 text-sm bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] font-medium">
            <Check className="w-3.5 h-3.5" /> บันทึก
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════
// 257 — Auto-Suggest types from catalog
// Scan catalog items, identify those whose names don't match any
// existing vocab type's labelTh (substring heuristic). Group by
// leading Thai word → show patterns → button creates new type.
// ════════════════════════════════════════════════════════════════

function SuggestTypesTab({ vocab, setVocab, catalog }: {
  vocab: FacetVocab
  setVocab: (u: (v: FacetVocab) => FacetVocab) => void
  catalog: LinenItemDef[]
}) {
  const [addingForPattern, setAddingForPattern] = useState<string | null>(null)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>(vocab.groups[0]?.key || '')

  const analysis = useMemo(() => {
    const knownLabels = vocab.types
      .map(t => t.labelTh)
      .filter(l => l.length >= 2)
      .map(l => l.toLowerCase())
    const unmatched: LinenItemDef[] = []
    let matchedCount = 0

    for (const item of catalog) {
      if (item.facets?.type && vocab.types.some(t => t.value === item.facets!.type)) {
        matchedCount++
        continue
      }
      const nameLow = item.name.toLowerCase()
      const isMatched = knownLabels.some(l => nameLow.includes(l))
      if (isMatched) matchedCount++
      else unmatched.push(item)
    }

    const groups: Record<string, LinenItemDef[]> = {}
    for (const item of unmatched) {
      const m = item.name.match(/^[ก-๙]+/)
      const prefix = m ? m[0] : item.name.slice(0, 10).trim()
      const key = prefix.length >= 2 ? prefix : '(อื่นๆ)'
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }

    return {
      total: catalog.length,
      matchedCount,
      unmatchedCount: unmatched.length,
      groups: Object.entries(groups)
        .map(([prefix, items]) => ({ prefix, items, count: items.length }))
        .sort((a, b) => b.count - a.count),
    }
  }, [catalog, vocab.types])

  const buildPrefill = (prefix: string): FacetOption => ({
    value: prefix
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_ก-๙]/g, '')
      .slice(0, 24) || 'new_type',
    labelTh: prefix,
    labelEn: '',
    codeShort: prefix.slice(0, 3).toUpperCase() || 'NEW',
  })

  const handleSaveNewType = (opt: FacetOption) => {
    setVocab(v => {
      const types = [...v.types, opt]
      const groups = v.groups.map(g => g.key === selectedGroupKey
        ? { ...g, typeKeys: [...g.typeKeys, opt.value] }
        : g,
      )
      return { ...v, types, groups }
    })
    setAddingForPattern(null)
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <div className="font-semibold mb-1">🔍 Auto-Suggest จาก catalog ({analysis.total} items)</div>
        <div>
          <span className="text-emerald-700 font-medium">✓ Matched: {analysis.matchedCount}</span>
          {' · '}
          <span className="text-amber-700 font-medium">⚠ Unmatched: {analysis.unmatchedCount}</span>
        </div>
        <p className="text-blue-700 mt-1.5 leading-relaxed">
          แยกตามคำขึ้นต้น (Thai-only prefix) — แต่ละ pattern ที่ไม่ตรงกับ vocab type ใดๆ
          คลิก <strong>&quot;สร้าง type&quot;</strong> เพื่อเพิ่ม. ค่า value/codeShort prefill ให้ — แก้ได้ในกล่อง edit
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">เพิ่ม type ใหม่ลงในกลุ่ม:</span>
        <select value={selectedGroupKey} onChange={e => setSelectedGroupKey(e.target.value)}
          className="px-2 py-1 border border-slate-200 rounded-md bg-white text-xs">
          {vocab.groups.map(g => (
            <option key={g.key} value={g.key}>{g.labelTh}</option>
          ))}
        </select>
      </div>

      {analysis.groups.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          ✨ ทุก items ใน catalog match กับ vocab types แล้ว — ไม่มี pattern ใหม่ให้แนะนำ
        </div>
      ) : (
        <div className="space-y-2">
          {analysis.groups.map(g => (
            <div key={g.prefix} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-sm font-medium text-slate-800 flex-1">
                  &quot;{g.prefix}&quot; <span className="text-xs text-slate-400 ml-1">({g.count} items)</span>
                </span>
                <button onClick={() => setAddingForPattern(g.prefix)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#3DD8D8] text-[#1B3A5C] rounded hover:bg-[#2bb8b8] font-medium">
                  <Plus className="w-3 h-3" /> สร้าง type
                </button>
              </div>
              <div className="px-3 py-1.5 space-y-0.5">
                {g.items.slice(0, 5).map(item => (
                  <div key={item.code} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-slate-400 w-12">{item.code}</span>
                    <span className="text-slate-600 truncate">{item.name}</span>
                  </div>
                ))}
                {g.items.length > 5 && (
                  <div className="text-[11px] text-slate-400 italic">
                    + อีก {g.items.length - 5} items...
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {addingForPattern && (
        <OptionEditModal
          initial={buildPrefill(addingForPattern)}
          isNew={true}
          onSave={handleSaveNewType}
          onClose={() => setAddingForPattern(null)}
          title={`สร้าง type ใหม่จาก pattern "${addingForPattern}"`}
          existingValues={vocab.types.map(t => t.value)}
        />
      )}
    </div>
  )
}
