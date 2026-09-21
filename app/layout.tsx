import type { Metadata } from 'next';

import SaMiThemeProvider from '@/app/components/SaMiThemeProvider';

import {
  SAMI_THEME_BOOTSTRAP_SCRIPT,
} from '@/lib/theme/runtime';

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
        <script
          id="sami-theme-bootstrap"
          dangerouslySetInnerHTML={{
            __html:
              SAMI_THEME_BOOTSTRAP_SCRIPT,
          }}
        />
      </head>

      <body>
        <SaMiThemeProvider />
        {children}
      </body>
    </html>
  );
}
