import { redirect } from "next/navigation";
import { getSession, isClientRole } from "@/lib/auth";

export default async function Home() {
  const { profile } = await getSession();
  redirect(isClientRole(profile.role) ? "/portal" : "/sheet");
}
