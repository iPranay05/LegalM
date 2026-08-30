"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SECTIONS = [
  { href: "/admin/rules", icon: "📜", title: "Rules Management", desc: "Create and retire compliance rules. Controller-only. Rules are never hard-deleted." },
  { href: "/admin/relaxations", icon: "🔓", title: "Relaxation Orders", desc: "Manage gazette-notified relaxation orders that exempt rules for categories or regions." },
  { href: "/admin/users", icon: "👤", title: "User Management", desc: "View all officers, update roles (inspector / supervisor / admin / controller / manufacturer)." },
];

export default function AdminIndexPage() {
  const router = useRouter();
  useEffect(() => {
    if (!localStorage.getItem("auth_token")) router.push("/login");
  }, [router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-0.5">Controller &amp; Admin access only</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="stat-card flex flex-col gap-3 hover:border-gov-navy transition-colors cursor-pointer">
            <span className="text-4xl">{s.icon}</span>
            <div>
              <h2 className="font-bold text-gray-800">{s.title}</h2>
              <p className="text-sm text-gray-500 mt-1">{s.desc}</p>
            </div>
            <span className="text-xs text-gov-navy font-semibold mt-auto">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
