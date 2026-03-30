'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatCurrency, formatDate, todayISO, sanitizeNumber, cn, scrollToActiveRow } from '@/lib/utils'
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Expense } from '@/types'
import Modal from '@/components/Modal'
import {
  Plus,
  Search,
  Wallet,
  Trash2,
  Calendar,
  Pencil,
} from 'lucide-react'

export default function ExpensesPage() {
  const { currentUser, expenses, addExpense, updateExpense, deleteExpense } = useStore()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return expenses
      .filter(e => {
        if (!e.date.startsWith(month)) return false
        if (search) {
          const q = search.toLowerCase()
          return e.description.toLowerCase().includes(q) || e.reference.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [expenses, month, search])

  const monthTotal = filtered.reduce((s, e) => s + e.amount, 0)

  // Category breakdown
  const byCategory = filtered.reduce((acc, e) => {
    if (!acc[e.category]) acc[e.category] = 0
    acc[e.category] += e.amount
    return acc
  }, {} as Record<string, number>)

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  const handleDelete = (id: string) => {
    deleteExpense(id)
    setConfirmDeleteId(null)
  }

  const handleEdit = (exp: Expense) => {
    setEditingExpense(exp)
    setShowForm(true)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">รายจ่าย</h1>
          <p className="text-slate-500 text-sm mt-0.5">บันทึกค่าใช้จ่ายต่างๆ</p>
        </div>
        <button
          onClick={() => { setEditingExpense(null); setShowForm(true) }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1B3A5C] text-white rounded-lg text-sm font-medium hover:bg-[#122740] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          เพิ่มรายจ่าย
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหารายละเอียด..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
          />
        </div>
      </div>

      {/* Category Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(byCategory)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4)
          .map(([cat, amount]) => {
            const config = EXPENSE_CATEGORIES[cat as ExpenseCategory]
            return (
              <div key={cat} className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-lg mb-1">{config?.icon}</p>
                <p className="text-xs text-slate-500">{config?.label || cat}</p>
                <p className="text-sm font-bold text-slate-800">฿{formatCurrency(amount)}</p>
              </div>
            )
          })}
      </div>

      {/* Total */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <span className="text-sm text-slate-600">รวมค่าใช้จ่ายเดือนนี้</span>
        <span className="text-xl font-bold text-slate-800">฿{formatCurrency(monthTotal)}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs bg-slate-50/50 border-b border-slate-200">
                <th className="text-left px-5 py-3 font-medium">วันที่</th>
                <th className="text-left px-3 py-3 font-medium">หมวด</th>
                <th className="text-left px-3 py-3 font-medium">รายละเอียด</th>
                <th className="text-left px-3 py-3 font-medium">อ้างอิง</th>
                <th className="text-right px-3 py-3 font-medium">จำนวนเงิน</th>
                <th className="text-center px-5 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => {
                const config = EXPENSE_CATEGORIES[exp.category]
                return (
                  <tr key={exp.id}
                    data-row-id={exp.id}
                    className={cn("border-b border-slate-50 cursor-pointer", activeExpenseId === exp.id ? 'bg-[#3DD8D8]/10 border-l-2 border-l-[#3DD8D8]' : 'hover:bg-slate-50/50')}
                    onClick={() => setActiveExpenseId(exp.id)}>
                    <td className="px-5 py-3 text-slate-600">{formatDate(exp.date)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        {config?.icon} {config?.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{exp.description}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{exp.reference || '—'}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700">฿{formatCurrency(exp.amount)}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => handleEdit(exp)}
                          className="p-1.5 text-slate-400 hover:text-blue-500 rounded hover:bg-blue-50 transition-colors"
                          title="แก้ไข"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                          title="ลบ"
                        >
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
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">ไม่มีรายจ่ายในเดือนนี้</p>
          </div>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      {showForm && (
        <ExpenseFormModal
          initial={editingExpense}
          onSave={(data) => {
            if (editingExpense) {
              updateExpense(editingExpense.id, data)
            } else {
              const newExp = addExpense(data)
              setActiveExpenseId(newExp.id)
              scrollToActiveRow(newExp.id)
            }
            setShowForm(false)
            setEditingExpense(null)
          }}
          onClose={() => { setShowForm(false); setEditingExpense(null) }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">ต้องการลบรายจ่ายนี้หรือไม่? การลบไม่สามารถเรียกคืนได้</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
            <button onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">ลบ</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ExpenseFormModal({ initial, onSave, onClose }: {
  initial: Expense | null
  onSave: (data: { date: string; category: ExpenseCategory; description: string; amount: number; reference: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    date: initial?.date || todayISO(),
    category: (initial?.category || 'chemicals') as ExpenseCategory,
    description: initial?.description || '',
    amount: initial?.amount || 0,
    reference: initial?.reference || '',
  })

  const handleSave = () => {
    if (!form.description) return alert('กรุณากรอกรายละเอียด')
    if (form.amount <= 0) return alert('กรุณากรอกจำนวนเงิน')
    onSave(form)
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'แก้ไขรายจ่าย' : 'เพิ่มรายจ่าย'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">วันที่</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">หมวดหมู่</label>
            <select
              value={form.category}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value as ExpenseCategory }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
            >
              {Object.entries(EXPENSE_CATEGORIES).map(([key, val]) => (
                <option key={key} value={key}>{val.icon} {val.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">รายละเอียด *</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="เช่น น้ำยาซักผ้า Premium 200L"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">จำนวนเงิน (บาท) *</label>
            <input
              type="number"
              value={form.amount || ''}
              onChange={e => setForm(prev => ({ ...prev, amount: sanitizeNumber(e.target.value) }))}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">เลขอ้างอิง</label>
            <input
              type="text"
              value={form.reference}
              onChange={e => setForm(prev => ({ ...prev, reference: e.target.value }))}
              placeholder="PO-XXXX"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DD8D8]"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
          <button onClick={handleSave} className="px-6 py-2 bg-[#1B3A5C] text-white text-sm font-medium rounded-lg hover:bg-[#122740] transition-colors">
            {initial ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
