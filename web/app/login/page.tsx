"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("auth_token", res.data.access_token);
      localStorage.setItem("auth_user", JSON.stringify(res.data.user));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Login failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gov-navy flex flex-col">
      {/* Top accent */}
      <div className="h-1 bg-gov-saffron" />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-7xl mb-4">🇮🇳</div>
            <p className="text-white/60 text-xs uppercase tracking-widest mb-1">
              Government of India
            </p>
            <h1 className="text-white text-xl font-bold leading-tight">
              Ministry of Consumer Affairs,<br />Food &amp; Public Distribution
            </h1>
            <div className="w-16 h-0.5 bg-gov-saffron mx-auto my-4 rounded" />
            <h2 className="text-white text-2xl font-extrabold">
              Legal Metrology Compliance
            </h2>
            <p className="text-white/50 text-xs mt-1">Admin &amp; Supervisor Dashboard</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h3 className="text-gray-800 text-lg font-bold mb-1">Sign In</h3>
            <p className="text-gray-400 text-xs mb-6">
              Authorised personnel only. Use your department credentials.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Email / User ID
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@lm.gov.in"
                  required
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gov-navy/30 focus:border-gov-navy"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gov-navy/30 focus:border-gov-navy"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gov-navy text-white font-bold py-3 rounded-lg hover:bg-gov-dark transition-colors disabled:opacity-50 text-sm tracking-wide"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>

          <p className="text-center text-white/30 text-xs mt-6">
            © Department of Consumer Affairs | NIC | SIH 2026
          </p>
        </div>
      </div>
    </div>
  );
}
