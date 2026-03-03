import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import { StoreProvider } from '@/lib/store'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FlowClean - ระบบบริหารโรงซักรีด',
  description: 'ระบบจัดการโรงซักรีดอุตสาหกรรม สำหรับบริการโรงแรม — บริษัท คราฟท์ แอนด์ มอร์ จำกัด',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={sarabun.className}>
        <StoreProvider>
          {children}
        </StoreProvider>
      </body>
    </html>
  )
}
