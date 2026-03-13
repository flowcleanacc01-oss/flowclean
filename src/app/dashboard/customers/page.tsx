'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { cn, formatCurrency, sanitizeNumber } from '@/lib/utils'
import type { Customer, CustomerCategoryDef } from '@/types'
import { Plus, Search, Edit2, Trash2, Check, ChevronUp, ChevronDown, FileText, Users, Eye, X, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/Modal'
import SortableHeader from '@/components/SortableHeader'

type PageTab = 'customers' | 'categories'
type SortKey = 'name' | 'customerType' | 'billingModel' | 'creditDays' | 'enabledItems' | 'isActive'

const EMPTY_CUSTOMER: Omit<Customer, 'id' | 'createdAt'> = {
  customerCode: '', customerType: 'hotel',
  name: '', nameEn: '', address: '', taxId: '', branch: 'สำนักงานใหญ่',
  contactName: '', contactPhone: '', contactEmail: '',
  creditDays: 30, billingModel: 'per_piece', monthlyFlatRate: 0, minPerTrip: 0, selectedBankAccountId: '',
  enabledItems: [], priceList: [], priceHistory: [],
  notes: '', isActive: true,
}

export default function CustomersPage() {
  const {
    customers, addCustomer, updateCustomer, deleteCustomer, defaultPrices, linenCatalog,
    quotations, linenForms, deliveryNotes, billingStatements, checklists, taxInvoices, companyInfo,
    customerCategories, addCustomerCategory, updateCustomerCategory, deleteCustomerCategory, getCustomerCategoryLabel,
  } = useStore()

  const hasDocuments = (custId: string) => {
    return linenForms.some(f => f.customerId === custId)
      || deliveryNotes.some(d => d.customerId === custId)
      || billingStatements.some(b => b.customerId === custId)
      || checklists.some(c => c.customerId === custId)
      || taxInvoices.some(t => t.customerId === custId)
  }

  const [pageTab, setPageTab] = useState<PageTab>('customers')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('all')
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [showQuotationSelect, setShowQuotationSelect] = useState(false)
  const [showCustomerSelect, setShowCustomerSelect] = useState(false)

  // Category tab state
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatKey, setNewCatKey] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [editingCatKey, setEditingCatKey] = useState<string | null>(null)
  const [editCatLabel, setEditCatLabel] = useState('')

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let list = [...customers]
    if (filterCat !== 'all') list = list.filter(c => c.customerType === filterCat)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) || c.customerCode.toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'name': va = a.name; vb = b.name; break
        case 'customerType': va = getCustomerCategoryLabel(a.customerType); vb = getCustomerCategoryLabel(b.customerType); break
        case 'billingModel': va = a.billingModel; vb = b.billingModel; break
        case 'creditDays': va = a.creditDays; vb = b.creditDays; break
        case 'enabledItems': va = a.enabledItems.length; vb = b.enabledItems.length; break
        case 'isActive': va = a.isActive ? 0 : 1; vb = b.isActive ? 0 : 1; break
        default: va = a.name; vb = b.name
      }
      const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [customers, filterCat, search, sortKey, sortDir, getCustomerCategoryLabel])

  const handleEdit = (c: Customer) => {
    setEditId(c.id)
    setForm({
      customerCode: c.customerCode, customerType: c.customerType,
      name: c.name, nameEn: c.nameEn, address: c.address, taxId: c.taxId, branch: c.branch,
      contactName: c.contactName, contactPhone: c.contactPhone, contactEmail: c.contactEmail,
      creditDays: c.creditDays, billingModel: c.billingModel, monthlyFlatRate: c.monthlyFlatRate, minPerTrip: c.minPerTrip ?? 0, selectedBankAccountId: c.selectedBankAccountId ?? '',
      enabledItems: [...c.enabledItems], priceList: [...c.priceList], priceHistory: [...c.priceHistory],
      notes: c.notes, isActive: c.isActive,
    })
    setShowForm(true)
  }

  const handleNew = () => {
    setEditId(null)
    setForm({ ...EMPTY_CUSTOMER, enabledItems: [], priceList: [] })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.name) return
    if (editId) {
      updateCustomer(editId, form)
    } else {
      addCustomer(form)
    }
    setShowForm(false)
  }

  const toggleItem = (code: string) => {
    const enabled = form.enabledItems.includes(code)
    const newEnabled = enabled
      ? form.enabledItems.filter(c => c !== code)
      : [...form.enabledItems, code]
    const newPriceList = enabled
      ? form.priceList.filter(p => p.code !== code)
      : [...form.priceList, { code, price: defaultPrices[code] || 0 }]
    setForm({ ...form, enabledItems: newEnabled, priceList: newPriceList })
  }

  const updatePrice = (code: string, price: number) => {
    setForm({ ...form, priceList: form.priceList.map(p => p.code === code ? { ...p, price } : p) })
  }

  const moveItem = (code: string, direction: 'up' | 'down') => {
    const idx = form.enabledItems.indexOf(code)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= form.enabledItems.length) return
    const arr = [...form.enabledItems]
    ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
    setForm({ ...form, enabledItems: arr })
  }

  const loadFromQuotation = (quotationId: string) => {
    const q = quotations.find(x => x.id === quotationId)
    if (!q) return
    setForm({ ...form, enabledItems: q.items.map(i => i.code), priceList: q.items.map(i => ({ code: i.code, price: i.pricePerUnit })) })
    setShowQuotationSelect(false)
  }

  const loadFromCustomer = (customerId: string) => {
    const c = customers.find(x => x.id === customerId)
    if (!c) return
    setForm({ ...form, enabledItems: [...c.enabledItems], priceList: [...c.priceList] })
    setShowCustomerSelect(false)
  }

  const enabledItemsList = form.enabledItems
    .map(code => linenCatalog.find(i => i.code === code))
    .filter((i): i is NonNullable<typeof i> => !!i)
  const uncheckedItems = linenCatalog.filter(i => !form.enabledItems.includes(i.code))

  // Category CRUD
  const handleAddCategory = () => {
    if (!newCatKey || !newCatLabel) return
    const maxOrder = customerCategories.reduce((m, c) => Math.max(m, c.sortOrder), 0)
    addCustomerCategory({ key: newCatKey.toLowerCase().replace(/\s+/g, '_'), label: newCatLabel, sortOrder: maxOrder + 1 })
    setNewCatKey('')
    setNewCatLabel('')
    setShowAddCat(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ลูกค้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">{customers.length} ราย</p>
        </div>
        <div className="flex gap-2">
          {(['customers', 'categories'] as const).map(t => (
            <button key={t} onClick={() => setPageTab(t)}
              className={cn('px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                pageTab === t ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {t === 'customers' ? 'ลูกค้า' : 'หมวด'}
            </button>
          ))}
          {pageTab === 'customers' && (
            <button onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 bg-[#3DD8D8] text-[#1B3A5C] rounded-lg hover:bg-[#2bb8b8] transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" />เพิ่มลูกค้า
            </button>
          )}
        </div>
      </div>

      {/* ===== Customers Tab ===== */}
      {pageTab === 'customers' && (
        <>
          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า, รหัส..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setFilterCat('all')}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  filterCat === 'all' ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                ทั้งหมด
              </button>
              {customerCategories.sort((a, b) => a.sortOrder - b.sortOrder).map(cat => (
                <button key={cat.key} onClick={() => setFilterCat(cat.key)}
                  className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    filterCat === cat.key ? 'bg-[#1B3A5C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <SortableHeader label="ชื่อลูกค้า" sortKey="name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="หมวด" sortKey="customerType" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-left" />
                    <SortableHeader label="รูปแบบบิล" sortKey="billingModel" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                    <SortableHeader label="เครดิต" sortKey="creditDays" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                    <SortableHeader label="รายการผ้า" sortKey="enabledItems" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-right" />
                    <th className="px-4 py-3 font-medium text-slate-600 text-left">ผู้ติดต่อ</th>
                    <SortableHeader label="สถานะ" sortKey="isActive" currentSortKey={sortKey} currentSortDir={sortDir} onSort={handleSort} className="text-center" />
                    <th className="px-4 py-3 font-medium text-slate-600 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-400">ไม่พบข้อมูล</td></tr>
                  ) : filtered.map(c => (
                    <tr key={c.id} className={cn('border-b border-slate-100 hover:bg-slate-50',
                      !c.isActive && 'bg-red-50/30')}>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-slate-800 hover:text-[#1B3A5C] hover:underline">{c.name}</Link>
                        {c.nameEn && <p className="text-[10px] text-slate-400">{c.nameEn}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{getCustomerCategoryLabel(c.customerType)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                          c.billingModel === 'monthly_flat' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                          {c.billingModel === 'monthly_flat' ? `ขั้นต่ำ/ด. ${formatCurrency(c.monthlyFlatRate)}` : 'ตามชิ้น'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{c.creditDays} วัน</td>
                      <td className="px-4 py-3 text-right text-slate-600">{c.enabledItems.length}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {c.contactName && <span>{c.contactName}</span>}
                        {c.contactPhone && <span className="ml-1 text-slate-400">{c.contactPhone}</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                          c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                          {c.isActive ? 'ใช้งาน' : 'ปิด'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/customers/${c.id}`}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-[#1B3A5C]">
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={() => handleEdit(c)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-[#1B3A5C]">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => {
                            if (hasDocuments(c.id)) {
                              alert('ไม่สามารถลบได้ — ลูกค้านี้มีเอกสารที่เกี่ยวข้อง\nปิดใช้งานแทน (แก้ไข → สถานะ = ปิด)')
                              return
                            }
                            if (confirm('ลบลูกค้านี้?')) deleteCustomer(c.id)
                          }}
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== Categories Tab ===== */}
      {pageTab === 'categories' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-slate-700">หมวดลูกค้า</h3>
            <button onClick={() => setShowAddCat(true)}
              className="px-3 py-1.5 text-xs bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] flex items-center gap-1">
              <Plus className="w-3 h-3" />เพิ่มหมวด
            </button>
          </div>

          {showAddCat && (
            <div className="flex gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
              <input value={newCatKey} onChange={e => setNewCatKey(e.target.value)} placeholder="key (เช่น hotel)"
                className="px-3 py-1.5 border border-slate-200 rounded text-sm flex-1 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} placeholder="ชื่อ (เช่น โรงแรม)"
                className="px-3 py-1.5 border border-slate-200 rounded text-sm flex-1 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <button onClick={handleAddCategory} disabled={!newCatKey || !newCatLabel}
                className="px-3 py-1.5 bg-[#1B3A5C] text-white text-xs rounded hover:bg-[#122740] disabled:opacity-50">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowAddCat(false); setNewCatKey(''); setNewCatLabel('') }}
                className="px-2 py-1.5 text-slate-400 hover:text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2 font-medium text-slate-600">Key</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อหมวด</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">ลำดับ</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">จำนวนลูกค้า</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {customerCategories.sort((a, b) => a.sortOrder - b.sortOrder).map(cat => {
                const count = customers.filter(c => c.customerType === cat.key).length
                return (
                  <tr key={cat.key} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{cat.key}</td>
                    <td className="px-4 py-2">
                      {editingCatKey === cat.key ? (
                        <div className="flex gap-1">
                          <input value={editCatLabel} onChange={e => setEditCatLabel(e.target.value)} autoFocus
                            className="px-2 py-1 border border-slate-200 rounded text-sm flex-1 focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                          <button onClick={() => { updateCustomerCategory(cat.key, { label: editCatLabel }); setEditingCatKey(null) }}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingCatKey(null)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <span>{cat.label}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{cat.sortOrder}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{count}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditingCatKey(cat.key); setEditCatLabel(cat.label) }}
                          className="p-1 text-slate-400 hover:text-[#1B3A5C] rounded hover:bg-slate-100">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => {
                          if (count > 0) { alert(`ไม่สามารถลบได้ — มีลูกค้า ${count} รายในหมวดนี้`); return }
                          if (confirm(`ลบหมวด "${cat.label}"?`)) deleteCustomerCategory(cat.key)
                        }}
                          className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'} size="xl">
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อ (ไทย) *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อ (อังกฤษ)</label>
              <input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">หมวดลูกค้า</label>
              <select value={form.customerType} onChange={e => setForm({ ...form, customerType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                {customerCategories.sort((a, b) => a.sortOrder - b.sortOrder).map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">สถานะ</label>
              <select value={form.isActive ? 'active' : 'inactive'}
                onChange={e => setForm({ ...form, isActive: e.target.value === 'active' })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="active">ใช้งาน</option>
                <option value="inactive">ปิดใช้งาน</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-600 mb-1">ที่อยู่</label>
            <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">เลขผู้เสียภาษี</label>
              <input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">สาขา</label>
              <input value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">เครดิต (วัน)</label>
              <input type="number" value={form.creditDays} onChange={e => setForm({ ...form, creditDays: sanitizeNumber(e.target.value, 365) || 30 })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-600 mb-1">ผู้ติดต่อ</label>
              <input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">โทรศัพท์</label>
              <input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">อีเมล</label>
              <input value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {/* Billing Model */}
          <div className="bg-slate-50 rounded-lg p-4">
            <label className="block font-medium text-slate-700 mb-2">รูปแบบการคิดเงิน</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="billing" checked={form.billingModel === 'per_piece'}
                  onChange={() => setForm({ ...form, billingModel: 'per_piece', monthlyFlatRate: 0 })}
                  className="accent-[#1B3A5C]" />
                <span>คิดตามชิ้น</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="billing" checked={form.billingModel === 'monthly_flat'}
                  onChange={() => setForm({ ...form, billingModel: 'monthly_flat' })}
                  className="accent-[#1B3A5C]" />
                <span>เหมาขั้นต่ำ/เดือน</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">เหมาขั้นต่ำ/ครั้ง (บาท)</label>
                <input type="number" value={form.minPerTrip}
                  onChange={e => setForm({ ...form, minPerTrip: sanitizeNumber(e.target.value) })}
                  placeholder="0 = ไม่กำหนด"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
              {form.billingModel === 'monthly_flat' && (
                <div>
                  <label className="block text-sm text-slate-600 mb-1">เหมาขั้นต่ำ/เดือน (บาท)</label>
                  <input type="number" value={form.monthlyFlatRate}
                    onChange={e => setForm({ ...form, monthlyFlatRate: sanitizeNumber(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                </div>
              )}
            </div>
          </div>

          {/* Bank Account Selection */}
          {companyInfo.bankAccounts && companyInfo.bankAccounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">บัญชีธนาคาร (แสดงในใบแจ้งหนี้)</label>
              <select value={form.selectedBankAccountId}
                onChange={e => setForm({ ...form, selectedBankAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="">ค่าเริ่มต้น</option>
                {companyInfo.bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>{ba.bankName} — {ba.accountNumber}{ba.isDefault ? ' (ค่าเริ่มต้น)' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Load from Quotation / Customer */}
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button type="button" onClick={() => { setShowQuotationSelect(!showQuotationSelect); setShowCustomerSelect(false) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                <FileText className="w-3.5 h-3.5" />โหลดจากใบเสนอราคา
              </button>
              {showQuotationSelect && (
                <div className="absolute z-20 mt-1 left-0 w-72 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {quotations.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">ไม่มีใบเสนอราคา</div>
                  ) : quotations.map(q => (
                    <button key={q.id} type="button" onClick={() => loadFromQuotation(q.id)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <span className="font-medium">{q.quotationNumber}</span>
                      <span className="text-slate-400 ml-2">{q.customerName}</span>
                      <span className="text-slate-400 ml-1">({q.items.length} รายการ)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button type="button" onClick={() => { setShowCustomerSelect(!showCustomerSelect); setShowQuotationSelect(false) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                <Users className="w-3.5 h-3.5" />โหลดจากลูกค้าอื่น
              </button>
              {showCustomerSelect && (
                <div className="absolute z-20 mt-1 left-0 w-64 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {customers.filter(c => c.id !== editId && c.enabledItems.length > 0).length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">ไม่มีลูกค้าอื่น</div>
                  ) : customers.filter(c => c.id !== editId && c.enabledItems.length > 0).map(c => (
                    <button key={c.id} type="button" onClick={() => loadFromCustomer(c.id)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-slate-400 ml-2">({c.enabledItems.length} รายการ)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Enabled Items */}
          <div>
            <label className="block font-medium text-slate-700 mb-2">รายการผ้าที่ลูกค้านี้ใช้</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="w-10 px-3 py-2"></th>
                    <th className="w-16 px-1 py-2"></th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                    {form.billingModel === 'per_piece' && (
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ราคา/ชิ้น</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {enabledItemsList.map((item, idx) => {
                    const priceItem = form.priceList.find(p => p.code === item.code)
                    return (
                      <tr key={item.code} className="border-t border-slate-100 bg-blue-50/30">
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked onChange={() => toggleItem(item.code)} className="rounded" />
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button type="button" onClick={() => moveItem(item.code, 'up')} disabled={idx === 0}
                              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 disabled:cursor-default transition-colors">
                              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button type="button" onClick={() => moveItem(item.code, 'down')} disabled={idx === enabledItemsList.length - 1}
                              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 disabled:cursor-default transition-colors">
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                        <td className="px-3 py-1.5">{item.name}</td>
                        {form.billingModel === 'per_piece' && (
                          <td className="px-3 py-1.5 text-right">
                            <input type="number" min={0} step={0.5} value={priceItem?.price ?? 0}
                              onChange={e => updatePrice(item.code, sanitizeNumber(e.target.value))}
                              className="w-20 px-2 py-1 border border-slate-200 rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {enabledItemsList.length > 0 && uncheckedItems.length > 0 && (
                    <tr><td colSpan={form.billingModel === 'per_piece' ? 5 : 4} className="border-t-2 border-slate-200"></td></tr>
                  )}
                  {uncheckedItems.map(item => (
                    <tr key={item.code} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-center">
                        <input type="checkbox" checked={false} onChange={() => toggleItem(item.code)} className="rounded" />
                      </td>
                      <td className="px-1 py-1.5"></td>
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                      <td className="px-3 py-1.5 text-slate-400">{item.name}</td>
                      {form.billingModel === 'per_piece' && (
                        <td className="px-3 py-1.5 text-right"><span className="text-slate-300">-</span></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={handleSave} disabled={!form.name}
              className="px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors font-medium flex items-center gap-1">
              <Check className="w-4 h-4" />บันทึก
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
