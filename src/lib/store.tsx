'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type {
  Customer, LinenForm, LinenFormStatus, DeliveryNote, DeliveryNoteStatus,
  BillingStatement, BillingStatus, TaxInvoice, Quotation, QuotationStatus,
  Expense, AppUser, CompanyInfo, LinenItemDef,
  ProductChecklist, ChecklistStatus,
} from '@/types'
import { STANDARD_LINEN_ITEMS } from '@/types'
import {
  SAMPLE_CUSTOMERS, SAMPLE_LINEN_FORMS, SAMPLE_DELIVERY_NOTES,
  SAMPLE_BILLING_STATEMENTS, SAMPLE_EXPENSES, SAMPLE_USERS,
  DEFAULT_COMPANY_INFO, DEFAULT_PRICES,
} from './mock-data'
import {
  genId, genLinenFormNumber, genDeliveryNoteNumber, genBillingNumber,
  genTaxInvoiceNumber, genQuotationNumber, genChecklistNumber, todayISO,
} from './utils'

// ============================================================
// Store Interface
// ============================================================
interface StoreContextType {
  // Auth
  currentUser: AppUser | null
  login: (email: string, password: string) => boolean
  logout: () => void

  // Customers
  customers: Customer[]
  addCustomer: (c: Omit<Customer, 'id' | 'createdAt'>) => Customer
  updateCustomer: (id: string, c: Partial<Customer>) => void
  deleteCustomer: (id: string) => void
  getCustomer: (id: string) => Customer | undefined

  // Linen Forms
  linenForms: LinenForm[]
  addLinenForm: (f: Omit<LinenForm, 'id' | 'formNumber' | 'createdBy' | 'updatedAt'>) => LinenForm
  updateLinenForm: (id: string, f: Partial<LinenForm>) => void
  updateLinenFormStatus: (id: string, status: LinenFormStatus) => void
  deleteLinenForm: (id: string) => void

  // Delivery Notes
  deliveryNotes: DeliveryNote[]
  addDeliveryNote: (d: Omit<DeliveryNote, 'id' | 'noteNumber' | 'createdBy' | 'updatedAt'>) => DeliveryNote
  updateDeliveryNote: (id: string, d: Partial<DeliveryNote>) => void
  updateDeliveryNoteStatus: (id: string, status: DeliveryNoteStatus) => void
  deleteDeliveryNote: (id: string) => void

  // Billing
  billingStatements: BillingStatement[]
  addBillingStatement: (b: Omit<BillingStatement, 'id' | 'billingNumber'>) => BillingStatement
  updateBillingStatus: (id: string, status: BillingStatus, paidDate?: string) => void
  deleteBillingStatement: (id: string) => void

  // Tax Invoices
  taxInvoices: TaxInvoice[]
  addTaxInvoice: (t: Omit<TaxInvoice, 'id' | 'invoiceNumber'>) => TaxInvoice

  // Quotations
  quotations: Quotation[]
  addQuotation: (q: Omit<Quotation, 'id' | 'quotationNumber'>) => Quotation
  updateQuotationStatus: (id: string, status: QuotationStatus) => void

  // Expenses
  expenses: Expense[]
  addExpense: (e: Omit<Expense, 'id' | 'createdBy'>) => Expense
  deleteExpense: (id: string) => void

  // Users
  users: AppUser[]
  addUser: (u: Omit<AppUser, 'id'>) => AppUser
  updateUser: (id: string, u: Partial<AppUser>) => void

  // Settings
  defaultPrices: Record<string, number>
  updateDefaultPrice: (code: string, price: number) => void
  companyInfo: CompanyInfo
  updateCompanyInfo: (info: Partial<CompanyInfo>) => void

  // Linen Catalog
  linenCatalog: LinenItemDef[]
  addLinenItem: (item: LinenItemDef) => void
  updateLinenItem: (code: string, updates: Partial<LinenItemDef>) => void
  deleteLinenItem: (code: string) => void
  getItemName: (code: string) => string
  getItemNameMap: () => Record<string, string>

  // Checklists
  checklists: ProductChecklist[]
  addChecklist: (c: Omit<ProductChecklist, 'id' | 'checklistNumber' | 'createdBy' | 'updatedAt'>) => ProductChecklist
  updateChecklist: (id: string, c: Partial<ProductChecklist>) => void
  updateChecklistStatus: (id: string, status: ChecklistStatus) => void
  deleteChecklist: (id: string) => void

  // Computed helpers
  getCarryOver: (customerId: string, beforeDate: string) => Record<string, number>
  getDiscrepancies: (formId: string) => Record<string, number>
}

const StoreContext = createContext<StoreContextType | null>(null)

// ============================================================
// Local Storage
// ============================================================
const STORAGE_KEY = 'flowclean_data_v2'

interface StoredData {
  customers: Customer[]
  linenForms: LinenForm[]
  deliveryNotes: DeliveryNote[]
  billingStatements: BillingStatement[]
  taxInvoices: TaxInvoice[]
  quotations: Quotation[]
  expenses: Expense[]
  users: AppUser[]
  defaultPrices: Record<string, number>
  companyInfo: CompanyInfo
  linenCatalog?: LinenItemDef[]
  checklists?: ProductChecklist[]
  initialized: boolean
}

function loadData(): StoredData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveData(data: StoredData) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

// ============================================================
// Provider
// ============================================================
export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [linenForms, setLinenForms] = useState<LinenForm[]>([])
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([])
  const [billingStatements, setBillingStatements] = useState<BillingStatement[]>([])
  const [taxInvoices, setTaxInvoices] = useState<TaxInvoice[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [defaultPrices, setDefaultPrices] = useState<Record<string, number>>(DEFAULT_PRICES)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(DEFAULT_COMPANY_INFO)
  const [linenCatalog, setLinenCatalog] = useState<LinenItemDef[]>(STANDARD_LINEN_ITEMS)
  const [checklists, setChecklists] = useState<ProductChecklist[]>([])
  const [loaded, setLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadData()
    if (stored?.initialized) {
      setCustomers(stored.customers)
      // Migration: processing → washing (for old data)
      setLinenForms(stored.linenForms.map(f => {
        const status = f.status as string
        return status === 'processing' ? { ...f, status: 'washing' as LinenFormStatus } : f
      }))
      setDeliveryNotes(stored.deliveryNotes)
      setBillingStatements(stored.billingStatements)
      setTaxInvoices(stored.taxInvoices || [])
      setQuotations(stored.quotations || [])
      setExpenses(stored.expenses)
      setUsers(stored.users)
      setDefaultPrices(stored.defaultPrices || DEFAULT_PRICES)
      setCompanyInfo(stored.companyInfo || DEFAULT_COMPANY_INFO)
      setLinenCatalog(stored.linenCatalog || STANDARD_LINEN_ITEMS)
      setChecklists(stored.checklists || [])
    } else {
      setCustomers(SAMPLE_CUSTOMERS)
      setLinenForms(SAMPLE_LINEN_FORMS)
      setDeliveryNotes(SAMPLE_DELIVERY_NOTES)
      setBillingStatements(SAMPLE_BILLING_STATEMENTS)
      setExpenses(SAMPLE_EXPENSES)
      setUsers(SAMPLE_USERS)
    }
    if (typeof window !== 'undefined') {
      const session = sessionStorage.getItem('flowclean_user')
      if (session) {
        try { setCurrentUser(JSON.parse(session)) } catch { /* ignore */ }
      }
    }
    setLoaded(true)
  }, [])

  // Save to localStorage on changes
  useEffect(() => {
    if (!loaded) return
    saveData({
      customers, linenForms, deliveryNotes, billingStatements,
      taxInvoices, quotations, expenses, users, defaultPrices, companyInfo,
      linenCatalog, checklists, initialized: true,
    })
  }, [customers, linenForms, deliveryNotes, billingStatements, taxInvoices, quotations, expenses, users, defaultPrices, companyInfo, linenCatalog, checklists, loaded])

  // ---- Auth ----
  const login = useCallback((email: string, _password: string): boolean => {
    const allUsers = users.length > 0 ? users : SAMPLE_USERS
    const user = allUsers.find(u => u.email === email && u.isActive)
    if (user) {
      setCurrentUser(user)
      if (typeof window !== 'undefined') sessionStorage.setItem('flowclean_user', JSON.stringify(user))
      return true
    }
    const demoUser: AppUser = { id: 'demo', name: email.split('@')[0], email, role: 'admin', isActive: true }
    setCurrentUser(demoUser)
    if (typeof window !== 'undefined') sessionStorage.setItem('flowclean_user', JSON.stringify(demoUser))
    return true
  }, [users])

  const logout = useCallback(() => {
    setCurrentUser(null)
    if (typeof window !== 'undefined') sessionStorage.removeItem('flowclean_user')
  }, [])

  // ---- Customers ----
  const addCustomer = useCallback((c: Omit<Customer, 'id' | 'createdAt'>): Customer => {
    const newC: Customer = { ...c, id: genId(), createdAt: todayISO() }
    setCustomers(prev => [...prev, newC])
    return newC
  }, [])

  const updateCustomer = useCallback((id: string, c: Partial<Customer>) => {
    setCustomers(prev => prev.map(x => x.id === id ? { ...x, ...c } : x))
  }, [])

  const deleteCustomer = useCallback((id: string) => {
    setCustomers(prev => prev.filter(x => x.id !== id))
  }, [])

  const getCustomer = useCallback((id: string) => {
    return customers.find(c => c.id === id)
  }, [customers])

  // ---- Linen Forms ----
  const addLinenForm = useCallback((f: Omit<LinenForm, 'id' | 'formNumber' | 'createdBy' | 'updatedAt'>): LinenForm => {
    const newForm: LinenForm = {
      ...f, id: genId(), formNumber: genLinenFormNumber(),
      createdBy: currentUser?.id || 'unknown', updatedAt: todayISO(),
    }
    setLinenForms(prev => [newForm, ...prev])
    return newForm
  }, [currentUser])

  const updateLinenForm = useCallback((id: string, f: Partial<LinenForm>) => {
    setLinenForms(prev => prev.map(x => x.id === id ? { ...x, ...f, updatedAt: todayISO() } : x))
  }, [])

  const updateLinenFormStatus = useCallback((id: string, status: LinenFormStatus) => {
    setLinenForms(prev => prev.map(x => x.id === id ? { ...x, status, updatedAt: todayISO() } : x))
  }, [])

  const deleteLinenForm = useCallback((id: string) => {
    setLinenForms(prev => prev.filter(x => x.id !== id))
  }, [])

  // ---- Delivery Notes ----
  const addDeliveryNote = useCallback((d: Omit<DeliveryNote, 'id' | 'noteNumber' | 'createdBy' | 'updatedAt'>): DeliveryNote => {
    const newDN: DeliveryNote = {
      ...d, id: genId(), noteNumber: genDeliveryNoteNumber(),
      createdBy: currentUser?.id || 'unknown', updatedAt: todayISO(),
    }
    setDeliveryNotes(prev => [newDN, ...prev])
    return newDN
  }, [currentUser])

  const updateDeliveryNote = useCallback((id: string, d: Partial<DeliveryNote>) => {
    setDeliveryNotes(prev => prev.map(x => x.id === id ? { ...x, ...d, updatedAt: todayISO() } : x))
  }, [])

  const updateDeliveryNoteStatus = useCallback((id: string, status: DeliveryNoteStatus) => {
    setDeliveryNotes(prev => prev.map(x => x.id === id ? { ...x, status, updatedAt: todayISO() } : x))
  }, [])

  const deleteDeliveryNote = useCallback((id: string) => {
    setDeliveryNotes(prev => prev.filter(x => x.id !== id))
  }, [])

  // ---- Billing Statements ----
  const addBillingStatement = useCallback((b: Omit<BillingStatement, 'id' | 'billingNumber'>): BillingStatement => {
    const newBS: BillingStatement = { ...b, id: genId(), billingNumber: genBillingNumber() }
    setBillingStatements(prev => [newBS, ...prev])
    return newBS
  }, [])

  const updateBillingStatus = useCallback((id: string, status: BillingStatus, paidDate?: string) => {
    setBillingStatements(prev => prev.map(bs => {
      if (bs.id !== id) return bs
      return {
        ...bs, status,
        paidDate: status === 'paid' ? (paidDate || todayISO()) : bs.paidDate,
        paidAmount: status === 'paid' ? bs.netPayable : bs.paidAmount,
      }
    }))
  }, [])

  const deleteBillingStatement = useCallback((id: string) => {
    setBillingStatements(prev => prev.filter(x => x.id !== id))
  }, [])

  // ---- Tax Invoices ----
  const addTaxInvoice = useCallback((t: Omit<TaxInvoice, 'id' | 'invoiceNumber'>): TaxInvoice => {
    const newTI: TaxInvoice = { ...t, id: genId(), invoiceNumber: genTaxInvoiceNumber() }
    setTaxInvoices(prev => [newTI, ...prev])
    return newTI
  }, [])

  // ---- Quotations ----
  const addQuotation = useCallback((q: Omit<Quotation, 'id' | 'quotationNumber'>): Quotation => {
    const newQ: Quotation = { ...q, id: genId(), quotationNumber: genQuotationNumber() }
    setQuotations(prev => [newQ, ...prev])
    return newQ
  }, [])

  const updateQuotationStatus = useCallback((id: string, status: QuotationStatus) => {
    setQuotations(prev => prev.map(x => x.id === id ? { ...x, status } : x))
  }, [])

  // ---- Expenses ----
  const addExpense = useCallback((e: Omit<Expense, 'id' | 'createdBy'>): Expense => {
    const newExp: Expense = { ...e, id: genId(), createdBy: currentUser?.id || 'unknown' }
    setExpenses(prev => [newExp, ...prev])
    return newExp
  }, [currentUser])

  const deleteExpense = useCallback((id: string) => {
    setExpenses(prev => prev.filter(x => x.id !== id))
  }, [])

  // ---- Users ----
  const addUser = useCallback((u: Omit<AppUser, 'id'>): AppUser => {
    const newUser: AppUser = { ...u, id: genId() }
    setUsers(prev => [...prev, newUser])
    return newUser
  }, [])

  const updateUser = useCallback((id: string, u: Partial<AppUser>) => {
    setUsers(prev => prev.map(x => x.id === id ? { ...x, ...u } : x))
  }, [])

  // ---- Settings ----
  const updateDefaultPrice = useCallback((code: string, price: number) => {
    setDefaultPrices(prev => ({ ...prev, [code]: price }))
  }, [])

  const updateCompanyInfo = useCallback((info: Partial<CompanyInfo>) => {
    setCompanyInfo(prev => ({ ...prev, ...info }))
  }, [])

  // ---- Linen Catalog ----
  const addLinenItem = useCallback((item: LinenItemDef) => {
    setLinenCatalog(prev => [...prev, item])
    setDefaultPrices(prev => ({ ...prev, [item.code]: item.defaultPrice }))
  }, [])

  const updateLinenItem = useCallback((code: string, updates: Partial<LinenItemDef>) => {
    setLinenCatalog(prev => prev.map(i => i.code === code ? { ...i, ...updates } : i))
    if (updates.defaultPrice !== undefined) {
      setDefaultPrices(prev => ({ ...prev, [code]: updates.defaultPrice! }))
    }
  }, [])

  const deleteLinenItem = useCallback((code: string) => {
    setLinenCatalog(prev => prev.filter(i => i.code !== code))
    setDefaultPrices(prev => {
      const next = { ...prev }
      delete next[code]
      return next
    })
  }, [])

  const getItemName = useCallback((code: string): string => {
    return linenCatalog.find(i => i.code === code)?.name || code
  }, [linenCatalog])

  const getItemNameMap = useCallback((): Record<string, string> => {
    return Object.fromEntries(linenCatalog.map(i => [i.code, i.name]))
  }, [linenCatalog])

  // ---- Checklists ----
  const addChecklist = useCallback((c: Omit<ProductChecklist, 'id' | 'checklistNumber' | 'createdBy' | 'updatedAt'>): ProductChecklist => {
    const newCL: ProductChecklist = {
      ...c, id: genId(), checklistNumber: genChecklistNumber(),
      createdBy: currentUser?.id || 'unknown', updatedAt: todayISO(),
    }
    setChecklists(prev => [newCL, ...prev])
    return newCL
  }, [currentUser])

  const updateChecklist = useCallback((id: string, c: Partial<ProductChecklist>) => {
    setChecklists(prev => prev.map(x => x.id === id ? { ...x, ...c, updatedAt: todayISO() } : x))
  }, [])

  const updateChecklistStatus = useCallback((id: string, status: ChecklistStatus) => {
    setChecklists(prev => prev.map(x => x.id === id ? { ...x, status, updatedAt: todayISO() } : x))
  }, [])

  const deleteChecklist = useCallback((id: string) => {
    setChecklists(prev => prev.filter(x => x.id !== id))
  }, [])

  // ---- Computed Helpers ----
  const getCarryOver = useCallback((customerId: string, beforeDate: string): Record<string, number> => {
    const result: Record<string, number> = {}
    const forms = linenForms
      .filter(f => f.customerId === customerId && f.date < beforeDate)
      .sort((a, b) => a.date.localeCompare(b.date))

    for (const form of forms) {
      for (const row of form.rows) {
        const counted = row.col4_factoryCountIn
        const packed = row.col5_factoryPackSend
        const diff = counted - packed
        if (diff > 0) {
          result[row.code] = (result[row.code] || 0) + diff
        }
      }
    }
    return result
  }, [linenForms])

  const getDiscrepancies = useCallback((formId: string): Record<string, number> => {
    const form = linenForms.find(f => f.id === formId)
    if (!form) return {}

    const result: Record<string, number> = {}
    for (const row of form.rows) {
      const sent = row.col1_normalSend + row.col2_claimSend
      const counted = row.col4_factoryCountIn
      if (counted > 0 && sent !== counted) {
        result[row.code] = counted - sent
      }
    }
    return result
  }, [linenForms])

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return (
    <StoreContext.Provider value={{
      currentUser, login, logout,
      customers, addCustomer, updateCustomer, deleteCustomer, getCustomer,
      linenForms, addLinenForm, updateLinenForm, updateLinenFormStatus, deleteLinenForm,
      deliveryNotes, addDeliveryNote, updateDeliveryNote, updateDeliveryNoteStatus, deleteDeliveryNote,
      billingStatements, addBillingStatement, updateBillingStatus, deleteBillingStatement,
      taxInvoices, addTaxInvoice,
      quotations, addQuotation, updateQuotationStatus,
      expenses, addExpense, deleteExpense,
      users, addUser, updateUser,
      defaultPrices, updateDefaultPrice,
      companyInfo, updateCompanyInfo,
      linenCatalog, addLinenItem, updateLinenItem, deleteLinenItem, getItemName, getItemNameMap,
      checklists, addChecklist, updateChecklist, updateChecklistStatus, deleteChecklist,
      getCarryOver, getDiscrepancies,
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): StoreContextType {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
