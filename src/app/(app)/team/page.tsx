import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleSelect } from "@/components/RoleSelect";
import { PendingApprovals } from "@/components/PendingApprovals";
import { StatusControl } from "@/components/StatusControl";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Team · Own The Trend" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  if (me?.role !== "owner") redirect("/creatives");

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at")
    .returns<Profile[]>();

  const all = members ?? [];
  const pending = all.filter((m) => m.status === "pending");
  const rest = all.filter((m) => m.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted">
          New signups wait here until you approve them. Nobody sees the library
          before that.
        </p>
      </div>

      <PendingApprovals pending={pending} />

      <h2 className="mb-3 text-[13px] font-medium">
        Members{rest.length > 0 && ` · ${rest.length}`}
      </h2>

      <div className="card divide-y divide-border overflow-hidden">
        {rest.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">
              {`${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`.toUpperCase() || "?"}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">
                {member.first_name} {member.last_name}
                {member.id === user!.id && (
                  <span className="ml-1.5 text-[11px] text-faint">(you)</span>
                )}
                {member.status === "rejected" && (
                  <span className="ml-1.5 text-[11px] text-bad">declined</span>
                )}
              </p>
              <p className="truncate text-[11px] text-faint">{member.email}</p>
            </div>

            {member.id !== user!.id && (
              <StatusControl userId={member.id} status={member.status} />
            )}

            <RoleSelect userId={member.id} role={member.role} />
          </div>
        ))}
      </div>
    </div>
  );
}
