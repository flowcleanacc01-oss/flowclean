'use client'

import { useState } from 'react'
import { ImageIcon, FileDown, Table2, Printer } from 'lucide-react'
import { exportJPG, exportPDF } from '@/lib/export'

interface ExportButtonsProps {
  targetId: string
  filename: string
  orientation?: 'portrait' | 'landscape'
  onExportCSV?: () => void
  onExport?: () => void     // backward compat: fires on any action
  onPrint?: () => void      // fires only on print button
  onExportFile?: () => void // fires only on JPG/PDF/CSV
  showPrint?: boolean
}

export default function ExportButtons({ targetId, filename, orientation = 'portrait', onExportCSV, onExport, onPrint, onExportFile, showPrint = true }: ExportButtonsProps) {
  const [busy, setBusy] = useState(false)

  const handleJPG = async () => {
    setBusy(true)
    try { await exportJPG(targetId, filename) } catch { /* ignore */ }
    setBusy(false)
    onExportFile?.()
    onExport?.()
  }

  const handlePDF = async () => {
    setBusy(true)
    try { await exportPDF(targetId, filename, orientation) } catch { /* ignore */ }
    setBusy(false)
    onExportFile?.()
    onExport?.()
  }

  const btnBase = 'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      <button onClick={handleJPG} disabled={busy}
        className={`${btnBase} bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200`}>
        <ImageIcon className="w-3.5 h-3.5" />JPG
      </button>
      <button onClick={handlePDF} disabled={busy}
        className={`${btnBase} bg-red-50 text-red-700 hover:bg-red-100 border border-red-200`}>
        <FileDown className="w-3.5 h-3.5" />PDF
      </button>
      {onExportCSV && (
        <button onClick={() => { onExportCSV(); onExportFile?.(); onExport?.() }}
          className={`${btnBase} bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200`}>
          <Table2 className="w-3.5 h-3.5" />CSV
        </button>
      )}
      {showPrint && (
        <button onClick={() => { window.print(); onPrint?.(); onExport?.() }} disabled={busy}
          className={`${btnBase} bg-[#1B3A5C] text-white hover:bg-[#122740]`}>
          <Printer className="w-3.5 h-3.5" />พิมพ์
        </button>
      )}
    </div>
  )
}
