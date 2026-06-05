'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type {
  Customer, LinenForm, LinenFormStatus, DeliveryNote, DeliveryNoteStatus,
  BillingStatement, BillingStatus, TaxInvoice, Receipt, Quotation, QuotationStatus,
  Expense, AppUser, CompanyInfo, LinenItemDef, LinenCategoryDef,
  CustomerCategoryDef, ProductChecklist, ChecklistStatus,
  AuditAction, AuditEntityType, AuditLog,
  CarryOverAdjustment, CarryOverMode, CarryOverAdjustmentHistory,
  LegacyDocument, ScheduleOverride, RoutePlan,
} from '@/types'
import { STANDARD_LINEN_ITEMS, LEGACY_STATUS_MAP, DEFAULT_LINEN_CATEGORIES, DEFAULT_CUSTOMER_CATEGORIES } from '@/types'
import {
  SAMPLE_CUSTOMERS, SAMPLE_LINEN_FORMS, SAMPLE_DELIVERY_NOTES,
  SAMPLE_BILLING_STATEMENTS, SAMPLE_EXPENSES, SAMPLE_USERS,
  DEFAULT_COMPANY_INFO, DEFAULT_PRICES,
} from './mock-data'
import {
  genId, genLinenFormNumber, genDeliveryNoteNumber, genBillingNumber,
  genTaxInvoiceNumber, genReceiptNumber, genQuotationNumber, genChecklistNumber, todayISO,
} from './utils'
import { verifyPassword, hashPassword, createSession, getSession, clearSession } from './auth'
import * as db from './supabase-service'
import { DEFAULT_FACET_VOCAB, type FacetVocab } from './linen-vocabulary'
import { getOrSeedFacetVocab, saveFacetVocab } from './facet-vocab-service'
// 330 — Group-aware carry-over (fix infinity bug from aggregate size groups)
import { buildAggregateSnapshot, computeAnchorByGroup, diffsForForm, type AggregateSnapshot } from './carry-over-logic'

// ============================================================
// Store Interface
// ============================================================

// 372: input type ของ addLinenForm — reuse กับ addLinenFormsBatch (closure-stale batch fix)
type AddLinenFormInput =
  Omit<LinenForm, 'id' | 'formNumber' | 'createdBy' | 'updatedAt' | 'bagsSentCount' | 'bagsPackCount' | 'deptDrying' | 'deptIroning' | 'deptFolding' | 'deptQc'>
  & Partial<Pick<LinenForm, 'bagsSentCount' | 'bagsPackCount' | 'deptDrying' | 'deptIroning' | 'deptFolding' | 'deptQc'>>

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
  addLinenForm: (f: AddLinenFormInput) => LinenForm
  /** 372: batch add (1 HTTP call + running counter) — กันเลขเอกสารซ้ำตอนสร้างหลายใบรวดเดียว */
  addLinenFormsBatch: (items: AddLinenFormInput[]) => LinenForm[]
  updateLinenForm: (id: string, f: Partial<LinenForm>) => void
  updateLinenFormStatus: (id: string, status: LinenFormStatus) => void
  deleteLinenForm: (id: string) => void

  // Delivery Notes
  deliveryNotes: DeliveryNote[]
  addDeliveryNote: (d: Omit<DeliveryNote, 'id' | 'noteNumber' | 'createdBy' | 'updatedAt'>) => DeliveryNote
  /** 288: batch add (1 HTTP call) — สำหรับ Quick Batch / batch mode (>100 records) */
  addDeliveryNotesBatch: (items: Omit<DeliveryNote, 'id' | 'noteNumber' | 'createdBy' | 'updatedAt'>[]) => DeliveryNote[]
  updateDeliveryNote: (id: string, d: Partial<DeliveryNote>) => void
  updateDeliveryNoteStatus: (id: string, status: DeliveryNoteStatus) => void
  deleteDeliveryNote: (id: string) => void
  /** 411 — batch ลบ/แก้ SD เยอะใน 1 ชุด call (กัน loop N HTTP = ช้า/drop ตอนลบเยอะ) */
  deleteDeliveryNotesBatch: (ids: string[]) => void
  updateDeliveryNotesBatchByIds: (ids: string[], updates: Partial<DeliveryNote>) => void

  // Billing
  billingStatements: BillingStatement[]
  addBillingStatement: (b: Omit<BillingStatement, 'id' | 'billingNumber'>) => BillingStatement
  updateBillingStatus: (id: string, status: BillingStatus, paidDate?: string) => void
  updateBillingStatement: (id: string, updates: Partial<BillingStatement>) => void
  deleteBillingStatement: (id: string) => void
  /** 411 — batch ลบ WB เยอะใน 1 ชุด call */
  deleteBillingStatementsBatch: (ids: string[]) => void

  // Tax Invoices
  taxInvoices: TaxInvoice[]
  addTaxInvoice: (t: Omit<TaxInvoice, 'id' | 'invoiceNumber'>) => TaxInvoice
  updateTaxInvoice: (id: string, updates: Partial<TaxInvoice>) => void
  deleteTaxInvoice: (id: string) => void
  // 148: Receipts (RC) — สำหรับลูกค้าไม่คิด VAT
  receipts: Receipt[]
  addReceipt: (r: Omit<Receipt, 'id' | 'receiptNumber'>) => Receipt
  updateReceipt: (id: string, updates: Partial<Receipt>) => void
  deleteReceipt: (id: string) => void
  // 161: Legacy Documents (read-only archive)
  legacyDocuments: LegacyDocument[]

  // Quotations
  quotations: Quotation[]
  addQuotation: (q: Omit<Quotation, 'id' | 'quotationNumber'>) => Quotation
  updateQuotation: (id: string, updates: Partial<Quotation>) => void
  updateQuotationStatus: (id: string, status: QuotationStatus) => void
  deleteQuotation: (id: string) => void

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

  // Linen Categories
  linenCategories: LinenCategoryDef[]
  addCategory: (cat: LinenCategoryDef) => void
  updateCategory: (key: string, updates: Partial<LinenCategoryDef>) => void
  deleteCategory: (key: string) => void
  getCategoryLabel: (key: string) => string

  // Customer Categories
  customerCategories: CustomerCategoryDef[]
  addCustomerCategory: (cat: CustomerCategoryDef) => void
  updateCustomerCategory: (key: string, updates: Partial<CustomerCategoryDef>) => void
  deleteCustomerCategory: (key: string) => void
  getCustomerCategoryLabel: (key: string) => string

  // Checklists
  checklists: ProductChecklist[]
  addChecklist: (c: Omit<ProductChecklist, 'id' | 'checklistNumber' | 'createdBy' | 'updatedAt'>) => ProductChecklist
  updateChecklist: (id: string, c: Partial<ProductChecklist>) => void
  updateChecklistStatus: (id: string, status: ChecklistStatus) => void
  deleteChecklist: (id: string) => void

  // Carry-over Adjustments (51-53)
  carryOverAdjustments: CarryOverAdjustment[]
  addCarryOverAdjustment: (adj: Omit<CarryOverAdjustment, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'history' | 'isDeleted'>) => CarryOverAdjustment
  updateCarryOverAdjustment: (id: string, updates: Partial<Omit<CarryOverAdjustment, 'id' | 'createdAt' | 'createdBy'>>, changeNote?: string) => void
  deleteCarryOverAdjustment: (id: string) => void
  /** 390 C — ปรับ aggregateSnapshot ของ LF + adj หลายใบเป็น config ใหม่แบบ batch (1 ชุด call ต่อ table, กัน fire-and-forget race) */
  rebuildAggregateSnapshots: (customerId: string, customerLabel: string, lfIds: string[], adjIds: string[], snapshot: AggregateSnapshot | undefined) => void

  // 311 P2 — Schedule Overrides
  scheduleOverrides: ScheduleOverride[]
  addScheduleOverride: (o: Omit<ScheduleOverride, 'id' | 'createdAt' | 'createdBy'>) => ScheduleOverride
  updateScheduleOverride: (id: string, updates: Partial<Omit<ScheduleOverride, 'id' | 'createdAt' | 'createdBy'>>) => void
  deleteScheduleOverride: (id: string) => void

  // P5.2 — Route Plans (ลำดับวิ่งต่อวัน)
  routePlans: RoutePlan[]
  setRouteOrder: (date: string, orderedCustomerIds: string[]) => void

  // 255: Facet Vocabulary (Wizard 2.0 — admin-editable)
  facetVocab: FacetVocab
  updateFacetVocab: (vocab: FacetVocab) => Promise<void>
  resetFacetVocab: () => Promise<void>

  // Computed helpers
  getCarryOver: (customerId: string, beforeDate: string, mode?: CarryOverMode, includeHidden?: boolean) => Record<string, number>
  getDiscrepancies: (formId: string) => Record<string, number>
}

const StoreContext = createContext<StoreContextType | null>(null)

// ============================================================
// Helper: fire-and-forget with error logging + optional rollback
// Dispatches a custom event for Toast to pick up
// ============================================================
function dbSave(promise: Promise<void>, onError?: () => void) {
  promise.catch(err => {
    console.error('[DB save error]', err)
    if (typeof window !== 'undefined') {
      // Show real error message to help debug — fallback to generic
      const errMsg = err instanceof Error ? err.message : String(err)
      const detail = errMsg && errMsg.length > 0
        ? `บันทึกไม่สำเร็จ: ${errMsg}`
        : 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'
      window.dispatchEvent(new CustomEvent('flowclean:db-error', { detail }))
    }
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
  // 148: receipts state
  const [receipts, setReceipts] = useState<Receipt[]>([])
  // 161: legacy documents (read-only)
  const [legacyDocuments, setLegacyDocuments] = useState<LegacyDocument[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [defaultPrices, setDefaultPrices] = useState<Record<string, number>>(DEFAULT_PRICES)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(DEFAULT_COMPANY_INFO)
  const [linenCatalog, setLinenCatalog] = useState<LinenItemDef[]>(STANDARD_LINEN_ITEMS)
  const [linenCategories, setLinenCategories] = useState<LinenCategoryDef[]>(DEFAULT_LINEN_CATEGORIES)
  const [customerCategories, setCustomerCategories] = useState<CustomerCategoryDef[]>(DEFAULT_CUSTOMER_CATEGORIES)
  const [checklists, setChecklists] = useState<ProductChecklist[]>([])
  const [carryOverAdjustments, setCarryOverAdjustments] = useState<CarryOverAdjustment[]>([])
  // 311 P2 — Schedule overrides
  const [scheduleOverrides, setScheduleOverrides] = useState<ScheduleOverride[]>([])
  // P5.2 — Route plans (ลำดับวิ่งต่อวัน)
  const [routePlans, setRoutePlans] = useState<RoutePlan[]>([])
  // 255: Facet Vocabulary — start with defaults, replaced after DB load
  const [facetVocab, setFacetVocab] = useState<FacetVocab>(DEFAULT_FACET_VOCAB)
  const [loaded, setLoaded] = useState(false)
  const seeded = useRef(false)
  const currentUserRef = useRef<AppUser | null>(null)
  // 295: deliveryNotes ref — sync update ใน batch loop กัน closure stale
  //   (functional setState ของ Fix 293 ไม่พอ — React 18 defer updater เมื่อ queue ไม่ว่าง
  //    ทำให้ assign-inside-updater pattern อ่านค่า [] เมื่อ caller return)
  // batch-number refs (Fix 295/312/372) — ให้ batch fns อ่าน list ล่าสุด sync กัน closure-stale
  //   sync ใน useEffect ไม่ใช่ render body (กัน react-hooks/refs) — batch fns ถูกเรียกจาก user event
  //   (หลัง render+effect commit) จึงอ่าน ref ที่ตรงเสมอ + batch fns เองก็ update ref in-place หลัง insert
  const deliveryNotesRef = useRef<DeliveryNote[]>([])
  const billingStatementsRef = useRef<BillingStatement[]>([])
  const routePlansRef = useRef<RoutePlan[]>([])
  const linenFormsRef = useRef<LinenForm[]>([])

  // Keep refs in sync for use in callbacks without dependency
  useEffect(() => { currentUserRef.current = currentUser }, [currentUser])
  useEffect(() => { deliveryNotesRef.current = deliveryNotes }, [deliveryNotes])
  useEffect(() => { billingStatementsRef.current = billingStatements }, [billingStatements])
  useEffect(() => { routePlansRef.current = routePlans }, [routePlans])
  useEffect(() => { linenFormsRef.current = linenForms }, [linenForms])

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

        // If Supabase is empty → seed with sample data (DEV only)
        const isEmpty = data.customers.length === 0 && data.users.length === 0

        if (isEmpty && !seeded.current && process.env.NODE_ENV === 'development') {
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
        console.error('[Supabase load error]', err)
        if (cancelled) return
        // Fallback to sample data only in development
        if (process.env.NODE_ENV === 'development') {
          console.warn('[FlowClean] DEV fallback: using sample data')
          setCustomers(SAMPLE_CUSTOMERS)
          setLinenForms(SAMPLE_LINEN_FORMS)
          setDeliveryNotes(SAMPLE_DELIVERY_NOTES)
          setBillingStatements(SAMPLE_BILLING_STATEMENTS)
          setExpenses(SAMPLE_EXPENSES)
          setUsers(SAMPLE_USERS.map(stripHash))
        }
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
      // 255 Phase 1.b: load facet vocab from DB (seed if missing)
      try {
        const vocab = await getOrSeedFacetVocab()
        if (!cancelled) setFacetVocab(vocab)
      } catch (err) {
        console.error('[facet vocab] load failed (using defaults):', err)
      }

      if (!cancelled) setLoaded(true)
    }

    function applyData(data: Awaited<ReturnType<typeof db.fetchAllData>>) {
      setCustomers(data.customers)
      // Normalize legacy data: map old statuses + ensure fields exist
      setLinenForms(data.linenForms.map(form => ({
        ...form,
        status: (LEGACY_STATUS_MAP[form.status] || form.status) as LinenFormStatus,
        bagsSentCount: form.bagsSentCount ?? 0,
        bagsPackCount: form.bagsPackCount ?? 0,
        deptDrying: form.deptDrying ?? false,
        deptIroning: form.deptIroning ?? false,
        deptFolding: form.deptFolding ?? false,
        deptQc: form.deptQc ?? false,
        rows: form.rows.map(row => ({
          ...row,
          col6_factoryPackSend: row.col6_factoryPackSend ?? 0,
        })),
      })))
      setDeliveryNotes(data.deliveryNotes)
      setBillingStatements(data.billingStatements)
      setTaxInvoices(data.taxInvoices)
      setReceipts(data.receipts || [])
      setLegacyDocuments(data.legacyDocuments || [])
      setQuotations(data.quotations)
      setExpenses(data.expenses)
      // Strip passwordHash from all users in React state
      const loadedUsers = data.users.length > 0 ? data.users : SAMPLE_USERS
      setUsers(loadedUsers.map(stripHash))
      setCompanyInfo(data.companyInfo || DEFAULT_COMPANY_INFO)
      setLinenCatalog(data.linenItems.length > 0 ? data.linenItems : STANDARD_LINEN_ITEMS)
      setLinenCategories(data.linenCategories.length > 0 ? data.linenCategories : DEFAULT_LINEN_CATEGORIES)
      if (data.customerCategories) {
        setCustomerCategories(data.customerCategories.length > 0 ? data.customerCategories : DEFAULT_CUSTOMER_CATEGORIES)
      }
      setChecklists(data.checklists)
      setCarryOverAdjustments(data.carryOverAdjustments || [])
      setScheduleOverrides(data.scheduleOverrides || [])
      setRoutePlans(data.routePlans || [])

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
      // Fallback to sample users only in development
      if (process.env.NODE_ENV === 'development') {
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
  const addLinenForm = useCallback((f: AddLinenFormInput): LinenForm => {
    // 330 — auto-snapshot aggregateSizeGroups ถ้า caller ไม่ระบุ + customer มี config
    // กัน drift ตามเหตุผลเดียวกับ workflowMode snapshot (265)
    const customer = customers.find(c => c.id === f.customerId)
    // A1: pass linenCatalog → snapshot includes anchorCode (drift-proof reprint)
    const autoAggSnapshot = f.aggregateSnapshot
      ?? buildAggregateSnapshot(customer?.aggregateSizeGroups, linenCatalog)
    const newForm: LinenForm = {
      bagsSentCount: 0, bagsPackCount: 0,
      deptDrying: false, deptIroning: false, deptFolding: false, deptQc: false,
      ...f, id: genId(), formNumber: genLinenFormNumber(linenForms.map(x => x.formNumber)),
      createdBy: currentUserRef.current?.id || 'unknown', updatedAt: todayISO(),
      aggregateSnapshot: autoAggSnapshot,
    }
    setLinenForms(prev => [newForm, ...prev])
    dbSave(db.insertLinenForm(newForm), () => {
      setLinenForms(prev => prev.filter(x => x.id !== newForm.id))
    })
    logAudit('create', 'linen_form', newForm.id, newForm.formNumber)
    return newForm
  }, [logAudit, linenForms, customers, linenCatalog])

  // 372 — batch add LF: ref + running counter กัน formNumber ซ้ำ (closure-stale fix, ตาม addDeliveryNotesBatch)
  //   เดิม handleBatchComplete loop addLinenForm → ทุก call อ่าน linenForms (closure) เดิม → gen เลขซ้ำ
  const addLinenFormsBatch = useCallback((items: AddLinenFormInput[]): LinenForm[] => {
    if (items.length === 0) return []
    const userId = currentUserRef.current?.id || 'unknown'
    const now = todayISO()
    const current = linenFormsRef.current                       // อ่าน sync จาก ref (ไม่ stale ใน loop)
    const existingNumbers = current.map(x => x.formNumber)
    const newNumbers: string[] = []
    const newForms: LinenForm[] = items.map(f => {
      const customer = customers.find(c => c.id === f.customerId)
      const autoAggSnapshot = f.aggregateSnapshot ?? buildAggregateSnapshot(customer?.aggregateSizeGroups, linenCatalog)
      const formNumber = genLinenFormNumber([...existingNumbers, ...newNumbers])  // running counter → ไม่ซ้ำ
      newNumbers.push(formNumber)
      return {
        bagsSentCount: 0, bagsPackCount: 0,
        deptDrying: false, deptIroning: false, deptFolding: false, deptQc: false,
        ...f, id: genId(), formNumber,
        createdBy: userId, updatedAt: now,
        aggregateSnapshot: autoAggSnapshot,
      }
    })
    linenFormsRef.current = [...newForms, ...current]            // sync ref ทันทีก่อน setState
    setLinenForms(prev => [...newForms, ...prev])
    dbSave(db.insertLinenFormsBatch(newForms), () => {           // 1 HTTP call (กัน fire-and-forget race)
      const failedIds = new Set(newForms.map(f => f.id))
      linenFormsRef.current = linenFormsRef.current.filter(x => !failedIds.has(x.id))
      setLinenForms(prev => prev.filter(x => !failedIds.has(x.id)))
    })
    for (const form of newForms) logAudit('create', 'linen_form', form.id, form.formNumber)
    return newForms
  }, [logAudit, customers, linenCatalog])

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
      ...d, id: genId(), noteNumber: genDeliveryNoteNumber(deliveryNotes.map(x => x.noteNumber)),
      createdBy: currentUserRef.current?.id || 'unknown', updatedAt: todayISO(),
    }
    setDeliveryNotes(prev => [newDN, ...prev])
    dbSave(db.insertDeliveryNote(newDN), () => {
      setDeliveryNotes(prev => prev.filter(x => x.id !== newDN.id))
    })
    logAudit('create', 'delivery_note', newDN.id, newDN.noteNumber)
    return newDN
  }, [logAudit, deliveryNotes])

  // 288: Batch add — เร็วและ rate-limit-safe สำหรับ Quick Batch / batch mode
  //   ก่อน: addDeliveryNote ใน loop = N concurrent HTTP fire-and-forget
  //   → browser concurrency cap + Supabase rate limit → "fail to fetch"
  //   ตอนนี้: เตรียม IDs+noteNumbers ทีละตัว (running counter), 1 HTTP insert batch
  // 295: ใช้ deliveryNotesRef แทน functional setState — กัน 2 bugs พร้อมกัน:
  //   (1) noteNumber ซ้ำเมื่อ caller เรียกซ้อน (Fix 293's goal — แต่ assign-inside-updater
  //       ไม่ work เพราะ React 18 defer updater เมื่อ queue ไม่ว่าง)
  //   (2) return [] จาก call ที่ 2+ ใน loop (Fix 293's side-effect — assign ใน deferred
  //       updater = caller อ่านก่อน assigned)
  //   Ref update = sync, ไม่ผ่าน React batching → ทุก call อ่าน fresh state ได้ทันที
  const addDeliveryNotesBatch = useCallback((items: Omit<DeliveryNote, 'id' | 'noteNumber' | 'createdBy' | 'updatedAt'>[]): DeliveryNote[] => {
    if (items.length === 0) return []
    const userId = currentUserRef.current?.id || 'unknown'
    const now = todayISO()
    // อ่าน state ล่าสุดจาก ref (sync, ไม่ stale ใน loop)
    const current = deliveryNotesRef.current
    // 409 — Idempotency guard: กันสร้าง SD ซ้ำสำหรับ LF ที่มี SD อยู่แล้ว
    //   ป้องกันทุก vector: ghost id ซ้ำ / state stale / กดซ้ำ / partial-retry · ใช้ ref สด = freshest
    //   ⚠️ guard ด้วย "LF id" (ไม่ใช่ customer+date — LF ซ้ำวันได้ ต้องได้ SD แยก) ·
    //      ไม่กระทบ "รอบเสริม" (รอบเสริมสร้างผ่าน addDeliveryNote ทีละใบ ไม่ใช่ batch นี้)
    const linkedLfIds = new Set(current.flatMap(d => d.linenFormIds))   // DN = hard-delete → ทุกใบใน state คือ live
    const seenLfIds = new Set<string>()
    const items2 = items.filter(it => {
      const ids = it.linenFormIds || []
      // ข้ามถ้า LF ใดผูก SD แล้ว หรือ ซ้ำภายในชุดนี้
      if (ids.some(id => linkedLfIds.has(id) || seenLfIds.has(id))) return false
      ids.forEach(id => seenLfIds.add(id))
      return true
    })
    if (items2.length === 0) return []
    const existingNumbers = current.map(x => x.noteNumber)
    const newNumbers: string[] = []
    const newDNs: DeliveryNote[] = items2.map(d => {
      const noteNumber = genDeliveryNoteNumber([...existingNumbers, ...newNumbers])
      newNumbers.push(noteNumber)
      return { ...d, id: genId(), noteNumber, createdBy: userId, updatedAt: now }
    })
    // อัปเดต ref ทันที (sync) ก่อน setState — call ถัดไปใน loop อ่าน ref เห็นของใหม่
    deliveryNotesRef.current = [...newDNs, ...current]
    setDeliveryNotes(prev => [...newDNs, ...prev])
    dbSave(db.insertDeliveryNotesBatch(newDNs), () => {
      // Rollback ทุก newDN ถ้า batch insert fail — sync ทั้ง ref + state
      const failedIds = new Set(newDNs.map(d => d.id))
      deliveryNotesRef.current = deliveryNotesRef.current.filter(x => !failedIds.has(x.id))
      setDeliveryNotes(prev => prev.filter(x => !failedIds.has(x.id)))
    })
    // Audit ทุก DN — fire-and-forget OK (auditLogs ไม่ critical)
    for (const dn of newDNs) {
      logAudit('create', 'delivery_note', dn.id, dn.noteNumber)
    }
    return newDNs
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

    // DN is created from confirmed LFs — no need to sync LF status back
  }, [logAudit])

  const deleteDeliveryNote = useCallback((id: string) => {
    // 272.5 revert: ติ๊ดเลือก keep LF status เดิม (7/7) แม้ลบ SD
    //   เหตุผล: ลูกค้านับกลับเสร็จแล้ว → snapshot ของจริง → ไม่ควรย้อน
    //   ปลดล็อค LF ถูกตีความใหม่ = อยู่ที่ฝั่ง availableForms filter (ไม่ใช่ status revert)
    setDeliveryNotes(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'delivery_note', id, old?.noteNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteDeliveryNoteDB(id))
  }, [logAudit])

  // 411 — Batch ลบ SD (1 setState + chunked DB delete) · กัน loop N HTTP (ช้า/drop ตอนลบ 3922 ใบ)
  const deleteDeliveryNotesBatch = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const removed = deliveryNotesRef.current.filter(x => idSet.has(x.id))   // capture เผื่อ rollback
    if (removed.length === 0) return
    deliveryNotesRef.current = deliveryNotesRef.current.filter(x => !idSet.has(x.id))
    setDeliveryNotes(prev => prev.filter(x => !idSet.has(x.id)))
    dbSave(db.deleteDeliveryNotesBatch([...idSet]), () => {
      deliveryNotesRef.current = [...removed, ...deliveryNotesRef.current]
      setDeliveryNotes(prev => [...removed, ...prev])
    })
    logAudit('delete', 'delivery_note', '', `ลบ SD ${removed.length} ใบ (batch)`)
  }, [logAudit])

  // 411 — Batch แก้ field SD เยอะ (เช่น unbill isBilled=false ตอนลบ WB) ใน 1 ชุด call
  const updateDeliveryNotesBatchByIds = useCallback((ids: string[], updates: Partial<DeliveryNote>) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const patch = { ...updates, updatedAt: todayISO() }
    const prevVals = new Map(deliveryNotesRef.current.filter(x => idSet.has(x.id)).map(x => [x.id, x] as const))
    const apply = (x: DeliveryNote) => idSet.has(x.id) ? { ...x, ...patch } : x
    deliveryNotesRef.current = deliveryNotesRef.current.map(apply)
    setDeliveryNotes(prev => prev.map(apply))
    dbSave(db.updateDeliveryNotesBatchByIds([...idSet], patch), () => {
      const restore = (x: DeliveryNote) => prevVals.get(x.id) ?? x
      deliveryNotesRef.current = deliveryNotesRef.current.map(restore)
      setDeliveryNotes(prev => prev.map(restore))
    })
  }, [])

  // ---- Billing Statements ----
  const addBillingStatement = useCallback((b: Omit<BillingStatement, 'id' | 'billingNumber'>): BillingStatement => {
    // Audit fix (post-Phase-B): ใช้ ref แทน closure — กัน billingNumber ซ้ำเมื่อ caller loop
    //   (Quick Batch WB เรียก add ซ้ำต่อลูกค้า — closure stale = WB ซ้ำ pattern เดียวกับ Fix 295)
    const current = billingStatementsRef.current
    const newBS: BillingStatement = {
      ...b, id: genId(),
      billingNumber: genBillingNumber(current.map(x => x.billingNumber)),
    }
    billingStatementsRef.current = [newBS, ...current]
    setBillingStatements(prev => [newBS, ...prev])
    dbSave(db.insertBillingStatement(newBS), () => {
      const failedId = newBS.id
      billingStatementsRef.current = billingStatementsRef.current.filter(x => x.id !== failedId)
      setBillingStatements(prev => prev.filter(x => x.id !== failedId))
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

  const updateBillingStatement = useCallback((id: string, updates: Partial<BillingStatement>) => {
    setBillingStatements(prev => prev.map(bs => bs.id === id ? { ...bs, ...updates } : bs))
    dbSave(db.updateBillingStatementDB(id, updates))
  }, [])

  const deleteBillingStatement = useCallback((id: string) => {
    setBillingStatements(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'billing', id, old?.billingNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteBillingStatementDB(id))
  }, [logAudit])

  // 411 — Batch ลบ WB (1 setState + chunked DB delete)
  const deleteBillingStatementsBatch = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const removed = billingStatementsRef.current.filter(x => idSet.has(x.id))
    if (removed.length === 0) return
    billingStatementsRef.current = billingStatementsRef.current.filter(x => !idSet.has(x.id))
    setBillingStatements(prev => prev.filter(x => !idSet.has(x.id)))
    dbSave(db.deleteBillingStatementsBatch([...idSet]), () => {
      billingStatementsRef.current = [...removed, ...billingStatementsRef.current]
      setBillingStatements(prev => [...removed, ...prev])
    })
    logAudit('delete', 'billing', '', `ลบ WB ${removed.length} ใบ (batch)`)
  }, [logAudit])

  // ---- Tax Invoices ----
  const addTaxInvoice = useCallback((t: Omit<TaxInvoice, 'id' | 'invoiceNumber'>): TaxInvoice => {
    const newTI: TaxInvoice = { ...t, id: genId(), invoiceNumber: genTaxInvoiceNumber(taxInvoices.map(x => x.invoiceNumber)) }
    setTaxInvoices(prev => [newTI, ...prev])
    dbSave(db.insertTaxInvoice(newTI), () => {
      setTaxInvoices(prev => prev.filter(x => x.id !== newTI.id))
    })
    logAudit('create', 'tax_invoice', newTI.id, newTI.invoiceNumber)
    return newTI
  }, [logAudit, taxInvoices])

  const updateTaxInvoice = useCallback((id: string, updates: Partial<TaxInvoice>) => {
    setTaxInvoices(prev => prev.map(ti => ti.id === id ? { ...ti, ...updates } : ti))
    dbSave(db.updateTaxInvoiceDB(id, updates))
  }, [])

  const deleteTaxInvoice = useCallback((id: string) => {
    setTaxInvoices(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'tax_invoice', id, old?.invoiceNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteTaxInvoiceDB(id))
  }, [logAudit])

  // ---- Receipts (Feature 148) ----
  const addReceipt = useCallback((r: Omit<Receipt, 'id' | 'receiptNumber'>): Receipt => {
    const newRC: Receipt = { ...r, id: genId(), receiptNumber: genReceiptNumber(receipts.map(x => x.receiptNumber)) }
    setReceipts(prev => [newRC, ...prev])
    dbSave(db.insertReceipt(newRC), () => {
      setReceipts(prev => prev.filter(x => x.id !== newRC.id))
    })
    logAudit('create', 'tax_invoice', newRC.id, newRC.receiptNumber) // reuse tax_invoice entity type
    return newRC
  }, [logAudit, receipts])

  const updateReceipt = useCallback((id: string, updates: Partial<Receipt>) => {
    setReceipts(prev => prev.map(rc => rc.id === id ? { ...rc, ...updates } : rc))
    dbSave(db.updateReceiptDB(id, updates))
  }, [])

  const deleteReceipt = useCallback((id: string) => {
    setReceipts(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'tax_invoice', id, old?.receiptNumber || id)
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteReceiptDB(id))
  }, [logAudit])

  // ---- Quotations ----
  const addQuotation = useCallback((q: Omit<Quotation, 'id' | 'quotationNumber'>): Quotation => {
    const newQ: Quotation = { ...q, id: genId(), quotationNumber: genQuotationNumber(quotations.map(x => x.quotationNumber)) }
    setQuotations(prev => [newQ, ...prev])
    dbSave(db.insertQuotation(newQ), () => {
      setQuotations(prev => prev.filter(x => x.id !== newQ.id))
    })
    logAudit('create', 'quotation', newQ.id, newQ.quotationNumber)
    return newQ
  }, [logAudit, quotations])

  const updateQuotation = useCallback((id: string, updates: Partial<Quotation>) => {
    setQuotations(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateQuotationDB(id, updates as Record<string, unknown>))
  }, [])

  const updateQuotationStatus = useCallback((id: string, status: QuotationStatus) => {
    setQuotations(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('update', 'quotation', id, old?.quotationNumber || id, `สถานะ → ${status}`)
      return prev.map(x => x.id === id ? { ...x, status } : x)
    })
    dbSave(db.updateQuotationDB(id, { status }))
  }, [logAudit])

  const deleteQuotation = useCallback((id: string) => {
    setQuotations(prev => {
      const old = prev.find(x => x.id === id)
      logAudit('delete', 'quotation', id, old?.quotationNumber || id, 'ลบใบเสนอราคา')
      return prev.filter(x => x.id !== id)
    })
    dbSave(db.deleteQuotationDB(id))
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
    try {
      await db.insertUser(newUser)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('23505') || msg.includes('duplicate key') || msg.includes('already exists')) {
        throw new Error('อีเมลนี้มีในระบบแล้ว กรุณาใช้อีเมลอื่น')
      }
      throw err
    }
    setUsers(prev => [...prev, stripHash(newUser)])
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

  // ---- Linen Categories ----
  const addCategory = useCallback((cat: LinenCategoryDef) => {
    setLinenCategories(prev => [...prev, cat])
    dbSave(db.insertLinenCategory(cat), () => {
      setLinenCategories(prev => prev.filter(c => c.key !== cat.key))
    })
    logAudit('create', 'linen_category', cat.key, cat.label)
  }, [logAudit])

  const updateCategory = useCallback((key: string, updates: Partial<LinenCategoryDef>) => {
    setLinenCategories(prev => prev.map(c => c.key === key ? { ...c, ...updates } : c))
    dbSave(db.updateLinenCategoryDB(key, updates))
    logAudit('update', 'linen_category', key, updates.label || key)
  }, [logAudit])

  const deleteCategory = useCallback((key: string) => {
    setLinenCategories(prev => {
      const old = prev.find(c => c.key === key)
      logAudit('delete', 'linen_category', key, old?.label || key)
      return prev.filter(c => c.key !== key)
    })
    dbSave(db.deleteLinenCategoryDB(key))
  }, [logAudit])

  const getCategoryLabel = useCallback((key: string): string => {
    return linenCategories.find(c => c.key === key)?.label || key
  }, [linenCategories])

  // ---- Customer Categories ----
  const addCustomerCategory = useCallback((cat: CustomerCategoryDef) => {
    setCustomerCategories(prev => [...prev, cat])
    dbSave(db.insertCustomerCategory(cat), () => {
      setCustomerCategories(prev => prev.filter(c => c.key !== cat.key))
    })
    logAudit('create', 'customer_category' as AuditEntityType, cat.key, cat.label)
  }, [logAudit])

  const updateCustomerCategory = useCallback((key: string, updates: Partial<CustomerCategoryDef>) => {
    setCustomerCategories(prev => prev.map(c => c.key === key ? { ...c, ...updates } : c))
    dbSave(db.updateCustomerCategoryDB(key, updates))
    logAudit('update', 'customer_category' as AuditEntityType, key, updates.label || key)
  }, [logAudit])

  const deleteCustomerCategory = useCallback((key: string) => {
    setCustomerCategories(prev => {
      const old = prev.find(c => c.key === key)
      logAudit('delete', 'customer_category' as AuditEntityType, key, old?.label || key)
      return prev.filter(c => c.key !== key)
    })
    dbSave(db.deleteCustomerCategoryDB(key))
  }, [logAudit])

  const getCustomerCategoryLabel = useCallback((key: string): string => {
    return customerCategories.find(c => c.key === key)?.label || key
  }, [customerCategories])

  // ---- Checklists ----
  const addChecklist = useCallback((c: Omit<ProductChecklist, 'id' | 'checklistNumber' | 'createdBy' | 'updatedAt'>): ProductChecklist => {
    const newCL: ProductChecklist = {
      ...c, id: genId(), checklistNumber: genChecklistNumber(checklists.map(x => x.checklistNumber)),
      createdBy: currentUserRef.current?.id || 'unknown', updatedAt: todayISO(),
    }
    setChecklists(prev => [newCL, ...prev])
    dbSave(db.insertChecklist(newCL), () => {
      setChecklists(prev => prev.filter(x => x.id !== newCL.id))
    })
    logAudit('create', 'checklist', newCL.id, newCL.checklistNumber)
    return newCL
  }, [logAudit, checklists])

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

  // ---- Carry-over Adjustments (51-53) ----
  const addCarryOverAdjustment = useCallback((adj: Omit<CarryOverAdjustment, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'history' | 'isDeleted'>): CarryOverAdjustment => {
    const now = new Date().toISOString()
    const newAdj: CarryOverAdjustment = {
      ...adj,
      id: genId(),
      createdBy: currentUserRef.current?.id || 'unknown',
      createdAt: now,
      updatedAt: now,
      history: [],
      isDeleted: false,
    }
    setCarryOverAdjustments(prev => [newAdj, ...prev])
    dbSave(db.insertCarryOverAdjustment(newAdj), () => {
      setCarryOverAdjustments(prev => prev.filter(x => x.id !== newAdj.id))
    })
    logAudit('create', 'customer', newAdj.id, `${adj.type === 'reset' ? 'Reset' : 'Adjust'} ${adj.items.length} รายการ`, adj.reason)
    return newAdj
  }, [logAudit])

  const updateCarryOverAdjustment = useCallback((id: string, updates: Partial<Omit<CarryOverAdjustment, 'id' | 'createdAt' | 'createdBy'>>, changeNote?: string) => {
    const now = new Date().toISOString()
    const user = currentUserRef.current
    setCarryOverAdjustments(prev => prev.map(x => {
      if (x.id !== id) return x
      // Build history entry (Option B: edit log)
      const historyEntry: CarryOverAdjustmentHistory = {
        editedAt: now,
        editedBy: user?.name || 'unknown',
        changes: changeNote || 'แก้ไขข้อมูล',
      }
      const updated = { ...x, ...updates, updatedAt: now, history: [...x.history, historyEntry] }
      // Persist (fire-and-forget)
      dbSave(db.updateCarryOverAdjustmentDB(id, { ...updates, updatedAt: now, history: updated.history }))
      return updated
    }))
    logAudit('update', 'customer', id, `แก้ไขรายการปรับยอด`, changeNote || '')
  }, [logAudit])

  const deleteCarryOverAdjustment = useCallback((id: string) => {
    // Soft delete: mark isDeleted = true
    setCarryOverAdjustments(prev => prev.map(x => x.id === id ? { ...x, isDeleted: true } : x))
    dbSave(db.deleteCarryOverAdjustmentDB(id))
    logAudit('delete', 'customer', id, 'ลบรายการปรับยอด')
  }, [logAudit])

  // 390 C — Batch rebuild aggregateSnapshot เป็น config ใหม่ (LF + adj พร้อมกัน)
  //   ⚠️ ห้าม loop update ทีละใบ (fire-and-forget race → save หล่น = carry-over รวน) →
  //      ใช้ batch 1 ชุด call ต่อ table (db.update*BatchByIds chunk + sequential await)
  //   snapshot = buildAggregateSnapshot(nextConfigs, catalog) จากฝั่ง modal (drift-proof reprint;
  //   calc carry-over ใช้ computeAnchorByGroup จาก catalog สด ไม่ใช่ snapshot.anchorCode → anchor ไม่กระทบ calc)
  const rebuildAggregateSnapshots = useCallback((
    customerId: string,
    customerLabel: string,
    lfIds: string[],
    adjIds: string[],
    snapshot: AggregateSnapshot | undefined,
  ) => {
    if (lfIds.length === 0 && adjIds.length === 0) return

    if (lfIds.length > 0) {
      const lfSet = new Set(lfIds)
      const now = todayISO()
      // capture เดิมจาก ref (fresh เสมอ) เผื่อ rollback
      const prevSnaps = new Map(
        linenFormsRef.current.filter(f => lfSet.has(f.id)).map(f => [f.id, f.aggregateSnapshot] as const),
      )
      const apply = (x: LinenForm) => lfSet.has(x.id) ? { ...x, aggregateSnapshot: snapshot, updatedAt: now } : x
      linenFormsRef.current = linenFormsRef.current.map(apply)
      setLinenForms(prev => prev.map(apply))
      dbSave(db.updateLinenFormsBatchByIds(lfIds, { aggregateSnapshot: snapshot, updatedAt: now }), () => {
        const restore = (x: LinenForm) => prevSnaps.has(x.id) ? { ...x, aggregateSnapshot: prevSnaps.get(x.id) } : x
        linenFormsRef.current = linenFormsRef.current.map(restore)
        setLinenForms(prev => prev.map(restore))
      })
    }

    if (adjIds.length > 0) {
      const adjSet = new Set(adjIds)
      const tsNow = new Date().toISOString()
      const prevSnaps = new Map(
        carryOverAdjustments.filter(a => adjSet.has(a.id)).map(a => [a.id, a.aggregateSnapshot] as const),
      )
      setCarryOverAdjustments(prev => prev.map(x => adjSet.has(x.id) ? { ...x, aggregateSnapshot: snapshot, updatedAt: tsNow } : x))
      dbSave(db.updateCarryOverAdjustmentsBatchByIds(adjIds, { aggregateSnapshot: snapshot, updatedAt: tsNow }), () => {
        setCarryOverAdjustments(prev => prev.map(x => prevSnaps.has(x.id) ? { ...x, aggregateSnapshot: prevSnaps.get(x.id) } : x))
      })
    }

    // 1 audit entry สรุป (กัน N audit writes = fire-and-forget race ซ้ำซ้อน — logAudit เขียน DB ต่อ call)
    logAudit('update', 'customer', customerId,
      `Rebuild aggregate snapshot — ${customerLabel}: ${lfIds.length} LF + ${adjIds.length} ปรับยอด เป็น config ใหม่`)
  }, [logAudit, carryOverAdjustments])

  // 311 P2 — Schedule Overrides CRUD
  const addScheduleOverride = useCallback((o: Omit<ScheduleOverride, 'id' | 'createdAt' | 'createdBy'>): ScheduleOverride => {
    const newOverride: ScheduleOverride = {
      ...o,
      id: genId(),
      createdAt: new Date().toISOString(),
      createdBy: currentUserRef.current?.id || 'unknown',
    }
    setScheduleOverrides(prev => [newOverride, ...prev])
    dbSave(db.insertScheduleOverride(newOverride), () => {
      setScheduleOverrides(prev => prev.filter(x => x.id !== newOverride.id))
    })
    logAudit('create', 'customer', newOverride.id, `Schedule ${o.type} (${o.date})`, o.reason)
    return newOverride
  }, [logAudit])

  const updateScheduleOverride = useCallback((id: string, updates: Partial<Omit<ScheduleOverride, 'id' | 'createdAt' | 'createdBy'>>) => {
    setScheduleOverrides(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
    dbSave(db.updateScheduleOverrideDB(id, updates))
    logAudit('update', 'customer', id, 'แก้ไข Schedule Override')
  }, [logAudit])

  const deleteScheduleOverride = useCallback((id: string) => {
    setScheduleOverrides(prev => prev.filter(x => x.id !== id))
    dbSave(db.deleteScheduleOverrideDB(id))
    logAudit('delete', 'customer', id, 'ลบ Schedule Override')
  }, [logAudit])

  // P5.2 — Route order (upsert by date · 1 row/วัน)
  const setRouteOrder = useCallback((date: string, orderedCustomerIds: string[]) => {
    const existing = routePlansRef.current.find(p => p.date === date)
    const plan: RoutePlan = {
      id: existing?.id || genId(),
      date,
      orderedCustomerIds,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserRef.current?.id || 'unknown',
    }
    setRoutePlans(prev => existing ? prev.map(p => p.date === date ? plan : p) : [...prev, plan])
    dbSave(db.upsertRoutePlanDB(plan))
    logAudit('update', 'customer', plan.id, `จัดลำดับวิ่ง ${date}`, `${orderedCustomerIds.length} ลูกค้า`)
  }, [logAudit])

  // ---- Computed Helpers ----

  // 255 Phase 1.b: Facet Vocabulary update / reset
  const updateFacetVocab = useCallback(async (vocab: FacetVocab) => {
    setFacetVocab(vocab)
    try {
      await saveFacetVocab(vocab)
    } catch (err) {
      console.error('[facet vocab] save failed:', err)
      throw err
    }
  }, [])

  const resetFacetVocab = useCallback(async () => {
    setFacetVocab(DEFAULT_FACET_VOCAB)
    try {
      await saveFacetVocab(DEFAULT_FACET_VOCAB)
    } catch (err) {
      console.error('[facet vocab] reset failed:', err)
      throw err
    }
  }, [])

  /**
   * คำนวณ carry-over (ค้าง/คืน) สะสมของลูกค้า ก่อนวันที่ที่กำหนด
   *
   * Mode (4 เคส):
   *   1: col6_แพคส่ง − col5_โรงซักนับเข้า    (default, ใช้เปิดบิล)
   *   2: col6_แพคส่ง − col2_ลูกค้านับส่ง
   *   3: col4_ลูกค้านับกลับ − col5_โรงซักนับเข้า  (cross check)
   *   4: col4_ลูกค้านับกลับ − col2_ลูกค้านับส่ง
   *
   * Apply order:
   *   1. หา Reset checkpoint ล่าสุดต่อ item code → ignore LF/adjustments ก่อนวัน reset
   *   2. Sum diff จาก LF (เฉพาะหลัง reset)
   *   3. Apply Adjustments (เฉพาะหลัง reset)
   */
  const getCarryOver = useCallback((
    customerId: string,
    beforeDate: string,
    mode: CarryOverMode = 1,
    includeHidden: boolean = true,
  ): Record<string, number> => {
    const result: Record<string, number> = {}

    // Step 1: หา Reset checkpoint ล่าสุดต่อ item code
    const resetDateMap: Record<string, string> = {}
    const resets = carryOverAdjustments
      .filter(a =>
        !a.isDeleted &&
        a.customerId === customerId &&
        a.type === 'reset' &&
        a.date < beforeDate &&
        (includeHidden || a.showInCustomerReport)
      )
      .sort((a, b) => b.date.localeCompare(a.date)) // latest first
    for (const r of resets) {
      for (const it of r.items) {
        if (!resetDateMap[it.code]) {
          resetDateMap[it.code] = r.date
          result[it.code] = 0 // ทุกเคสเป็น 0 ตั้งแต่วัน reset
        }
      }
    }

    // Step 2: Sum from LF rows (skip if before reset date for that item code)
    // 330 — Group-aware: ถ้า LF snapshot บอกว่า col5/col2 เป็น aggregate
    //       → sum diff ทั้ง group → store ที่ anchor (กัน infinity bug)
    const forms = linenForms
      .filter(f => f.customerId === customerId && f.date < beforeDate)
      .sort((a, b) => a.date.localeCompare(b.date))
    const customer = customers.find(c => c.id === customerId)
    const catalogMap = new Map(linenCatalog.map(c => [c.code, c]))
    // Fallback snapshot สำหรับ LF เก่าก่อน 330 (ไม่มี aggregateSnapshot)
    const fallbackSnapshot = buildAggregateSnapshot(customer?.aggregateSizeGroups)
    // Pre-compute anchor codes — รวมทุก groupKey ที่อาจมีใน snapshot ทั้งของ LF + fallback
    const allGroupKeys = new Set<string>()
    if (fallbackSnapshot) Object.keys(fallbackSnapshot).forEach(k => allGroupKeys.add(k))
    for (const f of forms) {
      if (f.aggregateSnapshot) Object.keys(f.aggregateSnapshot).forEach(k => allGroupKeys.add(k))
    }
    // 335: customer config อาจมี manual anchor override → pass เข้า computeAnchorByGroup
    const configAnchors = new Map<string, string>(
      (customer?.aggregateSizeGroups ?? [])
        .filter(c => c.anchorCode)
        .map(c => [c.groupKey, c.anchorCode!]),
    )
    const anchorByGroup = computeAnchorByGroup(allGroupKeys, linenCatalog, configAnchors)

    for (const form of forms) {
      // 265: ถ้า LF snapshot = trust_customer → บังคับใช้ Mode 2 ไม่ว่า caller จะเลือก mode ใด
      //      เหตุผล: trust LF ไม่มี col4 + col5 → mode 1/3 จะคำนวณผิด
      const effectiveMode: CarryOverMode = form.workflowMode === 'trust_customer' ? 2 : mode
      // 330: ใช้ snapshot ของ LF (drift-proof) — fallback ไป customer ปัจจุบันถ้า LF ไม่มี
      const snapshot = form.aggregateSnapshot ?? fallbackSnapshot
      const formDiffs = diffsForForm(
        form.rows,
        effectiveMode,
        snapshot,
        catalogMap,
        anchorByGroup,
        (code) => !!resetDateMap[code] && form.date < resetDateMap[code],
      )
      for (const [code, diff] of Object.entries(formDiffs)) {
        result[code] = (result[code] || 0) + diff
      }
    }

    // Step 3: Apply Adjustments (delta — apply to all modes equally)
    const adjustments = carryOverAdjustments
      .filter(a =>
        !a.isDeleted &&
        a.customerId === customerId &&
        a.type === 'adjust' &&
        a.date < beforeDate &&
        (includeHidden || a.showInCustomerReport)
      )
    for (const adj of adjustments) {
      for (const it of adj.items) {
        if (resetDateMap[it.code] && adj.date < resetDateMap[it.code]) continue
        result[it.code] = (result[it.code] || 0) + (it.delta || 0)
      }
    }

    return result
  }, [linenForms, carryOverAdjustments, customers, linenCatalog])

  const getDiscrepancies = useCallback((formId: string): Record<string, number> => {
    const form = linenForms.find(f => f.id === formId)
    if (!form) return {}

    const result: Record<string, number> = {}
    for (const row of form.rows) {
      // Discrepancy 1: นับเข้า (col5) ≠ นับส่ง + เคลม (col2 + col3)
      const expected = row.col2_hotelCountIn + row.col3_hotelClaimCount
      const countIn = row.col5_factoryClaimApproved
      if (countIn > 0 && countIn !== expected) {
        result[row.code] = countIn - expected
      }
      // Discrepancy 2: นับกลับ (col4) ≠ แพคส่ง (col6)
      const packSend = row.col6_factoryPackSend || 0
      const countBack = row.col4_factoryApproved
      if (countBack > 0 && countBack !== packSend) {
        result[row.code] = (result[row.code] || 0) + (countBack - packSend)
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
      linenForms, addLinenForm, addLinenFormsBatch, updateLinenForm, updateLinenFormStatus, deleteLinenForm,
      deliveryNotes, addDeliveryNote, addDeliveryNotesBatch, updateDeliveryNote, updateDeliveryNoteStatus, deleteDeliveryNote,
      deleteDeliveryNotesBatch, updateDeliveryNotesBatchByIds,
      billingStatements, addBillingStatement, updateBillingStatus, updateBillingStatement, deleteBillingStatement,
      deleteBillingStatementsBatch,
      taxInvoices, addTaxInvoice, updateTaxInvoice, deleteTaxInvoice,
      receipts, addReceipt, updateReceipt, deleteReceipt,
      legacyDocuments,
      quotations, addQuotation, updateQuotation, updateQuotationStatus, deleteQuotation,
      expenses, addExpense, updateExpense, deleteExpense,
      users, addUser, updateUser, resetPassword,
      defaultPrices, updateDefaultPrice,
      companyInfo, updateCompanyInfo,
      linenCatalog, addLinenItem, updateLinenItem, deleteLinenItem, getItemName, getItemNameMap,
      linenCategories, addCategory, updateCategory, deleteCategory, getCategoryLabel,
      customerCategories, addCustomerCategory, updateCustomerCategory, deleteCustomerCategory, getCustomerCategoryLabel,
      checklists, addChecklist, updateChecklist, updateChecklistStatus, deleteChecklist,
      carryOverAdjustments, addCarryOverAdjustment, updateCarryOverAdjustment, deleteCarryOverAdjustment,
      rebuildAggregateSnapshots,
      scheduleOverrides, addScheduleOverride, updateScheduleOverride, deleteScheduleOverride,
      routePlans, setRouteOrder,
      facetVocab, updateFacetVocab, resetFacetVocab,
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
    await db.upsertLinenCategories(DEFAULT_LINEN_CATEGORIES)
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
