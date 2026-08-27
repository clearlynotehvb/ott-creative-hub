"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type AuthState = { error: string | null; message?: string | null };

const VALID_ROLES: UserRole[] = [
  "owner",
  "creative_lead",
  "graphic_designer",
  "media_buyer",
];

function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  // Only allow same-origin relative paths — never an absolute URL.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/creatives";
}

export async function signIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Those credentials didn't work. Check and try again." };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;

  if (!firstName || !lastName || !email || !password) {
    return { error: "All fields are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!VALID_ROLES.includes(role)) {
    return { error: "Pick a role." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name: firstName, last_name: lastName, role } },
  });

  if (error) {
    return { error: error.message };
  }

  // With "Confirm email" enabled in Supabase, no session comes back yet.
  if (!data.session) {
    return {
      error: null,
      message:
        "Confirm your email first, then the owner has to approve you before you can get in.",
    };
  }

  // The signup trigger decides: everyone lands as pending except the very first
  // account, which is approved so somebody can approve the rest.
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user!.id)
    .single<{ status: string }>();

  if (profile?.status !== "approved") {
    return {
      error: null,
      message:
        "The owner has to approve it before you can get in — you'll have access as soon as they do.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/creatives");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
