"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { User } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const ROLES = ["inspector", "supervisor", "admin", "controller", "manufacturer"];

export default function UsersAdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editActive, setEditActive] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await api.get<User[]>("/admin/users");
      setUsers(res.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
      if (e?.response?.status === 403) setError("Admin access required.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(user: User) {
    setEditingId(user.id);
    setEditRole(user.role);
    setEditActive(user.is_active);
  }

  async function saveEdit(userId: number) {
    try {
      await api.patch(`/admin/users/${userId}`, { role: editRole, is_active: editActive });
      setEditingId(null);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to update");
    }
  }

  const currentUser = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("auth_user") || "{}") : {};

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/admin" className="hover:text-gov-navy">Admin</Link><span>/</span>
          <span className="text-gray-800">Users</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500">{users.length} registered officers</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>{["Name", "Email", "Role", "State / District", "Status", "Joined", "Actions"].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="table-td font-semibold">
                  {u.name}
                  {u.id === currentUser?.id && <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 font-bold">You</span>}
                </td>
                <td className="table-td text-gray-500 text-xs">{u.email}</td>
                <td className="table-td">
                  {editingId === u.id ? (
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded capitalize ${
                      u.role === "admin" || u.role === "controller"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-gray-100 text-gray-700"
                    }`}>{u.role}</span>
                  )}
                </td>
                <td className="table-td text-gray-500 text-xs">{[u.district, u.state].filter(Boolean).join(", ") || "—"}</td>
                <td className="table-td">
                  {editingId === u.id ? (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="accent-gov-navy" />
                      Active
                    </label>
                  ) : (
                    u.is_active
                      ? <span className="badge-pass text-[10px]">Active</span>
                      : <span className="badge-fail text-[10px]">Inactive</span>
                  )}
                </td>
                <td className="table-td text-xs text-gray-400">{formatDate(u.created_at, "dd MMM yyyy")}</td>
                <td className="table-td">
                  {u.id !== currentUser?.id && (
                    editingId === u.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(u.id)} className="text-xs text-green-700 font-semibold hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(u)} className="text-xs text-gov-navy font-semibold hover:underline">Edit</button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
