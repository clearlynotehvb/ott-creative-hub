import { createClient } from "@/lib/supabase/server";
import { GroupManager } from "@/components/GroupManager";
import { signPaths, pickThumbnail, displayPath } from "@/lib/media";
import {
  canManageCreatives,
  type CreativeAsset,
  type CreativeGroup,
  type Profile,
} from "@/lib/types";

export const metadata = { title: "Groups · Own The Trend" };
export const dynamic = "force-dynamic";

type GroupRow = CreativeGroup & {
  creatives: { id: string; creative_assets: CreativeAsset[] }[];
};

export default async function GroupsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: groups }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single<Profile>(),
    supabase
      .from("creative_groups")
      .select(
        "id, name, notes, created_by, created_at, creatives ( id, creative_assets ( id, creative_id, ratio, storage_path, file_name, mime_type, file_size, kind, poster_path, created_at ) )"
      )
      .order("created_at", { ascending: false })
      .returns<GroupRow[]>(),
  ]);

  const rows = groups ?? [];

  // Up to four covers per group, so the card shows what's inside at a glance.
  const covers = new Map<string, string[]>();
  const allPaths: string[] = [];

  for (const group of rows) {
    const paths: string[] = [];
    for (const creative of group.creatives.slice(0, 4)) {
      const thumb = pickThumbnail(creative.creative_assets ?? []);
      if (thumb) paths.push(displayPath(thumb));
    }
    covers.set(group.id, paths);
    allPaths.push(...paths);
  }

  const urls = await signPaths(supabase, allPaths);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <GroupManager
        groups={rows.map((g) => ({
          id: g.id,
          name: g.name,
          notes: g.notes,
          created_at: g.created_at,
          count: g.creatives.length,
          covers: (covers.get(g.id) ?? [])
            .map((p) => urls[p])
            .filter((u): u is string => Boolean(u)),
        }))}
        canManage={canManageCreatives(profile?.role)}
      />
    </div>
  );
}
