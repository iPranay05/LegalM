import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legal Metrology Compliance Dashboard | MoCAFPD",
  description:
    "Compliance monitoring dashboard for Legal Metrology (Packaged Commodities) Rules, 2011 — Ministry of Consumer Affairs, Food & Public Distribution",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
