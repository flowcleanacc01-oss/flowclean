'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

/**
 * 422 — Data-load warning banner
 * แสดงเมื่อมี core table โหลดไม่สำเร็จ (loadError) → บอก user ชัดเจนว่า
 * "เป็นการเชื่อมต่อสะดุด ข้อมูลไม่ได้หาย" + ปุ่มลองใหม่ในตัว
 * แทนการแสดงตารางว่างเงียบๆ ที่ทำให้เข้าใจผิดว่าข้อมูลหาย
 */
export default function DataLoadBanner() {
  const { loadError, reloadData } = useStore()
  const [reloading, setReloading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // failure ชุดใหม่ (รวมหลังกดลองใหม่แล้วยังไม่ผ่าน) → เลิก dismiss เพื่อเตือนซ้ำ
  useEffect(() => { setDismissed(false) }, [loadError])

  if (!loadError || loadError.length === 0 || dismissed) return null

  const handleReload = async () => {
    setReloading(true)
    try { await reloadData() } finally { setReloading(false) }
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2.5 flex items-center gap-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-amber-800 flex-1 min-w-0">
          <span className="font-semibold">โหลดข้อมูลบางส่วนไม่สำเร็จ:</span>{' '}
          <span className="font-medium">{loadError.join(', ')}</span>{' '}
          <span className="text-amber-700">— ข้อมูลไม่ได้หายจากระบบ เป็นการเชื่อมต่อสะดุดชั่วคราว กดลองใหม่ได้เลย</span>
        </p>
        <button onClick={handleReload} disabled={reloading}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-60 transition-colors">
          <RefreshCw className={cn('w-3.5 h-3.5', reloading && 'animate-spin')} />
          {reloading ? 'กำลังโหลด...' : 'ลองใหม่'}
        </button>
        <button onClick={() => setDismissed(true)} disabled={reloading}
          className="shrink-0 p-1 text-amber-500 hover:text-amber-700 disabled:opacity-40" title="ปิดข้อความนี้">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
