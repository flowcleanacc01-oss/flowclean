'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  Truck,
  FileText,
  FileCheck,
  Receipt,
  BarChart3,
  Wallet,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Package,
  BookOpen,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { useState } from 'react'
import Image from 'next/image'
import { USER_ROLE_CONFIG, type UserRole } from '@/types'
import {
  canViewLF, canViewSD, canViewCustomers, canViewBilling,
  canViewReports, canViewExpenses, canManageItems, canManageSettings,
} from '@/lib/permissions'
import type { AppUser } from '@/types'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  guard?: (u: AppUser | null) => boolean
  separator?: boolean
}

// 69: each nav item has its own guard function from lib/permissions
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { href: '/dashboard/items', label: 'รายการผ้า', icon: Package, guard: canManageItems },
  { href: '/dashboard/customers', label: 'ลูกค้า', icon: Building2, guard: canViewCustomers },
  { href: '/dashboard/billing?tab=quotation', label: 'ใบเสนอราคา (QT)', icon: FileText, guard: canViewBilling },
  { href: '/dashboard/linen-forms', label: '1. ใบส่งรับผ้า (LF)', icon: ClipboardList, guard: canViewLF },
  { href: '/dashboard/delivery', label: '2. ใบส่งของชั่วคราว (SD)', icon: Truck, guard: canViewSD },
  { href: '/dashboard/billing?tab=billing', label: '3. ใบวางบิล (WB)', icon: FileCheck, guard: canViewBilling },
  { href: '/dashboard/billing?tab=invoice', label: '4. ใบกำกับภาษี/ใบเสร็จ (IV)', icon: Receipt, guard: canViewBilling },
  { href: '/dashboard/receipts', label: '5. ใบเสร็จรับเงิน (RC)', icon: Receipt, guard: canViewBilling },
  { href: '/dashboard/reports', label: 'รายงาน', icon: BarChart3, guard: canViewReports },
  { href: '/dashboard/expenses', label: 'รายจ่าย', icon: Wallet, guard: canViewExpenses },
  { href: '/dashboard/guide', label: 'คู่มือการใช้งาน', icon: BookOpen, separator: true },
  { href: '/dashboard/settings', label: 'ตั้งค่า', icon: Settings, guard: canManageSettings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const currentSearchParams = useSearchParams()
  const { currentUser, logout } = useStore()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    const [path, qs] = href.split('?')
    if (!pathname.startsWith(path)) return false
    if (!qs) return true
    // For billing tabs, match query param
    const params = new URLSearchParams(qs)
    const tab = params.get('tab')
    if (tab) {
      const currentTab = currentSearchParams.get('tab')
      return currentTab === tab || (!currentTab && tab === 'billing')
    }
    return true
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
          <Image src="/flowclean-logo.png" alt="FlowClean" width={36} height={36} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-white font-bold text-lg leading-tight">FlowClean</h1>
            <p className="text-slate-400 text-[11px]">ระบบบริหารโรงซักรีด</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href)
          const Icon = item.icon
          // 69: hide menu if user role doesn't pass guard
          if (item.guard && !item.guard(currentUser)) return null
          return (
            <div key={item.href}>
              {'separator' in item && item.separator && (
                <div className="border-t border-slate-700 my-2" />
              )}
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-[#1B3A5C] text-[#3DD8D8] shadow-md shadow-slate-900/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )}
              >
                <Icon className={cn('w-5 h-5 flex-shrink-0', active ? 'text-[#3DD8D8]' : 'text-slate-500')} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 pb-4">
        <div className={cn(
          'border-t border-slate-700 pt-4',
          collapsed ? 'px-1' : 'px-2'
        )}>
          {!collapsed && currentUser && (() => {
            const cfg = USER_ROLE_CONFIG[currentUser.role as UserRole] || USER_ROLE_CONFIG.staff
            // Sidebar uses dark theme — pick role colors that work on dark bg
            const darkRoleClass = {
              admin:      'bg-amber-500/20 text-amber-400',
              accountant: 'bg-purple-500/20 text-purple-300',
              staff:      'bg-teal-500/20 text-teal-400',
              driver:     'bg-blue-500/20 text-blue-300',
              operator:   'bg-slate-500/20 text-slate-300',
            }[currentUser.role as UserRole] || 'bg-teal-500/20 text-teal-400'
            return (
              <div className="mb-3">
                <p className="text-sm text-white font-medium truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                <span className={cn('inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full', darkRoleClass)}>
                  {cfg.label}
                </span>
              </div>
            )
          })()}
          <button
            onClick={logout}
            className="flex items-center gap-2 text-slate-400 hover:text-red-400 text-sm w-full px-1 py-1.5 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>ออกจากระบบ</span>}
          </button>
        </div>
      </div>

      {/* Collapse toggle (desktop) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center py-3 border-t border-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
      </button>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        'lg:hidden fixed top-0 left-0 h-full bg-slate-900 z-50 w-64 transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden lg:block fixed top-0 left-0 h-full bg-slate-900 z-30 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}>
        {sidebarContent}
      </aside>
    </>
  )
}
