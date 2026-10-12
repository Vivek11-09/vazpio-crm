export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-slate-200" />
      <div className="h-10 rounded-lg bg-slate-200" />
      <div className="h-64 rounded-xl bg-slate-200" />
    </div>
  );
}
