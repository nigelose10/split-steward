import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ModeBanner } from "@/components/ModeBanner";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Split Steward",
  description: "An agent proposes a shared-expense split. A person approves before any PayPal call.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${GeistSans.className} ${GeistMono.variable}`}>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <ModeBanner />
        <div className="shell">
          <header className="top">
            <a className="brand" href="/">
              <svg className="mark" viewBox="0 0 64 64" aria-hidden="true">
                <rect width="64" height="64" rx="16" fill="#1E6B45" />
                <path d="M32 8a24 24 0 1 0 .1 48V8z" fill="#F3EFE4" />
                <path d="M23 36.5l5.2 5.2L42 26" fill="none" stroke="#1E6B45" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                <h1>Split Steward</h1>
                <p>Propose the split. A person approves. Then PayPal.</p>
              </span>
            </a>
          </header>
          <main id="content">{children}</main>
          <footer className="site">
            Sandbox or simulation only. No live PayPal charges are created by this app. MIT licensed.
          </footer>
        </div>
      </body>
    </html>
  );
}
