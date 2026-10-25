import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SaMi Errands — Everyday help, organised.",
    template: "%s | SaMi Errands"
  },
  description: "From shopping and collections to personal and business tasks, SaMi Errands connects you with people ready to get things done.",
  applicationName: "SaMi Errands",
  category: "services",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }]
  },
  openGraph: {
    type: "website",
    siteName: "SaMi Errands",
    title: "SaMi Errands — Everyday help, organised.",
    description: "Your everyday and business errands, handled with clear service fees and accountable updates."
  },
  twitter: {
    card: "summary",
    title: "SaMi Errands — Everyday help, organised.",
    description: "Your everyday and business errands, handled with clear service fees and accountable updates."
  }
};

export const viewport: Viewport = {
  themeColor: "#087E76",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
