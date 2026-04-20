'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import Sidebar from '@/components/Sidebar'
import HeaderActions from '@/components/HeaderActions'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { currentUser } = useStore()

  useEffect(() => {
    if (!currentUser) {
      router.replace('/login')
    }
  }, [currentUser, router])

  if (!currentUser) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <HeaderActions />
      <main className="lg:pl-60 min-h-screen transition-all duration-300">
        <div className="p-4 pt-16 lg:pt-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
