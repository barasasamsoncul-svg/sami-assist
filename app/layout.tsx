import type { Metadata } from 'next';

import {
  headers,
} from 'next/headers';

import SaMiThemeProvider from '@/app/components/SaMiThemeProvider';

import './globals.css';

export const metadata: Metadata = {
  title: 'SaMi - AI-Powered Business Workspace',
  description: 'Run your business with AI on your side.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * proxy.ts creates a fresh CSP nonce for every document request
   * and forwards it through x-nonce.
   *
   * Reading request headers here is intentional:
   * - it keeps nonce-bearing HTML request-bound instead of static
   * - it lets application-owned scripts use the same nonce as the
   *   Next.js framework/runtime scripts
   * - it prevents cached/prerendered HTML from being paired with a
   *   different response nonce, which would block hydration
   */
  const nonce =
    (
      await headers()
    )
      .get(
        'x-nonce',
      )
      ?.trim() ||
    undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/*
         * External, same-origin bootstrap keeps first paint theme
         * deterministic without requiring unsafe-inline in CSP.
         */}
        <script
          id="sami-theme-bootstrap"
          src="/sami-theme-bootstrap.js"
          nonce={nonce}
        />
      </head>

      <body>
        <SaMiThemeProvider />
        {children}
      </body>
    </html>
  );
}
