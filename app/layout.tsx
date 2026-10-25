import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SaMi Errands | Get everyday things done", description: "A marketplace connecting people and businesses with reliable providers for everyday errands.", applicationName: "SaMi Errands" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}