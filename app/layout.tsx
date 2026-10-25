import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SaMi — Everyday help, organised.",
    template: "%s | SaMi"
  },
  description: "From shopping and collections to personal and business tasks, SaMi helps people and businesses get everyday tasks done with clear fees and accountable updates.",
  applicationName: "SaMi",
  category: "services",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }]
  },
  openGraph: {
    type: "website",
    siteName: "SaMi",
    title: "SaMi — Everyday help, organised.",
    description: "Everyday and business tasks, handled with clear service fees and accountable updates."
  },
  twitter: {
    card: "summary",
    title: "SaMi — Everyday help, organised.",
    description: "Everyday and business tasks, handled with clear service fees and accountable updates."
  }
};

export const viewport: Viewport = {
  themeColor: "#087E76",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
