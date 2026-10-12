"use client";

import { btn } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">The page could not be loaded. Your data is safe. Try again.</p>
        <button onClick={reset} className={`${btn} mt-5`}>Try again</button>
      </div>
    </main>
  );
}
