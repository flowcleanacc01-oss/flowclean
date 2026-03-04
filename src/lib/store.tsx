'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
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
import * as db from './supabase-service'

// ============================================================
// Store Interface (unchanged — UI sees this)
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
  updateExpense: (id: string, e: Partial<Expense>) => void
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
// Helper: fire-and-forget with error logging
// ============================================================
function dbSave(promise: Promise<void>) {
  promise.catch(err => console.error('[Supabase save error]', err))
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
  const seeded = useRef(false)

  // ---- Load from Supabase on mount ----
  useEffect(() => {
    let cancelled = false

    async function loadFromSupabase() {
      try {
        const data = await db.fetchAllData()

        if (cancelled) return

        // If Supabase is empty → seed with sample data
        const isEmpty = data.customers.length === 0 && data.users.length === 0

        if (isEmpty && !seeded.current) {
          seeded.current = true
          // Seed Supabase with sample data
          await seedSampleData()
          // Re-fetch after seeding
          const fresh = await db.fetchAllData()
          if (cancelled) return
          applyData(fresh)
        } else {
          applyData(data)
        }
      } catch (err) {
        console.error('[Supabase load error] Falling back to sample data', err)
        if (cancelled) return
        // Fallback: use sample data locally
        setCustomers(SAMPLE_CUSTOMERS)
        setLinenForms(SAMPLE_LINEN_FORMS)
        setDeliveryNotes(SAMPLE_DELIVERY_NOTES)
        setBillingStatements(SAMPLE_BILLING_STATEMENTS)
        setExpenses(SAMPLE_EXPENSES)
        setUsers(SAMPLE_USERS)
      }

      // Restore session
      if (typeof window !== 'undefined') {
        const session = sessionStorage.getItem('flowclean_user')
        if (session) {
          try { setCurrentUser(JSON.parse(session)) } catch { /* ignore */ }
        }
      }
      if (!cancelled) setLoaded(true)
    }

    function applyData(data: Awaited<ReturnType<typeof db.fetchAllData>>) {
      setCustomers(data.customers)
      // Normalize legacy rows: ensure col6_factoryPackSend exists (JSONB may omit it)
      setLinenForms(data.linenForms.map(form => ({
        ...form,
        rows: form.rows.map(row => ({
          ...row,
          col6_factoryPackSend: row.col6_factoryPackSend ?? 0,
        })),
      })))
      setDeliveryNotes(data.deliveryNotes)
      setBillingStatements(data.billingStatements)
      setTaxInvoices(data.taxInvoices)
      setQuotations(data.quotations)
      setExpenses(data.expenses)
      setUsers(data.users.length > 0 ? data.users : SAMPLE_USERS)
      setCompanyInfo(data.companyInfo || DEFAULT_COMPANY_INFO)
      setLinenCatalog(data.linenItems.length > 0 ? data.linenItems : STANDARD_LINEN_ITEMS)
      setChecklists(data.checklists)

      // Build defaultPrices from linenItems
      if (data.linenItems.length > 0) {
        const prices: Record<string, number> = {}
        for (const item of data.linenItems) {
          prices[item.code] = item.defaultPrice
        }
        setDefaultPrices(prices)
      }
    }

    loadFromSupabase()
    return () => { cancelled = true }
  }, [])

  // ---- Auth ----
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    dbSave(db.insertCustomer(newC))
    return newC
  }, [])

  const updateCustomer = useCallback((id: string, c: Partial<Customer>) => {
    setCustomers(prev => prev.map(x => x.id === id ? { ...x, ...c } : x))
    dbSave(db.updateCustomerDB(id, c))
  }, [])

  const deleteCustomer = useCallback((id: string) => {
    setCustomers(prev => prev.filter(x => x.id !== id))
    dbSave(db.deleteCustomerDB(id))
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
    dbSave(db.insertLinenForm(newForm))
    return newForm
  }, [currentUser])

  const updateLinenForm = useCallback((id: string, f: Partial<LinenForm>) => {
    const updates = { ...f, updatedAt: todayISO() }
    setLinenForms(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateLinenFormDB(id, updates))
  }, [])

  const updateLinenFormStatus = useCallback((id: string, status: LinenFormStatus) => {
    const updates = { status, updatedAt: todayISO() }
    setLinenForms(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateLinenFormDB(id, updates))
  }, [])

  const deleteLinenForm = useCallback((id: string) => {
    setLinenForms(prev => prev.filter(x => x.id !== id))
    dbSave(db.deleteLinenFormDB(id))
  }, [])

  // ---- Delivery Notes ----
  const addDeliveryNote = useCallback((d: Omit<DeliveryNote, 'id' | 'noteNumber' | 'createdBy' | 'updatedAt'>): DeliveryNote => {
    const newDN: DeliveryNote = {
      ...d, id: genId(), noteNumber: genDeliveryNoteNumber(),
      createdBy: currentUser?.id || 'unknown', updatedAt: todayISO(),
    }
    setDeliveryNotes(prev => [newDN, ...prev])
    dbSave(db.insertDeliveryNote(newDN))
    return newDN
  }, [currentUser])

  const updateDeliveryNote = useCallback((id: string, d: Partial<DeliveryNote>) => {
    const updates = { ...d, updatedAt: todayISO() }
    setDeliveryNotes(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateDeliveryNoteDB(id, updates))
  }, [])

  const updateDeliveryNoteStatus = useCallback((id: string, status: DeliveryNoteStatus) => {
    const updates = { status, updatedAt: todayISO() }
    setDeliveryNotes(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateDeliveryNoteDB(id, updates))
  }, [])

  const deleteDeliveryNote = useCallback((id: string) => {
    setDeliveryNotes(prev => prev.filter(x => x.id !== id))
    dbSave(db.deleteDeliveryNoteDB(id))
  }, [])

  // ---- Billing Statements ----
  const addBillingStatement = useCallback((b: Omit<BillingStatement, 'id' | 'billingNumber'>): BillingStatement => {
    const newBS: BillingStatement = { ...b, id: genId(), billingNumber: genBillingNumber() }
    setBillingStatements(prev => [newBS, ...prev])
    dbSave(db.insertBillingStatement(newBS))
    return newBS
  }, [])

  const updateBillingStatus = useCallback((id: string, status: BillingStatus, paidDate?: string) => {
    let resolvedPaidAmount: number | undefined
    setBillingStatements(prev => prev.map(bs => {
      if (bs.id !== id) return bs
      if (status === 'paid') resolvedPaidAmount = bs.netPayable
      return {
        ...bs, status,
        paidDate: status === 'paid' ? (paidDate || todayISO()) : bs.paidDate,
        paidAmount: status === 'paid' ? bs.netPayable : bs.paidAmount,
      }
    }))
    const updates: Partial<BillingStatement> = { status }
    if (status === 'paid') {
      updates.paidDate = paidDate || todayISO()
      if (resolvedPaidAmount !== undefined) updates.paidAmount = resolvedPaidAmount
    }
    dbSave(db.updateBillingStatementDB(id, updates))
  }, [])

  const deleteBillingStatement = useCallback((id: string) => {
    setBillingStatements(prev => prev.filter(x => x.id !== id))
    dbSave(db.deleteBillingStatementDB(id))
  }, [])

  // ---- Tax Invoices ----
  const addTaxInvoice = useCallback((t: Omit<TaxInvoice, 'id' | 'invoiceNumber'>): TaxInvoice => {
    const newTI: TaxInvoice = { ...t, id: genId(), invoiceNumber: genTaxInvoiceNumber() }
    setTaxInvoices(prev => [newTI, ...prev])
    dbSave(db.insertTaxInvoice(newTI))
    return newTI
  }, [])

  // ---- Quotations ----
  const addQuotation = useCallback((q: Omit<Quotation, 'id' | 'quotationNumber'>): Quotation => {
    const newQ: Quotation = { ...q, id: genId(), quotationNumber: genQuotationNumber() }
    setQuotations(prev => [newQ, ...prev])
    dbSave(db.insertQuotation(newQ))
    return newQ
  }, [])

  const updateQuotationStatus = useCallback((id: string, status: QuotationStatus) => {
    setQuotations(prev => prev.map(x => x.id === id ? { ...x, status } : x))
    dbSave(db.updateQuotationDB(id, { status }))
  }, [])

  // ---- Expenses ----
  const addExpense = useCallback((e: Omit<Expense, 'id' | 'createdBy'>): Expense => {
    const newExp: Expense = { ...e, id: genId(), createdBy: currentUser?.id || 'unknown' }
    setExpenses(prev => [newExp, ...prev])
    dbSave(db.insertExpense(newExp))
    return newExp
  }, [currentUser])

  const updateExpense = useCallback((id: string, e: Partial<Expense>) => {
    setExpenses(prev => prev.map(x => x.id === id ? { ...x, ...e } : x))
    dbSave(db.updateExpenseDB(id, e))
  }, [])

  const deleteExpense = useCallback((id: string) => {
    setExpenses(prev => prev.filter(x => x.id !== id))
    dbSave(db.deleteExpenseDB(id))
  }, [])

  // ---- Users ----
  const addUser = useCallback((u: Omit<AppUser, 'id'>): AppUser => {
    const newUser: AppUser = { ...u, id: genId() }
    setUsers(prev => [...prev, newUser])
    dbSave(db.insertUser(newUser))
    return newUser
  }, [])

  const updateUser = useCallback((id: string, u: Partial<AppUser>) => {
    setUsers(prev => prev.map(x => x.id === id ? { ...x, ...u } : x))
    dbSave(db.updateUserDB(id, u))
  }, [])

  // ---- Settings ----
  const updateDefaultPrice = useCallback((code: string, price: number) => {
    setDefaultPrices(prev => ({ ...prev, [code]: price }))
    dbSave(db.updateDefaultPriceDB(code, price))
  }, [])

  const updateCompanyInfo = useCallback((info: Partial<CompanyInfo>) => {
    setCompanyInfo(prev => {
      const updated = { ...prev, ...info }
      dbSave(db.upsertCompanyInfo(updated))
      return updated
    })
  }, [])

  // ---- Linen Catalog ----
  const addLinenItem = useCallback((item: LinenItemDef) => {
    setLinenCatalog(prev => [...prev, item])
    setDefaultPrices(prev => ({ ...prev, [item.code]: item.defaultPrice }))
    dbSave(db.insertLinenItem(item))
  }, [])

  const updateLinenItem = useCallback((code: string, updates: Partial<LinenItemDef>) => {
    setLinenCatalog(prev => prev.map(i => i.code === code ? { ...i, ...updates } : i))
    if (updates.defaultPrice !== undefined) {
      setDefaultPrices(prev => ({ ...prev, [code]: updates.defaultPrice! }))
    }
    dbSave(db.updateLinenItemDB(code, updates))
  }, [])

  const deleteLinenItem = useCallback((code: string) => {
    setLinenCatalog(prev => prev.filter(i => i.code !== code))
    setDefaultPrices(prev => {
      const next = { ...prev }
      delete next[code]
      return next
    })
    dbSave(db.deleteLinenItemDB(code))
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
    dbSave(db.insertChecklist(newCL))
    return newCL
  }, [currentUser])

  const updateChecklist = useCallback((id: string, c: Partial<ProductChecklist>) => {
    const updates = { ...c, updatedAt: todayISO() }
    setChecklists(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateChecklistDB(id, updates))
  }, [])

  const updateChecklistStatus = useCallback((id: string, status: ChecklistStatus) => {
    const updates = { status, updatedAt: todayISO() }
    setChecklists(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateChecklistDB(id, updates))
  }, [])

  const deleteChecklist = useCallback((id: string) => {
    setChecklists(prev => prev.filter(x => x.id !== id))
    dbSave(db.deleteChecklistDB(id))
  }, [])

  // ---- Computed Helpers ----
  const getCarryOver = useCallback((customerId: string, beforeDate: string): Record<string, number> => {
    const result: Record<string, number> = {}
    const forms = linenForms
      .filter(f => f.customerId === customerId && f.date < beforeDate)
      .sort((a, b) => a.date.localeCompare(b.date))

    // v4: carryOver = sum(col6_packSend - col4_approved - col5_claimApproved)
    // negative = ค้างส่ง, positive = ส่งเกิน
    for (const form of forms) {
      for (const row of form.rows) {
        const packSend = row.col6_factoryPackSend || 0
        const approved = row.col4_factoryApproved || 0
        const claimApproved = row.col5_factoryClaimApproved || 0
        const diff = packSend - approved - claimApproved
        if (diff !== 0) {
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
      const hotelCount = row.col2_hotelCountIn
      const factoryApproved = row.col4_factoryApproved
      if (factoryApproved > 0 && hotelCount !== factoryApproved) {
        result[row.code] = factoryApproved - hotelCount
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
      expenses, addExpense, updateExpense, deleteExpense,
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

// ============================================================
// Seed Sample Data to Supabase (first time only)
// ============================================================
async function seedSampleData() {
  console.log('[FlowClean] Seeding sample data to Supabase...')

  try {
    // Seed in dependency order
    await db.upsertLinenItems(STANDARD_LINEN_ITEMS)
    await db.upsertUsers(SAMPLE_USERS)
    await db.upsertCompanyInfo(DEFAULT_COMPANY_INFO)

    // Customers
    for (const c of SAMPLE_CUSTOMERS) {
      await db.insertCustomer(c)
    }

    // Linen Forms
    for (const f of SAMPLE_LINEN_FORMS) {
      await db.insertLinenForm(f)
    }

    // Delivery Notes
    for (const dn of SAMPLE_DELIVERY_NOTES) {
      await db.insertDeliveryNote(dn)
    }

    // Billing Statements
    for (const bs of SAMPLE_BILLING_STATEMENTS) {
      await db.insertBillingStatement(bs)
    }

    // Expenses
    for (const exp of SAMPLE_EXPENSES) {
      await db.insertExpense(exp)
    }

    console.log('[FlowClean] Sample data seeded successfully')
  } catch (err) {
    console.error('[FlowClean] Seed error:', err)
    throw err
  }
}
