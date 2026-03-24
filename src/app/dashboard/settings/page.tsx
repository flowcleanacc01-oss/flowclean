'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/lib/store'
import { cn, formatDate } from '@/lib/utils'
import { validatePassword } from '@/lib/auth'
import { fetchAuditLogs } from '@/lib/supabase-service'
import type { AuditLog, BankAccount } from '@/types'
import { Plus, Trash2, RotateCcw, Check, KeyRound, X } from 'lucide-react'
import { genId } from '@/lib/utils'

type TabKey = 'users' | 'company' | 'documents' | 'auditlog'

const ACTION_LABELS: Record<string, string> = {
  create: 'สร้าง',
  update: 'แก้ไข',
  delete: 'ลบ',
  login: 'เข้าสู่ระบบ',
  login_fail: 'เข้าสู่ระบบล้มเหลว',
  logout: 'ออกจากระบบ',
}

const ENTITY_LABELS: Record<string, string> = {
  customer: 'ลูกค้า',
  linen_form: 'ใบรับส่งผ้า',
  delivery_note: 'ใบส่งของ',
  billing: 'ใบวางบิล',
  tax_invoice: 'ใบกำกับภาษี',
  quotation: 'ใบเสนอราคา',
  expense: 'ค่าใช้จ่าย',
  checklist: 'ใบเช็คสินค้า',
  user: 'ผู้ใช้',
  company: 'บริษัท',
  linen_item: 'รายการผ้า',
  session: 'เซสชัน',
}

export default function SettingsPage() {
  const {
    currentUser,
    users, addUser, updateUser, resetPassword,
    companyInfo, updateCompanyInfo,
  } = useStore()

  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabKey>(() => {
    const t = searchParams.get('tab')
    if (t === 'users' || t === 'company' || t === 'documents' || t === 'auditlog') return t
    return 'users'
  })

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'users' || t === 'company' || t === 'documents' || t === 'auditlog') setTab(t)
  }, [searchParams])

  // New user form
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff')
  const [addUserError, setAddUserError] = useState('')

  // Reset password
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Company info local draft (debounced save)
  const [companyDraft, setCompanyDraft] = useState(companyInfo)
  const companyDirty = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => { setCompanyDraft(companyInfo) }, [companyInfo])

  const handleCompanyChange = useCallback((field: string, value: string | number) => {
    setCompanyDraft(prev => ({ ...prev, [field]: value }))
    companyDirty.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setCompanyDraft(latest => {
        if (companyDirty.current) {
          updateCompanyInfo(latest)
          companyDirty.current = false
        }
        return latest
      })
    }, 1500)
  }, [updateCompanyInfo])

  const handleCompanySaveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    updateCompanyInfo(companyDraft)
    companyDirty.current = false
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }, [companyDraft, updateCompanyInfo])

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  useEffect(() => {
    if (tab === 'auditlog') {
      setAuditLoading(true)
      fetchAuditLogs({ limit: 100 })
        .then(setAuditLogs)
        .catch(err => console.error('[Audit fetch error]', err))
        .finally(() => setAuditLoading(false))
    }
  }, [tab])

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'users', label: 'ผู้ใช้' },
    { key: 'company', label: 'บริษัท' },
    { key: 'documents', label: 'เอกสาร' },
    { key: 'auditlog', label: 'บันทึกการใช้งาน' },
  ]

  const handleAddUser = async () => {
    setAddUserError('')
    if (!newName || !newEmail) { setAddUserError('กรุณากรอกชื่อและอีเมล'); return }
    const pwError = validatePassword(newPassword)
    if (pwError) { setAddUserError(pwError); return }
    await addUser({ name: newName, email: newEmail, passwordHash: '', role: newRole, isActive: true }, newPassword)
    setNewName('')
    setNewEmail('')
    setNewPassword('')
    setNewRole('staff')
  }

  const handleResetPassword = async () => {
    if (!resetUserId) return
    setResetError('')
    const pwError = validatePassword(resetPw)
    if (pwError) { setResetError(pwError); return }
    setResetLoading(true)
    try {
      await resetPassword(resetUserId, resetPw)
      setResetUserId(null)
      setResetPw('')
    } catch (err) {
      console.error('[Reset password error]', err)
      setResetError('เกิดข้อผิดพลาด')
    } finally {
      setResetLoading(false)
    }
  }

  const handleResetData = async () => {
    if (!confirm('ล้างข้อมูลทั้งหมดและใช้ข้อมูลตัวอย่าง?')) return
    if (!confirm('ยืนยันอีกครั้ง — ข้อมูลทั้งหมดจะถูกลบ!')) return
    try {
      const { truncateAllTables } = await import('@/lib/supabase-service')
      await truncateAllTables()
      window.location.reload()
    } catch (err) {
      console.error('[Reset error]', err)
      alert('เกิดข้อผิดพลาดในการรีเซ็ตข้อมูล')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">ตั้งค่า</h1>
        <p className="text-sm text-slate-500 mt-0.5">ตั้งค่าระบบ FlowClean</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              tab === t.key ? 'border-[#1B3A5C] text-[#1B3A5C]' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

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
                  <th className="text-right px-4 py-3 font-medium text-slate-600 w-28"></th>
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
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setResetUserId(u.id); setResetPw(''); setResetError('') }}
                          title="รีเซ็ตรหัสผ่าน"
                          className="text-slate-400 hover:text-amber-600 p-1">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => updateUser(u.id, { isActive: false })}
                            className="text-slate-400 hover:text-red-500 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reset Password Modal */}
          {resetUserId && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
              <h3 className="font-medium text-amber-800 mb-3">
                รีเซ็ตรหัสผ่าน: {users.find(u => u.id === resetUserId)?.name}
              </h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-48">
                  <label className="block text-xs text-amber-700 mb-1">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
                  <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                    placeholder="รหัสผ่านใหม่"
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                </div>
                <button onClick={handleResetPassword} disabled={resetLoading}
                  className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                  {resetLoading ? 'กำลังรีเซ็ต...' : 'รีเซ็ต'}
                </button>
                <button onClick={() => setResetUserId(null)}
                  className="px-4 py-2 text-slate-600 text-sm hover:bg-slate-100 rounded-lg transition-colors">
                  ยกเลิก
                </button>
              </div>
              {resetError && <p className="text-red-600 text-sm mt-2">{resetError}</p>}
            </div>
          )}

          {/* Add User */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-medium text-slate-700 mb-3">เพิ่มผู้ใช้ใหม่</h3>
            <div className="flex flex-wrap gap-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ชื่อ"
                className="flex-1 min-w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="อีเมล"
                className="flex-1 min-w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="รหัสผ่าน (6+ ตัว)"
                className="flex-1 min-w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'staff')}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none">
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={handleAddUser} disabled={!newName || !newEmail || !newPassword}
                className="px-4 py-2 bg-[#1B3A5C] text-white text-sm rounded-lg hover:bg-[#122740] disabled:opacity-50 transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" />เพิ่ม
              </button>
            </div>
            {addUserError && <p className="text-red-600 text-sm mt-2">{addUserError}</p>}
          </div>
        </div>
      )}

      {/* Company Tab */}
      {tab === 'company' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-slate-700">ข้อมูลบริษัท (สำหรับใบกำกับภาษี)</h3>
            <div className="flex items-center gap-2">
              {savedMsg && <span className="text-sm text-emerald-600 font-medium">บันทึกแล้ว ✓</span>}
              <button onClick={handleCompanySaveNow}
                className="px-4 py-1.5 bg-[#1B3A5C] text-white text-sm rounded-lg hover:bg-[#122740] transition-colors flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />บันทึก
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อบริษัท (ไทย)</label>
              <input value={companyDraft.name} onChange={e => handleCompanyChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">ชื่อบริษัท (EN)</label>
              <input value={companyDraft.nameEn} onChange={e => handleCompanyChange('nameEn', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-600 mb-1">ที่อยู่</label>
              <textarea value={companyDraft.address} onChange={e => handleCompanyChange('address', e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">เลขผู้เสียภาษี</label>
              <input value={companyDraft.taxId} onChange={e => handleCompanyChange('taxId', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">รหัสสาขา (5 หลัก)</label>
              <input value={companyDraft.branch} onChange={e => handleCompanyChange('branch', e.target.value)}
                placeholder="00000 = สำนักงานใหญ่, 00001 = สาขาที่ 1"
                maxLength={5}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
              <p className="text-[11px] text-slate-400 mt-0.5">00000 → แสดง "สำนักงานใหญ่" | 00001 → แสดง "สาขาที่ 00001"</p>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">โทรศัพท์</label>
              <input value={companyDraft.phone} onChange={e => handleCompanyChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
            </div>
          </div>

          {/* VAT & WHT Rates */}
          <div className="border-t border-slate-200 pt-4 mt-4">
            <h4 className="font-medium text-slate-700 mb-3">อัตราภาษี</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-600 mb-1">VAT (%)</label>
                <input type="number" value={companyDraft.vatRate ?? 7}
                  onChange={e => handleCompanyChange('vatRate', parseFloat(e.target.value) || 0)}
                  min={0} max={100} step={0.01}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                <p className="text-[11px] text-slate-400 mt-0.5">ค่าเริ่มต้น 7%</p>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">หัก ณ ที่จ่าย (%)</label>
                <input type="number" value={companyDraft.withholdingRate ?? 3}
                  onChange={e => handleCompanyChange('withholdingRate', parseFloat(e.target.value) || 0)}
                  min={0} max={100} step={0.01}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                <p className="text-[11px] text-slate-400 mt-0.5">ค่าเริ่มต้น 3%</p>
              </div>
            </div>
          </div>

          {/* Bank Accounts */}
          <div className="border-t border-slate-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-slate-700">บัญชีธนาคาร</h4>
              <button onClick={() => {
                const updated = [...(companyDraft.bankAccounts || []), { id: genId(), bankName: '', accountName: '', accountNumber: '', isDefault: (companyDraft.bankAccounts || []).length === 0 }]
                setCompanyDraft(prev => ({ ...prev, bankAccounts: updated }))
                companyDirty.current = true
              }} className="px-3 py-1 text-xs bg-[#1B3A5C] text-white rounded-lg hover:bg-[#122740] flex items-center gap-1">
                <Plus className="w-3 h-3" />เพิ่มบัญชี
              </button>
            </div>
            {(!companyDraft.bankAccounts || companyDraft.bankAccounts.length === 0) ? (
              <p className="text-sm text-slate-400">ยังไม่มีบัญชีธนาคาร</p>
            ) : (
              <div className="space-y-3">
                {companyDraft.bankAccounts.map((ba, idx) => (
                  <div key={ba.id} className="border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">บัญชี {idx + 1}</span>
                        {ba.isDefault && <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-700 rounded font-medium">ค่าเริ่มต้น</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {!ba.isDefault && (
                          <button onClick={() => {
                            const updated = companyDraft.bankAccounts.map(b => ({ ...b, isDefault: b.id === ba.id }))
                            setCompanyDraft(prev => ({ ...prev, bankAccounts: updated }))
                            companyDirty.current = true
                          }} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">ตั้งเป็นค่าเริ่มต้น</button>
                        )}
                        <button onClick={() => {
                          const updated = companyDraft.bankAccounts.filter(b => b.id !== ba.id)
                          if (ba.isDefault && updated.length > 0) updated[0].isDefault = true
                          setCompanyDraft(prev => ({ ...prev, bankAccounts: updated }))
                          companyDirty.current = true
                        }} className="p-1 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input value={ba.bankName} placeholder="ชื่อธนาคาร"
                        onChange={e => {
                          const updated = [...companyDraft.bankAccounts]
                          updated[idx] = { ...ba, bankName: e.target.value }
                          setCompanyDraft(prev => ({ ...prev, bankAccounts: updated }))
                          companyDirty.current = true
                        }}
                        className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                      <input value={ba.accountName} placeholder="ชื่อบัญชี"
                        onChange={e => {
                          const updated = [...companyDraft.bankAccounts]
                          updated[idx] = { ...ba, accountName: e.target.value }
                          setCompanyDraft(prev => ({ ...prev, bankAccounts: updated }))
                          companyDirty.current = true
                        }}
                        className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                      <input value={ba.accountNumber} placeholder="เลขบัญชี"
                        onChange={e => {
                          const updated = [...companyDraft.bankAccounts]
                          updated[idx] = { ...ba, accountNumber: e.target.value }
                          setCompanyDraft(prev => ({ ...prev, bankAccounts: updated }))
                          companyDirty.current = true
                        }}
                        className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-[#3DD8D8] focus:outline-none" />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <p className="text-xs text-slate-400">LF-YYYYMMDD-XXXXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบส่งของ</p>
                <p className="text-xs text-slate-400">SD-YYYYMMDD-XXXXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบวางบิล</p>
                <p className="text-xs text-slate-400">WB-YYYYMM-XXXXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบกำกับภาษี</p>
                <p className="text-xs text-slate-400">IV-YYYYMM-XXXXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบเสนอราคา</p>
                <p className="text-xs text-slate-400">QT-YYYYMM-XXXXX</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-mono text-slate-600">ใบเช็คสินค้า</p>
                <p className="text-xs text-slate-400">CK-YYYYMMDD-XXXXX</p>
              </div>
            </div>
          </div>

          {/* Reset — dev only */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-white rounded-xl border border-red-200 p-6">
              <h3 className="font-medium text-red-700 mb-2">ล้างข้อมูล (dev only)</h3>
              <p className="text-sm text-slate-500 mb-3">ล้างข้อมูลทั้งหมดและกลับไปใช้ข้อมูลตัวอย่าง</p>
              <button onClick={handleResetData}
                className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm flex items-center gap-1">
                <RotateCcw className="w-4 h-4" />รีเซ็ตข้อมูล
              </button>
            </div>
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {tab === 'auditlog' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-slate-700">บันทึกการใช้งาน</h3>
                <p className="text-xs text-slate-400 mt-0.5">ประวัติการเข้าใช้และแก้ไขข้อมูลทั้งหมด</p>
              </div>
              <button
                onClick={() => {
                  setAuditLoading(true)
                  fetchAuditLogs({ limit: 100 })
                    .then(setAuditLogs)
                    .catch(err => console.error('[Audit refresh error]', err))
                    .finally(() => setAuditLoading(false))
                }}
                className="text-xs px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" />รีเฟรช
              </button>
            </div>

            {auditLoading ? (
              <div className="p-8 text-center text-slate-400">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                กำลังโหลด...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">ยังไม่มีบันทึก</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">เวลา</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">ผู้ใช้</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">การกระทำ</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">ประเภท</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                          {formatAuditTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{log.userName}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                            log.action === 'login' ? 'bg-emerald-100 text-emerald-700' :
                            log.action === 'login_fail' ? 'bg-red-100 text-red-700' :
                            log.action === 'logout' ? 'bg-slate-100 text-slate-600' :
                            log.action === 'create' ? 'bg-blue-100 text-blue-700' :
                            log.action === 'update' ? 'bg-amber-100 text-amber-700' :
                            log.action === 'delete' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-600')}>
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                          {ENTITY_LABELS[log.entityType] || log.entityType}
                        </td>
                        <td className="px-4 py-2 text-slate-600 text-xs">
                          {log.entityLabel}
                          {log.details && <span className="text-slate-400 ml-1">— {log.details}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatAuditTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    const date = formatDate(isoStr.split('T')[0])
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    return `${date} ${time}`
  } catch {
    return isoStr
  }
}
