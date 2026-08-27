"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGroup, deleteGroup } from "@/app/(app)/groups/actions";

export type GroupCard = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  count: number;
  covers: string[];
};

export function GroupManager({
  groups,
  canManage,
}: {
  groups: GroupCard[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createGroup(name, notes);
      if (result.error) return setError(result.error);
      setName("");
      setNotes("");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(group: GroupCard) {
    const message =
      group.count > 0
        ? `Delete "${group.name}"? The ${group.count} creative${
            group.count === 1 ? "" : "s"
          } inside will be kept — they just won't be grouped any more.`
        : `Delete "${group.name}"?`;

    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Launch groups</h1>
          <p className="mt-1 text-sm text-muted">
            A group is one launch — bundle the creatives that go live together
            and they stay together here.
          </p>
        </div>

        {canManage && !open && (
          <button onClick={() => setOpen(true)} className="btn btn-primary">
            New group
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="card mb-6 space-y-4 p-4">
          <div>
            <label className="label" htmlFor="group-name">
              Group name
            </label>
            <input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
              placeholder="October ring launch"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="group-notes">
              Notes <span className="text-faint">(optional)</span>
            </label>
            <textarea
              id="group-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="field resize-y"
              placeholder="Launch date, budget split, audiences…"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create group"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="btn btn-ghost"
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !open && (
        <p className="mb-4 rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <div className="max-w-sm">
            <h2 className="text-base font-medium">No groups yet</h2>
            <p className="mt-2 text-sm text-muted">
              {canManage
                ? "Make a group for the ads you plan to launch together, then pick it when you upload."
                : "Your creative lead hasn't grouped any launches yet."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="card overflow-hidden">
              <Link href={`/groups/${group.id}`} className="block">
                <div className="alpha-grid grid aspect-16/9 grid-cols-4 gap-px border-b border-border">
                  {group.covers.length === 0 ? (
                    <div className="col-span-4 grid place-items-center text-xs text-faint">
                      Empty
                    </div>
                  ) : (
                    group.covers.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{
                          gridColumn:
                            group.covers.length < 4
                              ? `span ${Math.floor(4 / group.covers.length)}`
                              : undefined,
                        }}
                        loading="lazy"
                      />
                    ))
                  )}
                </div>
              </Link>

              <div className="p-3">
                <div className="flex items-start gap-2">
                  <Link
                    href={`/groups/${group.id}`}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <p className="truncate text-[13px] font-medium">
                      {group.name}
                    </p>
                  </Link>
                  <span className="chip shrink-0">
                    {group.count} ad{group.count === 1 ? "" : "s"}
                  </span>
                </div>

                {group.notes && (
                  <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">
                    {group.notes}
                  </p>
                )}

                {canManage && (
                  <button
                    onClick={() => remove(group)}
                    disabled={pending}
                    className="mt-2 text-[11px] text-faint transition hover:text-bad"
                  >
                    Delete group
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
