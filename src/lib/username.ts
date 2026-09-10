import { supabase } from "@/integrations/supabase/client";

export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$/;
export const USERNAME_HELP =
  "3–20 characters. Letters, numbers and underscores only, starting and ending with a letter or number.";

export function validateUsernameFormat(value: string): string | null {
  const v = value.trim();
  if (v.length < 3) return "Username must be at least 3 characters";
  if (v.length > 20) return "Username must be 20 characters or fewer";
  if (/\s/.test(v)) return "Usernames cannot contain spaces";
  if (!USERNAME_PATTERN.test(v))
    return "Use letters, numbers and underscores only, starting and ending with a letter or number";
  return null;
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("username_available", { _username: username });
  if (error) throw error;
  return Boolean(data);
}

export async function suggestUsernames(base: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("suggest_usernames", { _base: base });
  if (error) return [];
  return (data as string[] | null) ?? [];
}

export type SetUsernameResult = { ok: true } | { ok: false; message: string };

export async function claimUsername(username: string): Promise<SetUsernameResult> {
  const { error } = await supabase.rpc("set_my_username", { _username: username.trim() });
  if (!error) return { ok: true };
  const raw = error.message ?? "";
  if (raw.includes("username_taken") || raw.includes("duplicate key"))
    return { ok: false, message: "That username was just taken. Try another one." };
  if (raw.includes("username_reserved"))
    return { ok: false, message: "That username is reserved. Please pick another." };
  if (raw.includes("username_invalid") || raw.includes("profiles_username_format_chk"))
    return { ok: false, message: USERNAME_HELP };
  return { ok: false, message: "Could not save that username. Please try again." };
}
