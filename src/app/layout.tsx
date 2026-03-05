import type { Metadata } from 'next'
import '@fontsource/sarabun/300.css'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/500.css'
import '@fontsource/sarabun/600.css'
import '@fontsource/sarabun/700.css'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import { ToastProvider } from '@/components/Toast'

export const metadata: Metadata = {
  title: 'FlowClean - ระบบบริหารโรงซักรีด',
  description: 'ระบบจัดการโรงซักรีดอุตสาหกรรม สำหรับบริการโรงแรม — บริษัท คราฟท์ แอนด์ มอร์ จำกัด',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <ToastProvider>
          <StoreProvider>
            {children}
          </StoreProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
