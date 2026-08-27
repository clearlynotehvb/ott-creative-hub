"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { signOut } from "@/app/auth/actions";
import { ROLE_LABEL, canManageCreatives, type Profile } from "@/lib/types";

export function TopNav({
  profile,
  pendingCount = 0,
}: {
  profile: Profile;
  pendingCount?: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const canManage = canManageCreatives(profile.role);

  const links = [
    { href: "/creatives", label: "Creatives", badge: 0 },
    { href: "/groups", label: "Groups", badge: 0 },
    ...(canManage
      ? [{ href: "/products", label: "Products", badge: 0 }]
      : []),
    ...(profile.role === "owner"
      ? [{ href: "/team", label: "Team", badge: pendingCount }]
      : []),
  ];

  const initials =
    `${profile.first_name[0] ?? ""}${profile.last_name[0] ?? ""}`.toUpperCase() ||
    "?";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link href="/creatives" className="shrink-0">
          <Logo />
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-surface-2 text-text"
                    : "text-muted hover:text-text"
                }`}
              >
                {link.label}
                {link.badge > 0 && (
                  <span
                    className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent"
                    title={`${link.badge} account${link.badge === 1 ? "" : "s"} waiting for approval`}
                  >
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-2"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-semibold text-on-accent">
              {initials}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[13px]">
                {profile.first_name} {profile.last_name}
              </span>
              <span className="block text-[11px] text-faint">
                {ROLE_LABEL[profile.role]}
              </span>
            </span>
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="card absolute right-0 z-20 mt-2 w-56 overflow-hidden p-1 shadow-xl">
                <div className="border-b border-border px-3 py-2.5">
                  <div className="truncate text-[13px]">{profile.email}</div>
                  <div className="mt-0.5 text-[11px] text-faint">
                    {ROLE_LABEL[profile.role]}
                  </div>
                </div>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-md px-3 py-2 text-left text-[13px] text-muted transition hover:bg-surface-2 hover:text-text"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
