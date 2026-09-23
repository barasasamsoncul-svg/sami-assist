import type { Metadata } from 'next';

import SaMiThemeProvider from '@/app/components/SaMiThemeProvider';

import './globals.css';

export const metadata: Metadata = {
  title: 'SaMi - AI-Powered Business Workspace',
  description: 'Run your business with AI on your side.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        />
      </head>

      <body>
        <SaMiThemeProvider />
        {children}
      </body>
    </html>
  );
}
