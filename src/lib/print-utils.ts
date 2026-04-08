/**
 * Print Settings Helpers (56)
 *
 * - PaperSize, MarginPreset, Orientation types + presets
 * - applyPrintSettings(): inject @page CSS dynamically before window.print()
 * - cleanup(): remove injected style after print dialog closes
 */

export type Orientation = 'portrait' | 'landscape'
export type PaperSize = 'A4' | 'Letter' | 'A3' | 'A5'
export type MarginPreset = 'none' | 'narrow' | 'normal' | 'wide'

export interface PrintSettings {
  orientation: Orientation
  paperSize: PaperSize
  margin: MarginPreset
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  orientation: 'portrait',
  paperSize: 'A4',
  margin: 'normal',
}

export const PAPER_SIZES: Record<PaperSize, { width: number; height: number; label: string; jsPdfFormat: string }> = {
  A4:     { width: 210, height: 297, label: 'A4 (210×297 mm)',     jsPdfFormat: 'a4' },
  Letter: { width: 216, height: 279, label: 'Letter (216×279 mm)', jsPdfFormat: 'letter' },
  A3:     { width: 297, height: 420, label: 'A3 (297×420 mm)',     jsPdfFormat: 'a3' },
  A5:     { width: 148, height: 210, label: 'A5 (148×210 mm)',     jsPdfFormat: 'a5' },
}

export const MARGIN_PRESETS: Record<MarginPreset, { value: number; label: string }> = {
  none:   { value: 0,  label: 'ไม่มี (0 mm)' },
  narrow: { value: 5,  label: 'แคบ (5 mm)' },
  normal: { value: 10, label: 'ปกติ (10 mm)' },
  wide:   { value: 20, label: 'กว้าง (20 mm)' },
}

const STYLE_ID = 'fc-print-settings-runtime'

/**
 * Inject @page CSS rule based on user's print settings.
 * Returns a cleanup function to remove the injected style.
 *
 * Browser headers/footers workaround (#57):
 * - Set @page margin to user value
 * - Browser still controls headers/footers via dialog toggle
 * - Best we can do: instruct user to disable in print dialog
 */
export function applyPrintSettings(settings: PrintSettings): () => void {
  // Remove existing if any
  document.getElementById(STYLE_ID)?.remove()

  const margin = MARGIN_PRESETS[settings.margin].value
  const css = `
    @page {
      size: ${settings.paperSize} ${settings.orientation};
      margin: ${margin}mm;
    }
  `.trim()

  const styleEl = document.createElement('style')
  styleEl.id = STYLE_ID
  styleEl.textContent = css
  document.head.appendChild(styleEl)

  return () => {
    document.getElementById(STYLE_ID)?.remove()
  }
}

/**
 * Trigger window.print() with settings applied.
 * Cleanup runs after print dialog closes (1.5s delay to be safe).
 */
export function printWithSettings(settings: PrintSettings): void {
  const cleanup = applyPrintSettings(settings)
  // Defer print to next tick so style takes effect
  setTimeout(() => {
    window.print()
    // Cleanup after dialog likely closed
    setTimeout(cleanup, 1500)
  }, 50)
}
