import Link from "next/link";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">This record is not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          It may not exist, or it belongs to a client you are not assigned to.
        </p>
        <Link href="/" className={`${btn} mt-5`}>Back to the calling sheet</Link>
      </div>
    </main>
  );
}
