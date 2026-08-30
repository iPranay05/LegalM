"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/scans", label: "Scans", icon: "📋" },
  { href: "/products", label: "Products", icon: "📦" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
  { href: "/ecommerce", label: "E-Commerce", icon: "🛒" },
  { href: "/admin", label: "Admin", icon: "⚙️" },
];

export default function GovTopBar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    router.push("/login");
  }

  return (
    <header className="bg-gov-navy text-white shadow-lg">
      {/* Top stripe */}
      <div className="bg-gov-saffron h-1" />

      {/* Main bar */}
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="text-2xl">🇮🇳</div>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-widest text-white/60 leading-none">
            Ministry of Consumer Affairs, Food &amp; Public Distribution
          </p>
          <p className="text-sm font-bold leading-tight mt-0.5">
            Legal Metrology Compliance Monitor
          </p>
        </div>
        <span className="hidden md:block text-[10px] text-white/50 uppercase tracking-wide">
          LM (PC) Rules, 2011
        </span>
        <button
          onClick={handleLogout}
          className="text-xs bg-white/10 hover:bg-white/20 transition px-3 py-1.5 rounded-lg font-semibold"
        >
          Logout
        </button>
      </div>

      {/* Nav */}
      <nav className="max-w-screen-xl mx-auto px-4 flex gap-1 pb-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 text-sm px-4 py-2 rounded-t-lg font-semibold transition-colors",
              pathname.startsWith(item.href)
                ? "bg-white text-gov-navy"
                : "text-white/80 hover:bg-white/10"
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
