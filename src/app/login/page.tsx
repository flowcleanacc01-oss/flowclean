'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('กรุณากรอกอีเมล')
      return
    }
    if (!password) {
      setError('กรุณากรอกรหัสผ่าน')
      return
    }

    setLoading(true)

    const ok = await login(email, password)
    if (ok) {
      router.push('/dashboard')
    } else {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8eef5] via-white to-[#d5f7f7] px-4">
      {/* Top bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-[#1B3A5C] via-[#3DD8D8] to-[#E67E22]" />

      <div className="w-full max-w-md animate-fadeIn">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image src="/flowclean-logo.svg" alt="FlowClean" width={64} height={64} priority />
          </div>
          <h1 className="text-3xl font-bold text-[#1B3A5C] tracking-tight">FlowClean</h1>
          <p className="text-slate-500 mt-1">ระบบบริหารโรงซักรีด</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">เข้าสู่ระบบ</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">อีเมล</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="flowcleanwash@gmail.com"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3DD8D8] focus:border-transparent transition-shadow"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">รหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="รหัสผ่าน"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3DD8D8] focus:border-transparent transition-shadow pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#1B3A5C] hover:bg-[#122740] text-white font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              ใช้อีเมลและรหัสผ่านที่ลงทะเบียนในระบบ
            </p>
            {process.env.NODE_ENV === 'development' && (
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                <button
                  onClick={() => { setEmail('flowcleanwash@gmail.com'); setPassword('flowclean2026') }}
                  className="text-xs px-3 py-1 bg-[#e8eef5] text-[#1B3A5C] rounded-full hover:bg-[#d0dae8] transition-colors"
                >
                  Admin (ติ๊ด)
                </button>
                <button
                  onClick={() => { setEmail('somchai@flowclean.com'); setPassword('staff1234') }}
                  className="text-xs px-3 py-1 bg-[#d5f7f7] text-[#2bb8b8] rounded-full hover:bg-[#b8f0f0] transition-colors"
                >
                  Staff (สมชาย)
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          FlowClean &copy; 2026 — บริษัท คราฟท์ แอนด์ มอร์ จำกัด
        </p>
      </div>
    </div>
  )
}
