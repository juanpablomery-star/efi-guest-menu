import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EFI Hotel - Menú',
  description: 'Menú QR para huéspedes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  )
}
