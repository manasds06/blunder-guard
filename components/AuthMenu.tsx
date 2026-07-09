"use client";

import { useEffect, useState } from "react";
import { getSupabase, isAuthConfigured } from "@/lib/storage/supabase";
import { mergeOnLogin } from "@/lib/storage/sync";

/**
 * Optional auth menu. Progressive enhancement: hidden/disabled without Supabase env.
 */
export function AuthMenu() {
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>();
  const configured = isAuthConfigured();

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void sb.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
      if (session) void mergeOnLogin();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <span className="hidden text-xs text-[var(--muted)] sm:inline" title="Set NEXT_PUBLIC_SUPABASE_URL + ANON_KEY">
        Local mode
      </span>
    );
  }

  async function signIn() {
    const sb = getSupabase();
    if (!sb || !email) return;
    const { error } = await sb.auth.signInWithOtp({ email });
    setMsg(error ? error.message : "Check your email for the magic link.");
  }

  async function signOut() {
    const sb = getSupabase();
    await sb?.auth.signOut();
    setUserEmail(null);
  }

  if (userEmail) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[var(--muted)]">{userEmail}</span>
        <button type="button" className="hover:underline" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <input
        type="email"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-28 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 sm:w-36"
      />
      <button type="button" className="hover:underline" onClick={() => void signIn()}>
        Sign in
      </button>
      {msg && <span className="text-[var(--muted)]">{msg}</span>}
    </div>
  );
}
