import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { DrafterProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";

/**
 * Three faces, each doing one job.
 *
 * Fonts are self-hosted by next/font at build time — no runtime request to
 * Google, so a live demo never blocks on the network, and there is no
 * flash of unstyled text.
 *
 *  Inter        the interface. The neutral, highly legible grotesque that
 *               serious software uses; it should not be noticed.
 *  Newsreader   the document and the display headings. A high-contrast
 *               transitional serif with a genuine optical-size axis, so a
 *               24px heading is drawn differently from 15px body text rather
 *               than merely scaled. That is what separates an editorial page
 *               from a web page.
 *  JetBrains    requirement IDs, CINs, regulation numbers. A proper mono keeps
 *               R5.9 and R5.12 the same width, which matters when they are
 *               read in a column.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Drafter · SME IPO offer-document generation",
  description:
    "Turn an SME promoter's plain-language answers into a structured, disclosure-mapped draft DRHP with an exchange-style gap and consistency check. SEBI Securities Market TechSprint @ GFF 2026, Track 04.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <DrafterProvider>
          <AppShell>{children}</AppShell>
        </DrafterProvider>
      </body>
    </html>
  );
}
