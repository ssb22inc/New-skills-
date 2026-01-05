import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Haven - Find Your Perfect Temporary Home',
  description: 'AI-powered housing platform for travel nurses and healthcare professionals. Find verified, furnished rentals with intelligent matching.',
  keywords: ['travel nurse housing', 'temporary housing', 'furnished rentals', 'healthcare housing'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
