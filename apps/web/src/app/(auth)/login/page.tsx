"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest, persistSession } from "../../../lib/api";
import { Zap, Lock, Mail, ArrowRight, Monitor, Server, Shield } from "lucide-react";

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password }
      });
      persistSession(result.accessToken, result.refreshToken);
      router.replace("/dashboard");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login failed. Check your credentials.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-page">
      {/* Left panel - Branding */}
      <section className="relative hidden w-1/2 overflow-hidden bg-surface lg:flex lg:flex-col lg:justify-between">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-500/5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "60px 60px"
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 lg:px-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 border border-indigo-500/25">
              <Zap className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">HyperDesk</h1>
              <p className="text-xs text-neutral-500">Virtualization Platform</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold leading-tight text-white">
            Your Cloud Lab,<br />
            <span className="text-gradient">Your Rules.</span>
          </h2>
          <p className="mt-4 max-w-md text-neutral-400 leading-relaxed">
            Manage virtual machines, hypervisors, and infrastructure through a modern control plane. Built for labs, education, and development.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300">
              <Monitor className="h-3.5 w-3.5 text-indigo-400" />
              VNC & RDP Console
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300">
              <Server className="h-3.5 w-3.5 text-emerald-400" />
              libvirt / QEMU
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300">
              <Shield className="h-3.5 w-3.5 text-amber-400" />
              Role-Based Access
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-12 pb-8 lg:px-16">
          <p className="text-xs text-neutral-600">Inspired by IsardVDI</p>
        </div>
      </section>

      {/* Right panel - Login form */}
      <section className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/25">
              <Zap className="h-5 w-5 text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold text-white">HyperDesk</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="mt-2 text-sm text-neutral-500">Sign in to your console account</p>
          </div>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="input-label" htmlFor="email">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Mail className="h-4 w-4 text-neutral-500" />
                </div>
                <input
                  id="email"
                  className="input pl-10"
                  type="email"
                  placeholder="admin@hyperdesk.local"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="input-label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Lock className="h-4 w-4 text-neutral-500" />
                </div>
                <input
                  id="password"
                  className="input pl-10"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="alert-error">
                {error}
              </div>
            )}

            <button className="btn-primary w-full justify-center" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-neutral-600">
            HyperDesk v0.1.0 &middot; Secure virtualization console
          </p>
        </div>
      </section>
    </main>
  );
}
