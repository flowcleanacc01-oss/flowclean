'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'

export default function Home() {
  const router = useRouter()
  const { currentUser } = useStore()

  useEffect(() => {
    if (currentUser) {
      router.replace('/dashboard')
    } else {
      router.replace('/login')
    }
  }, [currentUser, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-[#1B3A5C] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )
}
