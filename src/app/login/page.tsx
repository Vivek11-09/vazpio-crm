"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { btn, btnGhost, input } from "@/components/ui";
import { Logo } from "@/components/logo";

// Supabase's wording is technical; these are the ones people actually hit.
function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return "The email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Please verify your email first. Open the link we sent you, then sign in.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/provider is not enabled/i.test(message)) return "Google sign-in is not switched on yet. Use your email and password.";
  return message;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Set once an account has been created: the form is replaced by the "what happens next" steps.
  const [createdFor, setCreatedFor] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).trim();
    const password = String(fd.get("password"));
    const supabase = createClient();
    setBusy(true);
    setMessage({});
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ error: friendly(error.message) });
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
      if (error) setMessage({ error: friendly(error.message) });
      else if (data.user && data.user.identities?.length === 0) {
        // Supabase answers this way when the email is already registered.
        setMode("signin");
        setMessage({ error: "An account with this email already exists. Sign in instead." });
      } else if (data.session) {
        router.push("/");
        router.refresh();
      } else setCreatedFor(email);
    }
    setBusy(false);
  }

  async function resend() {
    if (!createdFor) return;
    setBusy(true);
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: createdFor,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setMessage(error ? { error: friendly(error.message) } : { ok: "Verification email sent again." });
    setBusy(false);
  }

  async function google() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setMessage({ error: friendly(error.message) });
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center">
          <Logo height={44} priority />
          <p className="mb-6 mt-2 text-sm text-slate-500">Growth, handled.</p>
        </div>

        {createdFor ? (
          <div role="status">
            <h1 className="text-base font-semibold text-slate-900">Account created. Two steps left.</h1>
            <ol className="mt-3 space-y-3 text-sm text-slate-700">
              <li className="flex gap-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">1</span>
                <span>
                  <strong>Verify your email.</strong> We sent a link to <span className="font-medium break-all">{createdFor}</span>.
                  Open it to confirm your address. Check your spam folder if it is not in your inbox.
                </span>
              </li>
              <li className="flex gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-white">2</span>
                <span>
                  <strong>Ask your Vazpio admin to approve you.</strong> They assign your role on the Users page.
                  You can sign in as soon as that is done.
                </span>
              </li>
            </ol>
            <div className="mt-4 flex gap-2">
              <button onClick={resend} disabled={busy} className={`${btnGhost} flex-1`}>Resend email</button>
              <button
                onClick={() => { setCreatedFor(null); setMode("signin"); setMessage({}); }}
                className={`${btn} flex-1`}
              >
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-3">
              {mode === "signup" && (
                <input name="full_name" required placeholder="Full name" autoComplete="name" className={input} />
              )}
              <input name="email" type="email" required placeholder="Work email" autoComplete="email" className={input} />
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="Password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className={`${input} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
              {mode === "signup" && <p className="text-xs text-slate-500">At least 8 characters.</p>}
              <button disabled={busy} className={`${btn} w-full`}>
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <button onClick={google} className={`${btnGhost} mt-3 w-full gap-2`}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z" />
              </svg>
              Continue with Google
            </button>
          </>
        )}

        {message.error && <p role="alert" className="mt-3 text-sm text-red-700">{message.error}</p>}
        {message.ok && <p role="status" className="mt-3 text-sm text-emerald-700">{message.ok}</p>}

        {!createdFor && (
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage({}); }}
            className="mt-4 text-sm text-indigo-600 hover:underline"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        )}
      </div>
    </main>
  );
}
