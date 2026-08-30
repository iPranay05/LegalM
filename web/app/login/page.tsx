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

  // NOTE: auth logic is unchanged from the working LegalM app — only markup/styling
  // below has been reskinned to match the Stitch "login_legalm" design.
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
    <div className="bg-surface text-on-surface h-screen w-full flex items-center justify-center font-body-md relative overflow-hidden">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 400 }}>
          account_balance
        </span>
      </div>

      <main className="w-full max-w-md bg-surface-container-lowest border border-border-subtle rounded-xl shadow-sm relative z-10 mx-margin-mobile md:mx-0 p-8 flex flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center pb-6 border-b border-border-subtle">
          <div className="h-16 w-16 bg-primary-container rounded-full flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-3xl text-on-primary-container">gavel</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-primary">LegalM</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Metrology Compliance Portal</p>
        </header>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label className="lm-label" htmlFor="email">
              Email or Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-outline-variant text-sm">mail</span>
              </div>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@gov.ext"
                required
                className="lm-input pl-9"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="lm-label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-outline-variant text-sm">lock</span>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="lm-input pl-9"
              />
            </div>
            <div className="flex justify-end mt-1">
              <a className="font-body-md text-body-md text-secondary hover:text-on-secondary-fixed-variant transition-colors" href="#">
                Forgot Password?
              </a>
            </div>
          </div>

          {error && (
            <div className="bg-error-container text-on-error-container text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button type="submit" disabled={loading} className="lm-btn-primary">
              {loading ? "Signing in…" : "Secure Login"}
              <span className="material-symbols-outlined text-sm">login</span>
            </button>
          </div>
        </form>

        <footer className="text-center pt-4 border-t border-border-subtle">
          <p className="font-body-md text-body-md text-on-surface-variant">
            Authorized Personnel Only.
            <br />
            <a className="text-secondary hover:text-on-secondary-fixed-variant font-semibold transition-colors mt-1 inline-block" href="#">
              Request Access
            </a>
          </p>
        </footer>
      </main>

      <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-surface-container-lowest border border-border-subtle rounded shadow-sm">
        <span className="h-2 w-2 rounded-full bg-status-pass" />
        <span className="font-data-mono text-data-mono text-on-surface-variant">Sys: Online</span>
      </div>
    </div>
  );
}
