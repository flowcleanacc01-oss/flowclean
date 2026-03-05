'use client'

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'

interface ToastMessage {
  id: number
  text: string
  type: 'success' | 'error'
}

interface ToastContextType {
  showToast: (text: string, type?: 'success' | 'error') => void
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} })

let _nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    const id = ++_nextId
    setToasts(prev => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  // Listen for DB error events from store's dbSave
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      showToast(detail || 'เกิดข้อผิดพลาด', 'error')
    }
    window.addEventListener('flowclean:db-error', handler)
    return () => window.removeEventListener('flowclean:db-error', handler)
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
          {toasts.map(t => (
            <div key={t.id}
              className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fadeIn ${
                t.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}>
              {t.type === 'error' ? '⚠ ' : '✓ '}{t.text}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
