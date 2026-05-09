'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import Sidebar from '@/components/Sidebar'
import HeaderActions from '@/components/HeaderActions'
import FindBar from '@/components/FindBar'
import { useSidebarCollapsed } from '@/lib/sidebar-state'
import { cn } from '@/lib/utils'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { currentUser } = useStore()
  const [collapsed] = useSidebarCollapsed()

  useEffect(() => {
    if (!currentUser) {
      router.replace('/login')
    }
  }, [currentUser, router])

  if (!currentUser) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className={cn(
        'min-h-screen transition-all duration-300',
        collapsed ? 'lg:pl-16' : 'lg:pl-60',
      )}>
        {/* 121: Sticky top bar — Search + Bell (ไม่ชนปุ่ม "สร้าง" อีก) */}
        {/* 242.2: เอา backdrop-blur ออก — เป็น browser bug: text selection ใต้ backdrop-filter
            → repaint loop → หน้าจอกระพริบ (flicker) เมื่อ user drag-select บน chip/text */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto h-14 flex items-center justify-end gap-2 pl-16 pr-4 lg:px-8">
            <HeaderActions />
          </div>
        </header>
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      {/* 175.1 — In-page Find bar (slash key / Cmd+K same-page) */}
      <FindBar />
    </div>
  )
}
