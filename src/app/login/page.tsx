"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { btn, btnGhost, input } from "@/components/ui";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const supabase = createClient();
    setBusy(true);
    setMessage({});
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ error: error.message });
      else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: String(fd.get("full_name") ?? "") },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error) setMessage({ error: error.message });
      else if (data.session) {
        router.push("/");
        router.refresh();
      } else setMessage({ ok: "Check your email to confirm your account, then sign in." });
    }
    setBusy(false);
  }

  async function google() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setMessage({ error: error.message });
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center">
          <Logo height={44} priority />
          <p className="mb-6 mt-2 text-sm text-slate-500">Growth, handled.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input name="full_name" required placeholder="Full name" autoComplete="name" className={input} />
          )}
          <input name="email" type="email" required placeholder="Work email" autoComplete="email" className={input} />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className={input}
          />
          <button disabled={busy} className={`${btn} w-full`}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button onClick={google} className={`${btnGhost} mt-3 w-full`}>
          Continue with Google
        </button>

        {message.error && <p className="mt-3 text-sm text-red-700">{message.error}</p>}
        {message.ok && <p className="mt-3 text-sm text-emerald-700">{message.ok}</p>}

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-sm text-indigo-600 hover:underline"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
