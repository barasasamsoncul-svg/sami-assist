import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SaMi Runner API",
  description: "Independent backend for the SaMi Runner application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}