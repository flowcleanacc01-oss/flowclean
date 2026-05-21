import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'
import { PAPER_SIZES, MARGIN_PRESETS, type Orientation, type PaperSize, type MarginPreset } from './print-utils'

// 314: Helper — hide .no-print descendants ก่อน html2canvas
// (`.no-print` มี display:none เฉพาะใน @media print → ตอน html2canvas snapshot
//  จะ render รวมไปด้วย ทำให้ canvas สูงเกินจริง + เอกสารคร่อมหน้า)
function hideNoPrintDescendants(root: HTMLElement): () => void {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.no-print'))
  const originals = nodes.map(n => ({ el: n, display: n.style.display }))
  for (const n of nodes) n.style.display = 'none'
  return () => {
    for (const o of originals) o.el.style.display = o.display
  }
}

export async function exportJPG(elementId: string, filename: string) {
  const el = document.getElementById(elementId)
  if (!el) return
  const restore = hideNoPrintDescendants(el)
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const link = document.createElement('a')
    link.download = `${filename}.jpg`
    link.href = canvas.toDataURL('image/jpeg', 0.95)
    link.click()
  } finally {
    restore()
  }
}

export async function exportPDF(
  elementId: string,
  filename: string,
  orientation: Orientation = 'portrait',
  paperSize: PaperSize = 'A4',
  marginPreset: MarginPreset = 'normal',
) {
  const el = document.getElementById(elementId)
  if (!el) return

  // 307: Honor CSS page breaks (เหมือนตอน window.print() ของ browser)
  //   - scan descendants หา elements ที่มี page-break-before/after: always
  //   - บันทึก offsetTop ใน element coords (px)
  //   ก่อนหน้า: slice ตาม fixed page height → ตารางหรือ cover ถูกตัดกลาง
  //
  // 314: Hide .no-print ก่อน scan + render (เลียนแบบ window.print medium)
  //   - .no-print { display: none } มีเฉพาะใน @media print → ตอน html2canvas
  //     snapshot จะ render รวมด้วย ทำให้ canvas สูงเกิน + เอกสารคร่อมหน้า
  //   - scan break-after ด้วย (เพื่อรองรับ pattern .break-after-page)
  const restore = hideNoPrintDescendants(el)
  let canvas: HTMLCanvasElement
  const breakAnchorsPx: number[] = []
  try {
    const elRect = el.getBoundingClientRect()
    const descendants = el.querySelectorAll('*')
    for (let i = 0; i < descendants.length; i++) {
      const d = descendants[i] as HTMLElement
      const cs = window.getComputedStyle(d)
      // pageBreakBefore/After = legacy · breakBefore/After = modern (CSS Fragmentation L3)
      const breakBefore = (cs.pageBreakBefore || cs.breakBefore || '').toLowerCase()
      const breakAfter = (cs.pageBreakAfter || cs.breakAfter || '').toLowerCase()
      const dRect = d.getBoundingClientRect()
      if (breakBefore === 'always' || breakBefore === 'page' || breakBefore === 'left' || breakBefore === 'right') {
        const offsetPx = dRect.top - elRect.top
        if (offsetPx > 0.5) breakAnchorsPx.push(offsetPx)
      }
      if (breakAfter === 'always' || breakAfter === 'page' || breakAfter === 'left' || breakAfter === 'right') {
        const offsetPx = dRect.bottom - elRect.top
        if (offsetPx > 0.5) breakAnchorsPx.push(offsetPx)
      }
    }
    breakAnchorsPx.sort((a, b) => a - b)

    canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  } finally {
    restore()
  }
  const pdf = new jsPDF(orientation, 'mm', PAPER_SIZES[paperSize].jsPdfFormat)
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = MARGIN_PRESETS[marginPreset].value
  const imgWidth = pageWidth - margin * 2
  const pageContentHeight = pageHeight - margin * 2

  // Map: 1 element-px → canvas-px (จาก devicePixelRatio scale=2)
  const elPxToCanvasPx = canvas.width / el.offsetWidth
  // Map: 1 canvas-px → mm
  const canvasPxToMm = imgWidth / canvas.width
  const maxSliceCanvasPx = pageContentHeight / canvasPxToMm

  // Build boundaries ใน canvas-px (sorted ascending, deduped)
  const boundaries = [0]
  for (const anchorPx of breakAnchorsPx) {
    const cPx = Math.round(anchorPx * elPxToCanvasPx)
    if (cPx > boundaries[boundaries.length - 1] + 1) boundaries.push(cPx)
  }
  if (canvas.height > boundaries[boundaries.length - 1] + 1) boundaries.push(canvas.height)

  let firstPage = true
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sectionStart = boundaries[i]
    const sectionEnd = boundaries[i + 1]
    if (sectionEnd <= sectionStart) continue

    // Sub-slice: ถ้า section ใหญ่กว่า 1 page → ตัดเป็นหลาย pages ใน section นั้น
    let yOffset = sectionStart
    while (yOffset < sectionEnd) {
      if (!firstPage) pdf.addPage()
      firstPage = false
      const sliceH = Math.min(maxSliceCanvasPx, sectionEnd - yOffset)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceH
      const ctx = sliceCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95)
        const drawH = sliceH * canvasPxToMm
        pdf.addImage(sliceData, 'JPEG', margin, margin, imgWidth, drawH)
      }
      yOffset += sliceH
    }
  }

  pdf.save(`${filename}.pdf`)
}

export function exportCSV(headers: string[], rows: string[][], filename: string) {
  const BOM = '\uFEFF' // UTF-8 BOM for Excel Thai support
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
