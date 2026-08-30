"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState, FormEvent } from "react";
import { cn } from "@/lib/utils";

const MOBILE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/scans/new", label: "Scan", icon: "barcode_scanner" },
  { href: "/scans", label: "History", icon: "history" },
  { href: "/products", label: "Products", icon: "inventory_2" },
  { href: "/admin", label: "Admin", icon: "admin_panel_settings" },
];

export default function LmTopBar({ title }: { title?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setUser(JSON.parse(localStorage.getItem("auth_user") || "null"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleLogout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    router.push("/login");
  }

  // Real search: hands off to the Scan History page, which queries the existing
  // /scan/ API and filters on Scan ID, Product Name and Manufacturer (brand name).
  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/scans?q=${encodeURIComponent(q)}`);
  }

  const initials = (user?.name || "LM")
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <header className="bg-surface-bright text-on-surface font-body-lg text-body-lg sticky top-0 z-30 border-b border-outline-variant flex justify-between items-center h-16 px-margin-mobile md:px-margin-desktop w-full">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface md:hidden truncate">
            {title || "LegalM"}
          </h2>
          <form onSubmit={handleSearch} className="hidden md:flex relative w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
              search
            </span>
            <input
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary font-body-md text-body-md text-on-surface"
              placeholder="Search Scan ID, Product, Manufacturer…"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setSettingsOpen((s) => !s)}
              className={cn(
                "p-2 text-on-surface-variant hover:text-secondary transition-colors hidden md:inline-flex",
                settingsOpen && "text-secondary"
              )}
              title="Account & Settings"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-surface rounded-xl border border-outline-variant shadow-lg py-3 z-40">
                <div className="px-4 pb-3 border-b border-outline-variant flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs border border-outline-variant flex-shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-body-md text-body-md font-bold truncate m-0">{user?.name || "LegalM User"}</p>
                    <p className="text-xs text-on-surface-variant truncate m-0">{user?.email || ""}</p>
                  </div>
                </div>
                <div className="px-4 py-2 text-xs text-on-surface-variant space-y-1">
                  <div className="flex justify-between"><span>Role</span><span className="font-semibold text-on-surface capitalize">{user?.role || "—"}</span></div>
                  {user?.district && <div className="flex justify-between"><span>District</span><span className="font-semibold text-on-surface">{user.district}</span></div>}
                  {user?.state && <div className="flex justify-between"><span>State</span><span className="font-semibold text-on-surface">{user.state}</span></div>}
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 mt-2 text-sm text-status-fail hover:bg-status-fail/5 flex items-center gap-2 border-t border-outline-variant pt-3"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Logout
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-on-surface-variant hover:text-status-fail transition-colors md:hidden"
            title="Logout"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </header>

      {/* Mobile nav strip */}
      <nav className="md:hidden flex gap-1 overflow-x-auto px-2 py-2 bg-surface border-b border-outline-variant sticky top-16 z-20">
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors",
              pathname.startsWith(item.href)
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
