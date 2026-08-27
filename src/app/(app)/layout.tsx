import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/TopNav";
import { PendingScreen } from "@/components/PendingScreen";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  // The signup trigger normally creates this row; if it's missing the account
  // is unusable, so send them back through auth rather than half-rendering.
  if (!profile) redirect("/login");

  // Unapproved accounts see nothing — RLS returns empty for them anyway, so
  // this is the explanation rather than the enforcement.
  if (profile.status !== "approved") {
    return <PendingScreen profile={profile} />;
  }

  // The Team tab carries a badge for the owner when signups are waiting.
  let pendingCount = 0;
  if (profile.role === "owner") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingCount = count ?? 0;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav profile={profile} pendingCount={pendingCount} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
