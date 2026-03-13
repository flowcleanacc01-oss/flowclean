import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

export async function exportJPG(elementId: string, filename: string) {
  const el = document.getElementById(elementId)
  if (!el) return
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const link = document.createElement('a')
  link.download = `${filename}.jpg`
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.click()
}

export async function exportPDF(elementId: string, filename: string) {
  const el = document.getElementById(elementId)
  if (!el) return
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10
  const imgWidth = pageWidth - margin * 2
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  if (imgHeight <= pageHeight - margin * 2) {
    // Fits on one page
    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight)
  } else {
    // Multi-page: slice canvas into page-height chunks
    const pageContentHeight = pageHeight - margin * 2
    const scaleFactor = imgWidth / canvas.width
    const sliceHeightPx = pageContentHeight / scaleFactor
    let yOffset = 0
    let pageNum = 0

    while (yOffset < canvas.height) {
      if (pageNum > 0) pdf.addPage()
      const sliceH = Math.min(sliceHeightPx, canvas.height - yOffset)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceH
      const ctx = sliceCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95)
        const drawH = sliceH * scaleFactor
        pdf.addImage(sliceData, 'JPEG', margin, margin, imgWidth, drawH)
      }
      yOffset += sliceH
      pageNum++
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
