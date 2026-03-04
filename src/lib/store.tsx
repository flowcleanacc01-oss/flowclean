'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type {
  Customer, LinenForm, LinenFormStatus, DeliveryNote, DeliveryNoteStatus,
  BillingStatement, BillingStatus, TaxInvoice, Quotation, QuotationStatus,
  Expense, AppUser, CompanyInfo, LinenItemDef,
  ProductChecklist, ChecklistStatus,
  AuditAction, AuditEntityType, AuditLog,
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
import { verifyPassword, hashPassword, createSession, getSession, clearSession } from './auth'
import * as db from './supabase-service'

// ============================================================
// Store Interface
// ============================================================
interface StoreContextType {
  // Auth
  currentUser: AppUser | null
  login: (email: string, password: string) => Promise<boolean>
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
  addUser: (u: Omit<AppUser, 'id'>, password: string) => Promise<AppUser>
  updateUser: (id: string, u: Partial<AppUser>) => void
  resetPassword: (userId: string, newPassword: string) => Promise<void>

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
// Helper: fire-and-forget with error logging + optional rollback
// ============================================================
function dbSave(promise: Promise<void>, onError?: () => void) {
  promise.catch(err => {
    console.error('[Supabase save error]', err)
    if (onError) onError()
  })
}

// ============================================================
// Helper: Strip passwordHash from AppUser for React state
// ============================================================
function stripHash(user: AppUser): AppUser {
  return { ...user, passwordHash: '' }
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
  const currentUserRef = useRef<AppUser | null>(null)

  // Keep ref in sync for use in callbacks without dependency
  useEffect(() => { currentUserRef.current = currentUser }, [currentUser])

  // ---- Audit Log Helper (fire-and-forget) ----
  const logAudit = useCallback((
    action: AuditAction,
    entityType: AuditEntityType,
    entityId: string,
    entityLabel: string,
    details: string = '',
    overrideUser?: { id: string; name: string },
  ) => {
    const user = overrideUser || currentUserRef.current
    const log: AuditLog = {
      id: genId(),
      userId: user?.id || 'system',
      userName: user?.name || 'ระบบ',
      action,
      entityType,
      entityId,
      entityLabel,
      details,
      createdAt: new Date().toISOString(),
    }
    dbSave(db.insertAuditLog(log))
  }, [])

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
        setUsers(SAMPLE_USERS.map(stripHash))
      }

      // Restore session (8-hour expiry)
      const session = getSession()
      if (session) {
        // Reconstruct user from session data (no passwordHash)
        setCurrentUser({
          id: session.userId,
          name: session.userName,
          email: session.userEmail,
          passwordHash: '',
          role: session.userRole,
          isActive: true,
        })
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
      // Strip passwordHash from all users in React state
      const loadedUsers = data.users.length > 0 ? data.users : SAMPLE_USERS
      setUsers(loadedUsers.map(stripHash))
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
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      // Fetch user with passwordHash from DB
      const dbUser = await db.fetchUserByEmail(email)

      if (!dbUser || !dbUser.isActive) {
        // Log failed login attempt
        logAudit('login_fail', 'session', '', email, `อีเมล ${email} ไม่พบหรือถูกปิดใช้งาน`)
        return false
      }

      // Verify password with bcrypt
      const valid = await verifyPassword(password, dbUser.passwordHash)
      if (!valid) {
        logAudit('login_fail', 'session', dbUser.id, email, 'รหัสผ่านไม่ถูกต้อง')
        return false
      }

      // Success — set user without passwordHash
      const safeUser = stripHash(dbUser)
      setCurrentUser(safeUser)
      createSession(dbUser)
      logAudit('login', 'session', dbUser.id, dbUser.name, '', { id: dbUser.id, name: dbUser.name })
      return true
    } catch (err) {
      console.error('[Login error]', err)
      // Fallback: try local sample users
      const localUser = SAMPLE_USERS.find(u => u.email === email && u.isActive)
      if (localUser) {
        const valid = await verifyPassword(password, localUser.passwordHash)
        if (valid) {
          const safeUser = stripHash(localUser)
          setCurrentUser(safeUser)
          createSession(localUser)
          return true
        }
      }
      return false
    }
  }, [logAudit])

  const logout = useCallback(() => {
    logAudit('logout', 'session', currentUserRef.current?.id || '', currentUserRef.current?.name || '')
    setCurrentUser(null)
    clearSession()
  }, [logAudit])

  // ---- Customers ----
  const addCustomer = useCallback((c: Omit<Customer, 'id' | 'createdAt'>): Customer => {
    const newC: Customer = { ...c, id: genId(), createdAt: todayISO() }
    setCustomers(prev => [...prev, newC])
    dbSave(db.insertCustomer(newC), () => {
      setCustomers(prev => prev.filter(x => x.id !== newC.id))
    })
    logAudit('create', 'customer', newC.id, newC.name)
    return newC
  }, [logAudit])

  const updateCustomer = useCallback((id: string, c: Partial<Customer>) => {
    setCustomers(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'customer', id, old?.name || id)
      return prev.map(x => x.id === id ? { ...x, ...c } : x)
    })
    dbSave(db.updateCustomerDB(id, c))
  }, [logAudit])

  const deleteCustomer = useCallback((id: string) => {
    setCustomers(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'customer', id, old?.name || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteCustomerDB(id))
  }, [logAudit])

  const getCustomer = useCallback((id: string) => {
    return customers.find(c => c.id === id)
  }, [customers])

  // ---- Linen Forms ----
  const addLinenForm = useCallback((f: Omit<LinenForm, 'id' | 'formNumber' | 'createdBy' | 'updatedAt'>): LinenForm => {
    const newForm: LinenForm = {
      ...f, id: genId(), formNumber: genLinenFormNumber(),
      createdBy: currentUserRef.current?.id || 'unknown', updatedAt: todayISO(),
    }
    setLinenForms(prev => [newForm, ...prev])
    dbSave(db.insertLinenForm(newForm), () => {
      setLinenForms(prev => prev.filter(x => x.id !== newForm.id))
    })
    logAudit('create', 'linen_form', newForm.id, newForm.formNumber)
    return newForm
  }, [logAudit])

  const updateLinenForm = useCallback((id: string, f: Partial<LinenForm>) => {
    const updates = { ...f, updatedAt: todayISO() }
    setLinenForms(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'linen_form', id, old?.formNumber || id)
      return prev.map(x => x.id === id ? { ...x, ...updates } : x)
    })
    dbSave(db.updateLinenFormDB(id, updates))
  }, [logAudit])

  const updateLinenFormStatus = useCallback((id: string, status: LinenFormStatus) => {
    const updates = { status, updatedAt: todayISO() }
    setLinenForms(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'linen_form', id, old?.formNumber || id, `สถานะ → ${status}`)
      return prev.map(x => x.id === id ? { ...x, ...updates } : x)
    })
    dbSave(db.updateLinenFormDB(id, updates))
  }, [logAudit])

  const deleteLinenForm = useCallback((id: string) => {
    setLinenForms(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'linen_form', id, old?.formNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteLinenFormDB(id))
  }, [logAudit])

  // ---- Delivery Notes ----
  const addDeliveryNote = useCallback((d: Omit<DeliveryNote, 'id' | 'noteNumber' | 'createdBy' | 'updatedAt'>): DeliveryNote => {
    const newDN: DeliveryNote = {
      ...d, id: genId(), noteNumber: genDeliveryNoteNumber(),
      createdBy: currentUserRef.current?.id || 'unknown', updatedAt: todayISO(),
    }
    setDeliveryNotes(prev => [newDN, ...prev])
    dbSave(db.insertDeliveryNote(newDN), () => {
      setDeliveryNotes(prev => prev.filter(x => x.id !== newDN.id))
    })
    logAudit('create', 'delivery_note', newDN.id, newDN.noteNumber)
    return newDN
  }, [logAudit])

  const updateDeliveryNote = useCallback((id: string, d: Partial<DeliveryNote>) => {
    const updates = { ...d, updatedAt: todayISO() }
    setDeliveryNotes(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'delivery_note', id, old?.noteNumber || id)
      return prev.map(x => x.id === id ? { ...x, ...updates } : x)
    })
    dbSave(db.updateDeliveryNoteDB(id, updates))
  }, [logAudit])

  const updateDeliveryNoteStatus = useCallback((id: string, status: DeliveryNoteStatus) => {
    const updates = { status, updatedAt: todayISO() }
    setDeliveryNotes(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'delivery_note', id, old?.noteNumber || id, `สถานะ → ${status}`)
      return prev.map(x => x.id === id ? { ...x, ...updates } : x)
    })
    dbSave(db.updateDeliveryNoteDB(id, updates))

    // Sync linked linen form statuses
    const note = deliveryNotes.find(dn => dn.id === id)
    if (note && status === 'delivered') {
      for (const formId of note.linenFormIds) {
        const formUpdates = { status: 'delivered' as LinenFormStatus, updatedAt: todayISO() }
        setLinenForms(prev => prev.map(x => x.id === formId ? { ...x, ...formUpdates } : x))
        dbSave(db.updateLinenFormDB(formId, formUpdates))
      }
    } else if (note && status === 'acknowledged') {
      for (const formId of note.linenFormIds) {
        const formUpdates = { status: 'confirmed' as LinenFormStatus, updatedAt: todayISO() }
        setLinenForms(prev => prev.map(x => x.id === formId ? { ...x, ...formUpdates } : x))
        dbSave(db.updateLinenFormDB(formId, formUpdates))
      }
    }
  }, [deliveryNotes, logAudit])

  const deleteDeliveryNote = useCallback((id: string) => {
    setDeliveryNotes(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'delivery_note', id, old?.noteNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteDeliveryNoteDB(id))
  }, [logAudit])

  // ---- Billing Statements ----
  const addBillingStatement = useCallback((b: Omit<BillingStatement, 'id' | 'billingNumber'>): BillingStatement => {
    const newBS: BillingStatement = { ...b, id: genId(), billingNumber: genBillingNumber() }
    setBillingStatements(prev => [newBS, ...prev])
    dbSave(db.insertBillingStatement(newBS), () => {
      setBillingStatements(prev => prev.filter(x => x.id !== newBS.id))
    })
    logAudit('create', 'billing', newBS.id, newBS.billingNumber)
    return newBS
  }, [logAudit])

  const updateBillingStatus = useCallback((id: string, status: BillingStatus, paidDate?: string) => {
    let resolvedPaidAmount: number | undefined
    setBillingStatements(prev => prev.map(bs => {
      if (bs.id !== id) return bs
      if (status === 'paid') resolvedPaidAmount = bs.netPayable
      logAudit('update', 'billing', id, bs.billingNumber, `สถานะ → ${status}`)
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
  }, [logAudit])

  const deleteBillingStatement = useCallback((id: string) => {
    setBillingStatements(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'billing', id, old?.billingNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteBillingStatementDB(id))
  }, [logAudit])

  // ---- Tax Invoices ----
  const addTaxInvoice = useCallback((t: Omit<TaxInvoice, 'id' | 'invoiceNumber'>): TaxInvoice => {
    const newTI: TaxInvoice = { ...t, id: genId(), invoiceNumber: genTaxInvoiceNumber() }
    setTaxInvoices(prev => [newTI, ...prev])
    dbSave(db.insertTaxInvoice(newTI), () => {
      setTaxInvoices(prev => prev.filter(x => x.id !== newTI.id))
    })
    logAudit('create', 'tax_invoice', newTI.id, newTI.invoiceNumber)
    return newTI
  }, [logAudit])

  // ---- Quotations ----
  const addQuotation = useCallback((q: Omit<Quotation, 'id' | 'quotationNumber'>): Quotation => {
    const newQ: Quotation = { ...q, id: genId(), quotationNumber: genQuotationNumber() }
    setQuotations(prev => [newQ, ...prev])
    dbSave(db.insertQuotation(newQ), () => {
      setQuotations(prev => prev.filter(x => x.id !== newQ.id))
    })
    logAudit('create', 'quotation', newQ.id, newQ.quotationNumber)
    return newQ
  }, [logAudit])

  const updateQuotationStatus = useCallback((id: string, status: QuotationStatus) => {
    setQuotations(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'quotation', id, old?.quotationNumber || id, `สถานะ → ${status}`)
      return prev.map(x => x.id === id ? { ...x, status } : x)
    })
    dbSave(db.updateQuotationDB(id, { status }))
  }, [logAudit])

  // ---- Expenses ----
  const addExpense = useCallback((e: Omit<Expense, 'id' | 'createdBy'>): Expense => {
    const newExp: Expense = { ...e, id: genId(), createdBy: currentUserRef.current?.id || 'unknown' }
    setExpenses(prev => [newExp, ...prev])
    dbSave(db.insertExpense(newExp), () => {
      setExpenses(prev => prev.filter(x => x.id !== newExp.id))
    })
    logAudit('create', 'expense', newExp.id, e.description)
    return newExp
  }, [logAudit])

  const updateExpense = useCallback((id: string, e: Partial<Expense>) => {
    setExpenses(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'expense', id, old?.description || id)
      return prev.map(x => x.id === id ? { ...x, ...e } : x)
    })
    dbSave(db.updateExpenseDB(id, e))
  }, [logAudit])

  const deleteExpense = useCallback((id: string) => {
    setExpenses(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'expense', id, old?.description || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteExpenseDB(id))
  }, [logAudit])

  // ---- Users ----
  const addUser = useCallback(async (u: Omit<AppUser, 'id'>, password: string): Promise<AppUser> => {
    const hash = await hashPassword(password)
    const newUser: AppUser = { ...u, id: genId(), passwordHash: hash }
    // Store without hash in React state
    setUsers(prev => [...prev, stripHash(newUser)])
    dbSave(db.insertUser(newUser), () => {
      setUsers(prev => prev.filter(x => x.id !== newUser.id))
    })
    logAudit('create', 'user', newUser.id, newUser.name)
    return stripHash(newUser)
  }, [logAudit])

  const updateUser = useCallback((id: string, u: Partial<AppUser>) => {
    setUsers(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'user', id, old?.name || id)
      return prev.map(x => x.id === id ? { ...x, ...u } : x)
    })
    dbSave(db.updateUserDB(id, u))
  }, [logAudit])

  const resetPassword = useCallback(async (userId: string, newPassword: string): Promise<void> => {
    const hash = await hashPassword(newPassword)
    await db.updatePasswordHash(userId, hash)
    const user = users.find(u => u.id === userId)
    logAudit('update', 'user', userId, user?.name || userId, 'รีเซ็ตรหัสผ่าน')
  }, [users, logAudit])

  // ---- Settings ----
  const updateDefaultPrice = useCallback((code: string, price: number) => {
    setDefaultPrices(prev => ({ ...prev, [code]: price }))
    // Sync linenCatalog.defaultPrice to keep single source of truth
    setLinenCatalog(prev => prev.map(i => i.code === code ? { ...i, defaultPrice: price } : i))
    dbSave(db.updateDefaultPriceDB(code, price))
  }, [])

  const updateCompanyInfo = useCallback((info: Partial<CompanyInfo>) => {
    setCompanyInfo(prev => {
      const updated = { ...prev, ...info }
      dbSave(db.upsertCompanyInfo(updated))
      logAudit('update', 'company', '1', 'ข้อมูลบริษัท')
      return updated
    })
  }, [logAudit])

  // ---- Linen Catalog ----
  const addLinenItem = useCallback((item: LinenItemDef) => {
    setLinenCatalog(prev => [...prev, item])
    setDefaultPrices(prev => ({ ...prev, [item.code]: item.defaultPrice }))
    dbSave(db.insertLinenItem(item), () => {
      setLinenCatalog(prev => prev.filter(i => i.code !== item.code))
      setDefaultPrices(prev => {
        const next = { ...prev }
        delete next[item.code]
        return next
      })
    })
    logAudit('create', 'linen_item', item.code, item.name)
  }, [logAudit])

  const updateLinenItem = useCallback((code: string, updates: Partial<LinenItemDef>) => {
    setLinenCatalog(prev => prev.map(i => i.code === code ? { ...i, ...updates } : i))
    if (updates.defaultPrice !== undefined) {
      setDefaultPrices(prev => ({ ...prev, [code]: updates.defaultPrice! }))
    }
    dbSave(db.updateLinenItemDB(code, updates))
    logAudit('update', 'linen_item', code, updates.name || code)
  }, [logAudit])

  const deleteLinenItem = useCallback((code: string) => {
    setLinenCatalog(prev => {
      const old = prev.find(i => i.code === code)
      logAudit('delete', 'linen_item', code, old?.name || code)
      return prev.filter(i => i.code !== code)
    })
    setDefaultPrices(prev => {
      const next = { ...prev }
      delete next[code]
      return next
    })
    dbSave(db.deleteLinenItemDB(code))
  }, [logAudit])

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
      createdBy: currentUserRef.current?.id || 'unknown', updatedAt: todayISO(),
    }
    setChecklists(prev => [newCL, ...prev])
    dbSave(db.insertChecklist(newCL), () => {
      setChecklists(prev => prev.filter(x => x.id !== newCL.id))
    })
    logAudit('create', 'checklist', newCL.id, newCL.checklistNumber)
    return newCL
  }, [logAudit])

  const updateChecklist = useCallback((id: string, c: Partial<ProductChecklist>) => {
    const updates = { ...c, updatedAt: todayISO() }
    setChecklists(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'checklist', id, old?.checklistNumber || id)
      return prev.map(x => x.id === id ? { ...x, ...updates } : x)
    })
    dbSave(db.updateChecklistDB(id, updates))
  }, [logAudit])

  const updateChecklistStatus = useCallback((id: string, status: ChecklistStatus) => {
    const updates = { status, updatedAt: todayISO() }
    setChecklists(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'checklist', id, old?.checklistNumber || id, `สถานะ → ${status}`)
      return prev.map(x => x.id === id ? { ...x, ...updates } : x)
    })
    dbSave(db.updateChecklistDB(id, updates))
  }, [logAudit])

  const deleteChecklist = useCallback((id: string) => {
    setChecklists(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'checklist', id, old?.checklistNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteChecklistDB(id))
  }, [logAudit])

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
      users, addUser, updateUser, resetPassword,
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
