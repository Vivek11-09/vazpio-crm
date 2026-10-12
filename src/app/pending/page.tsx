import { signOut } from "@/app/actions";
import { SubmitButton } from "@/components/client-bits";
import { btnGhost } from "@/components/ui";
import { Logo } from "@/components/logo";

export default function Pending() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="flex justify-center"><Logo height={40} priority /></div>
        <h1 className="mt-3 text-lg font-semibold">Your account is awaiting approval</h1>
        <p className="mt-2 text-sm text-slate-600">
          A Vazpio admin needs to assign your role before you can sign in. Ask them to activate your
          account, then sign in again.
        </p>
        <form action={signOut} className="mt-5">
          <SubmitButton className={btnGhost}>Sign out</SubmitButton>
        </form>
      </div>
    </main>
  );
}
