/**
 * Migration: flowclean_data_v2 → flowclean_data_v4
 *
 * Changes:
 * - LinenFormRow: old 6-column → new 6-column (v4 model with carry-over ±)
 * - Customer: +customerCode, +customerType, +priceHistory
 * - DeliveryNoteItem: +isClaim (claim=free, billable=charged)
 */

import type { Customer, LinenForm, LinenFormRow, DeliveryNote, CustomerType } from '@/types'

// v2 row shape (old)
interface V2LinenFormRow {
  code: string
  col1_normalSend: number
  col2_claimSend: number
  col3_washedReturn: number
  col4_factoryCountIn: number
  col5_factoryPackSend: number
  col6_note: string
}

// v2 DeliveryNoteItem (old)
interface V2DeliveryNoteItem {
  code: string
  quantity: number
  isClaim?: boolean // may not exist in v2
}

// v2 Customer (old)
interface V2Customer {
  id: string
  name: string
  nameEn: string
  address: string
  taxId: string
  branch: string
  contactName: string
  contactPhone: string
  contactEmail: string
  creditDays: number
  billingModel: 'per_piece' | 'monthly_flat'
  monthlyFlatRate: number
  enabledItems: string[]
  priceList: { code: string; price: number }[]
  notes: string
  createdAt: string
  isActive: boolean
  // May or may not have new fields
  customerCode?: string
  customerType?: CustomerType
  priceHistory?: Customer['priceHistory']
}

// Customer code prefix by type
const TYPE_PREFIX: Record<CustomerType, string> = {
  hotel: 'HT',
  spa: 'SP',
  clinic: 'CL',
  restaurant: 'RS',
  other: 'OT',
}

function generateCustomerCode(index: number, type: CustomerType): string {
  const prefix = TYPE_PREFIX[type]
  return `${prefix}${String(index + 1).padStart(4, '0')}`
}

export function migrateLinenFormRow(oldRow: V2LinenFormRow): LinenFormRow {
  return {
    code: oldRow.code,
    col1_carryOver: 0, // will be recalculated
    col2_hotelCountIn: oldRow.col1_normalSend,
    col3_hotelClaimCount: oldRow.col2_claimSend,
    col4_factoryApproved: oldRow.col4_factoryCountIn,
    col5_factoryClaimApproved: oldRow.col2_claimSend, // best mapping
    col6_factoryPackSend: oldRow.col5_factoryPackSend, // map old packSend
    note: oldRow.col6_note,
  }
}

export function migrateLinenForm(oldForm: LinenForm & { rows: V2LinenFormRow[] }): LinenForm {
  return {
    ...oldForm,
    rows: oldForm.rows.map(migrateLinenFormRow),
  }
}

export function migrateCustomer(oldCustomer: V2Customer, index: number): Customer {
  const customerType: CustomerType = oldCustomer.customerType || 'hotel'
  return {
    ...oldCustomer,
    shortName: (oldCustomer as unknown as { shortName?: string }).shortName || '',
    customerCode: oldCustomer.customerCode || generateCustomerCode(index, customerType),
    customerType,
    priceHistory: oldCustomer.priceHistory || [],
    minPerTrip: (oldCustomer as unknown as { minPerTrip?: number }).minPerTrip ?? 0,
    selectedBankAccountId: (oldCustomer as unknown as { selectedBankAccountId?: string }).selectedBankAccountId ?? '',
    enablePerPiece: (oldCustomer as unknown as { enablePerPiece?: boolean }).enablePerPiece ?? (oldCustomer.billingModel !== 'monthly_flat'),
    enableMinPerTrip: (oldCustomer as unknown as { enableMinPerTrip?: boolean }).enableMinPerTrip ?? false,
    enableWaive: (oldCustomer as unknown as { enableWaive?: boolean }).enableWaive ?? false,
    minPerTripThreshold: (oldCustomer as unknown as { minPerTripThreshold?: number }).minPerTripThreshold ?? 0,
    enableMinPerMonth: (oldCustomer as unknown as { enableMinPerMonth?: boolean }).enableMinPerMonth ?? (oldCustomer.billingModel === 'monthly_flat'),
  }
}

export function migrateDeliveryNote(oldNote: DeliveryNote & { items: V2DeliveryNoteItem[] }): DeliveryNote {
  return {
    ...oldNote,
    isPrinted: (oldNote as unknown as { isPrinted?: boolean }).isPrinted ?? false,
    isBilled: (oldNote as unknown as { isBilled?: boolean }).isBilled ?? false,
    transportFeeTrip: (oldNote as unknown as { transportFeeTrip?: number }).transportFeeTrip ?? 0,
    transportFeeMonth: (oldNote as unknown as { transportFeeMonth?: number }).transportFeeMonth ?? 0,
    items: oldNote.items.map(item => ({
      code: item.code,
      quantity: item.quantity,
      isClaim: item.isClaim ?? false,
    })),
  }
}

/**
 * Full migration of v2 data to v4
 */
export function migrateV2ToV4(data: {
  customers: V2Customer[]
  linenForms: (LinenForm & { rows: V2LinenFormRow[] })[]
  deliveryNotes: (DeliveryNote & { items: V2DeliveryNoteItem[] })[]
  [key: string]: unknown
}): {
  customers: Customer[]
  linenForms: LinenForm[]
  deliveryNotes: DeliveryNote[]
} {
  return {
    customers: data.customers.map((c, i) => migrateCustomer(c, i)),
    linenForms: data.linenForms.map(migrateLinenForm),
    deliveryNotes: data.deliveryNotes.map(migrateDeliveryNote),
  }
}
