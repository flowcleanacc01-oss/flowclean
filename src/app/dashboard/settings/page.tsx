'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { LINEN_CATEGORIES, type LinenCategory, type LinenItemDef } from '@/types'
import { Plus, Trash2, RotateCcw, Edit2, Check, X } from 'lucide-react'

type TabKey = 'items' | 'users' | 'company' | 'documents'

const EMPTY_NEW_ITEM: LinenItemDef = {
  code: '', name: '', nameEn: '', category: 'other', unit: 'ชิ้น', defaultPrice: 0, sortOrder: 0,
}

export default function SettingsPage() {
  const {
    currentUser, defaultPrices, updateDefaultPrice,
    users, addUser, updateUser,
    companyInfo, updateCompanyInfo,
    linenCatalog, addLinenItem, updateLinenItem, deleteLinenItem,
  } = useStore()

  const [tab, setTab] = useState<TabKey>('items')

  // New user form
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff')

  // New item form
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState<LinenItemDef>(EMPTY_NEW_ITEM)

  // Inline editing
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<Partial<LinenItemDef>>({})

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'items', label: 'รายการผ้า' },
    { key: 'users', label: 'ผู้ใช้' },
    { key: 'company', label: 'บริษัท' },
    { key: 'documents', label: 'เอกสาร' },
  ]

  const handleAddUser = () => {
    if (!newName || !newEmail) return
    addUser({ name: newName, email: newEmail, role: newRole, isActive: true })
    setNewName('')
    setNewEmail('')
    setNewRole('staff')
  }

  const handleResetData = () => {
    if (confirm('ล้างข้อมูลทั้งหมดและใช้ข้อมูลตัวอย่าง?')) {
      localStorage.removeItem('flowclean_data_v2')
      window.location.reload()
    }
  }

  const handleAddItem = () => {
    if (!newItem.code || !newItem.name) return
    if (linenCatalog.some(i => i.code === newItem.code)) {
      alert('รหัสนี้มีอยู่แล้ว')
      return
    }
    const maxOrder = linenCatalog.reduce((max, i) => Math.max(max, i.sortOrder), 0)
    addLinenItem({ ...newItem, sortOrder: maxOrder + 1 })
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
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">ตั้งค่า</h1>
        <p className="text-sm text-slate-500 mt-0.5">ตั้งค่าระบบ FlowClean</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.key ? 'border-[#1B3A5C] text-[#1B3A5C]' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Items Tab */}
      {tab === 'items' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-slate-700">รายการผ้า ({linenCatalog.length} รายการ)</h3>
                <p className="text-xs text-slate-400 mt-0.5">เพิ่ม/แก้ไข/ลบรายการผ้า และตั้งราคา default</p>
              </div>
              <button onClick={() => { setShowAddItem(true); setNewItem(EMPTY_NEW_ITEM) }}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#1B3A5C] text-white text-xs rounded-lg hover:bg-[#122740] transition-colors">
                <Plus className="w-3.5 h-3.5" />เพิ่มรายการ
              </button>
            </div>

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
                  <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value as LinenCategory })}
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                    {Object.entries(LINEN_CATEGORIES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <input value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="หน่วย"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                  <input type="number" min={0} step={0.5} value={newItem.defaultPrice}
                    onChange={e => setNewItem({ ...newItem, defaultPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="ราคา"
                    className="px-2 py-1.5 border border-slate-200 rounded text-sm text-right focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={handleAddItem} disabled={!newItem.code || !newItem.name}
                    className="px-3 py-1.5 bg-[#1B3A5C] text-white text-xs rounded hover:bg-[#122740] disabled:opacity-50 transition-colors flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />บันทึก
                  </button>
                  <button onClick={() => setShowAddItem(false)}
                    className="px-3 py-1.5 text-slate-600 text-xs hover:bg-slate-100 rounded transition-colors flex items-center gap-1">
                    <X className="w-3.5 h-3.5" />ยกเลิก
                  </button>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-2 font-medium text-slate-600">รหัส</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อ (ไทย)</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">ชื่อ (EN)</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">หมวด</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">หน่วย</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600 w-28">ราคา default</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {linenCatalog.map(item => (
                  <tr key={item.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.code}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {editingCode === item.code ? (
                        <input value={editItem.name ?? item.name}
                          onChange={e => setEditItem({ ...editItem, name: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                      ) : item.name}
                    </td>
                    <td className="px-4 py-2 text-slate-500 text-xs">
                      {editingCode === item.code ? (
                        <input value={editItem.nameEn ?? item.nameEn}
                          onChange={e => setEditItem({ ...editItem, nameEn: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                      ) : item.nameEn}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {editingCode === item.code ? (
                        <select value={editItem.category ?? item.category}
                          onChange={e => setEditItem({ ...editItem, category: e.target.value as LinenCategory })}
                          className="px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                          {Object.entries(LINEN_CATEGORIES).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      ) : LINEN_CATEGORIES[item.category]}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {editingCode === item.code ? (
                        <input value={editItem.unit ?? item.unit}
                          onChange={e => setEditItem({ ...editItem, unit: e.target.value })}
                          className="w-16 px-2 py-1 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                      ) : item.unit}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input type="number" min={0} step={0.5}
                        value={defaultPrices[item.code] ?? item.defaultPrice}
                        onChange={e => updateDefaultPrice(item.code, parseFloat(e.target.value) || 0)}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">ชื่อ</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">อีเมล</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">บทบาท</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">สถานะ</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-800 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => updateUser(u.id, { isActive: !u.isActive })}
                        className={cn('text-xs px-2 py-0.5 rounded-full',
                          u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== currentUser?.id && (
                        <button onClick={() => updateUser(u.id, { isActive: false })}
                          className="text-slate-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add User */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-medium text-slate-700 mb-3">เพิ่มผู้ใช้ใหม่</h3>
            <div className="flex flex-wrap gap-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ชื่อ"
                className="flex-1 min-w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="อีเมล"
                className="flex-1 min-w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'staff')}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={handleAddUser} disabled={!newName || !newEmail}
                className="px-4 py-2 bg-[#1B3A5C] text-white text-sm rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" />เพิ่ม
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Tab */}
      {tab === 'company' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-medium text-slate-700 mb-2">ข้อมูลบริษัท (สำหรับใบกำกับภาษี)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อบริษัท (ไทย)</label>
              <input value={companyInfo.name} onChange={e => updateCompanyInfo({ name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อบริษัท (EN)</label>
              <input value={companyInfo.nameEn} onChange={e => updateCompanyInfo({ nameEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-600 mb-1">ที่อยู่</label>
              <textarea value={companyInfo.address} onChange={e => updateCompanyInfo({ address: e.target.value })} rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">เลขผู้เสียภาษี</label>
              <input value={companyInfo.taxId} onChange={e => updateCompanyInfo({ taxId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">โทรศัพท์</label>
              <input value={companyInfo.phone} onChange={e => updateCompanyInfo({ phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">ธนาคาร</label>
              <input value={companyInfo.bankName} onChange={e => updateCompanyInfo({ bankName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อบัญชี</label>
              <input value={companyInfo.bankAccountName} onChange={e => updateCompanyInfo({ bankAccountName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">เลขบัญชี</label>
              <input value={companyInfo.bankAccountNumber} onChange={e => updateCompanyInfo({ bankAccountNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-medium text-slate-700 mb-3">รูปแบบเลขที่เอกสาร</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบส่งรับผ้า</p>
                <p className="text-xs text-slate-400">LF-YYYYMMDD-XXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบส่งของ</p>
                <p className="text-xs text-slate-400">SD-YYYYMMDD-XXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบวางบิล</p>
                <p className="text-xs text-slate-400">WB-YYYYMM-XXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบกำกับภาษี</p>
                <p className="text-xs text-slate-400">IV-YYYYMM-XXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบเสนอราคา</p>
                <p className="text-xs text-slate-400">QU-YYYYMM-XXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบเช็คสินค้า</p>
                <p className="text-xs text-slate-400">CK-YYYYMMDD-XXX</p>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h3 className="font-medium text-red-700 mb-2">ล้างข้อมูล</h3>
            <p className="text-sm text-slate-500 mb-3">ล้างข้อมูลทั้งหมดและกลับไปใช้ข้อมูลตัวอย่าง</p>
            <button onClick={handleResetData}
              className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm flex items-center gap-1">
              <RotateCcw className="w-4 h-4" />รีเซ็ตข้อมูล
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
