'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { cn, formatCurrency } from '@/lib/utils'
import type { Customer } from '@/types'
import { Plus, Search, Building2, Phone, Mail, Edit2, Trash2, Check } from 'lucide-react'
import Modal from '@/components/Modal'

const EMPTY_CUSTOMER: Omit<Customer, 'id' | 'createdAt'> = {
  name: '', nameEn: '', address: '', taxId: '', branch: 'สำนักงานใหญ่',
  contactName: '', contactPhone: '', contactEmail: '',
  creditDays: 30, billingModel: 'per_piece', monthlyFlatRate: 0,
  enabledItems: [], priceList: [],
  notes: '', isActive: true,
}

export default function CustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, defaultPrices, linenCatalog } = useStore()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_CUSTOMER)

  const filtered = useMemo(() => {
    if (!search) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q) || c.contactName.toLowerCase().includes(q)
    )
  }, [customers, search])

  const handleEdit = (c: Customer) => {
    setEditId(c.id)
    setForm({
      name: c.name, nameEn: c.nameEn, address: c.address, taxId: c.taxId, branch: c.branch,
      contactName: c.contactName, contactPhone: c.contactPhone, contactEmail: c.contactEmail,
      creditDays: c.creditDays, billingModel: c.billingModel, monthlyFlatRate: c.monthlyFlatRate,
      enabledItems: [...c.enabledItems], priceList: [...c.priceList],
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
    setForm({
      ...form,
      priceList: form.priceList.map(p => p.code === code ? { ...p, price } : p),
    })
  }

  const activeItems = linenCatalog

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ลูกค้า (โรงแรม)</h1>
          <p className="text-sm text-slate-500 mt-0.5">{customers.length} โรงแรม</p>
        </div>
        <button onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />
          เพิ่มลูกค้า
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อโรงแรม..."
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(c => (
          <div key={c.id} className={cn(
            'bg-white rounded-xl border p-5 transition-shadow hover:shadow-md',
            c.isActive ? 'border-slate-200' : 'border-red-200 bg-red-50/30'
          )}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-[#e8eef5] flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-[#1B3A5C]" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 leading-tight">{c.name}</h3>
                  <p className="text-xs text-slate-400">{c.nameEn}</p>
                </div>
              </div>
              <span className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full',
                c.billingModel === 'monthly_flat' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              )}>
                {c.billingModel === 'monthly_flat' ? `เหมา ${formatCurrency(c.monthlyFlatRate)}` : 'ตามชิ้น'}
              </span>
            </div>

            <div className="space-y-1.5 text-sm text-slate-600 mb-3">
              <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" />{c.contactPhone}</div>
              <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400" />{c.contactEmail || '-'}</div>
              <div className="text-xs text-slate-400">เครดิต {c.creditDays} วัน | รายการ {c.enabledItems.length} ชนิด</div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => handleEdit(c)}
                className="flex-1 text-xs py-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors flex items-center justify-center gap-1">
                <Edit2 className="w-3 h-3" />แก้ไข
              </button>
              <button onClick={() => { if (confirm('ลบลูกค้านี้?')) deleteCustomer(c.id) }}
                className="text-xs py-1.5 px-3 text-red-500 hover:bg-red-50 rounded transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

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
              <input type="number" value={form.creditDays} onChange={e => setForm({ ...form, creditDays: parseInt(e.target.value) || 30 })}
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
                <span>เหมาเดือน</span>
              </label>
            </div>
            {form.billingModel === 'monthly_flat' && (
              <div>
                <label className="block text-sm text-slate-600 mb-1">ค่าเหมารายเดือน (บาท)</label>
                <input type="number" value={form.monthlyFlatRate}
                  onChange={e => setForm({ ...form, monthlyFlatRate: parseFloat(e.target.value) || 0 })}
                  className="w-48 px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              </div>
            )}
          </div>

          {/* Enabled Items */}
          <div>
            <label className="block font-medium text-slate-700 mb-2">รายการผ้าที่โรงแรมนี้ใช้</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="w-10 px-3 py-2"></th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รหัส</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">รายการ</th>
                    {form.billingModel === 'per_piece' && (
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-28">ราคา/ชิ้น</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activeItems.map(item => {
                    const enabled = form.enabledItems.includes(item.code)
                    const priceItem = form.priceList.find(p => p.code === item.code)
                    return (
                      <tr key={item.code} className={cn('border-t border-slate-100', enabled && 'bg-blue-50/30')}>
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked={enabled} onChange={() => toggleItem(item.code)} className="rounded" />
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{item.code}</td>
                        <td className="px-3 py-1.5">{item.name}</td>
                        {form.billingModel === 'per_piece' && (
                          <td className="px-3 py-1.5 text-right">
                            {enabled ? (
                              <input type="number" min={0} step={0.5} value={priceItem?.price ?? 0}
                                onChange={e => updatePrice(item.code, parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 border border-slate-200 rounded text-right text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
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
