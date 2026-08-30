"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// "Reports" was removed as a standalone nav item — the Dashboard already surfaces
// the reporting / compliance overview, and per-scan report generation still lives
// on the scan detail page (unchanged). The /analytics route itself is untouched.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/scans/new", label: "Scan", icon: "barcode_scanner" },
  { href: "/scans", label: "History", icon: "history" },
  { href: "/products", label: "Products", icon: "inventory_2" },
  { href: "/ecommerce", label: "E-Commerce", icon: "shopping_cart" },
  { href: "/admin", label: "Admin", icon: "admin_panel_settings" },
];

export default function LmSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    try {
      setUser(JSON.parse(localStorage.getItem("auth_user") || "null"));
    } catch {
      setUser(null);
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    router.push("/login");
  }

  const initials = (user?.name || "LM")
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="bg-surface h-screen w-64 fixed left-0 top-0 border-r border-outline-variant flex-col py-6 px-4 z-40 hidden md:flex">
      <div className="mb-8 px-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            gavel
          </span>
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface m-0">LegalM</h1>
          <p className="font-label-caps text-label-caps text-on-surface-variant m-0">Metrology Compliance</p>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-2">
        {NAV.map((item, i) => {
          const active =
            item.label === "History"
              ? pathname.startsWith("/scans") && !pathname.startsWith("/scans/new")
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label + i}
              href={item.href}
              className={cn("lm-nav-item", active ? "lm-nav-item-active" : "lm-nav-item-inactive")}
            >
              <span className="material-symbols-outlined" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 pt-6 border-t border-outline-variant px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-sm border border-outline-variant flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body-md text-body-md font-bold truncate">{user?.name || "LegalM User"}</p>
            <p className="font-label-caps text-label-caps text-on-surface-variant truncate capitalize">
              {user?.role || ""}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-1.5 text-on-surface-variant hover:text-status-fail transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
