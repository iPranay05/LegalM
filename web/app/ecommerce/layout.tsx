import LmSidebar from "@/components/LmSidebar";
import LmTopBar from "@/components/LmTopBar";

export default function EcommerceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen w-full flex">
      <LmSidebar />
      <main className="flex-1 md:ml-64 flex flex-col min-h-screen bg-bg-offset">
        <LmTopBar title="E-Commerce" />
        <div className="flex-1 p-margin-mobile md:p-margin-desktop">
          <div className="max-w-container-max mx-auto space-y-gutter">{children}</div>
        </div>
        <footer className="border-t border-outline-variant py-4 text-center text-label-caps text-on-surface-variant">
          Legal Metrology (Packaged Commodities) Rules, 2011 · FR-18 E-Commerce Compliance · NIC
        </footer>
      </main>
    </div>
  );
}
