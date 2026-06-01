'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb',
            padding: '1rem',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <h1 style={{ fontSize: '5rem', fontWeight: 700, color: '#e5e7eb', userSelect: 'none' }}>
              500
            </h1>
            <h2 style={{ marginTop: '1rem', fontSize: '1.5rem', fontWeight: 600, color: '#1f2937' }}>
              Critical error
            </h2>
            <p style={{ marginTop: '0.5rem', color: '#6b7280' }}>
              A critical error prevented the page from loading. Please try again.
            </p>
            {error.digest && (
              <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                marginTop: '2rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '0.375rem',
                backgroundColor: '#2563eb',
                padding: '0.625rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
