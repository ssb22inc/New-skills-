import type { ReactNode } from 'react';
import { FONT_UI, INK, PAPER } from '@sycamore/design';

export const metadata = {
  title: 'Sycamore',
  description: 'Book trusted local businesses on WhatsApp',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: PAPER,
};

/**
 * Buyer-facing shell uses the LIGHT theme (Design Language §3): warm
 * paper, ocean gradient headers. Colour and type come from
 * @sycamore/design — never a hex typed in by hand. Styles are inlined:
 * the performance budget (<100KB, <2s on 3G) is a design constraint, not
 * an afterthought.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: PAPER, color: INK, fontFamily: FONT_UI }}>
        {children}
      </body>
    </html>
  );
}
