import type { Metadata } from 'next';
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}