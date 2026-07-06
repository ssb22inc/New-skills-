import type { ReactNode } from 'react';

export const metadata = {
  title: 'Sycamore',
  description: 'Book trusted local businesses on WhatsApp',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F7F3EC',
};

/**
 * Buyer-facing shell uses the LIGHT theme (Design Language §3): warm
 * paper, ocean gradient headers. Styles are inlined — the performance
 * budget (<100KB, <2s on 3G) is a design constraint, not an afterthought.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#F7F3EC',
          color: '#0B1A26',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
