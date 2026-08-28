import GovTopBar from "@/components/GovTopBar";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <GovTopBar />
      <main className="max-w-screen-xl mx-auto px-4 py-6">{children}</main>
      <footer className="border-t border-gray-200 mt-12 py-4 text-center text-xs text-gray-400">
        Legal Metrology (Packaged Commodities) Rules, 2011 · Ministry of Consumer Affairs
      </footer>
    </div>
  );
}
