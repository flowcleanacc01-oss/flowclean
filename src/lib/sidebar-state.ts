'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'flowclean_sidebar_collapsed'

let collapsed = false
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  try {
    collapsed = window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    collapsed = false
  }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

const getSnapshot = () => collapsed
const getServerSnapshot = () => false

export function useSidebarCollapsed(): [boolean, (next: boolean | ((v: boolean) => boolean)) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setValue = (next: boolean | ((v: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(collapsed) : next
    if (resolved === collapsed) return
    collapsed = resolved
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, resolved ? '1' : '0')
      }
    } catch { /* ignore quota errors */ }
    listeners.forEach(l => l())
  }
  return [value, setValue]
}
