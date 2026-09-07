import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Matches @username when not preceded by a word character (so emails stay intact).
const MENTION_RE = /(^|[^\w@])@([A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9])/g;

export function extractMentionCandidates(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    if (match[2]) found.add(match[2].toLowerCase());
  }
  return [...found].slice(0, 20);
}

export async function resolveMentions(names: string[]) {
  if (names.length === 0) return [] as { id: string; username: string }[];
  const { data, error } = await supabase.from("profiles").select("id, username").in("username", names);
  if (error) return [];
  // usernames are stored case-insensitively unique; match loosely for safety
  const lowered = new Set(names.map((n) => n.toLowerCase()));
  return (data ?? []).filter((p) => lowered.has(p.username.toLowerCase()));
}

/** Persist structured mentions for a post or comment. Failures are non-fatal. */
export async function syncMentions(
  sourceType: "post" | "comment",
  sourceId: string,
  text: string,
) {
  try {
    const users = await resolveMentions(extractMentionCandidates(text));
    if (users.length === 0) {
      await supabase.from("mentions").delete().eq("source_type", sourceType).eq("source_id", sourceId);
      return;
    }
    await supabase.from("mentions").delete().eq("source_type", sourceType).eq("source_id", sourceId);
    await supabase.from("mentions").insert(
      users.map((u) => ({
        source_type: sourceType,
        source_id: sourceId,
        mentioned_user_id: u.id,
      })),
    );
  } catch {
    /* mentions are best-effort metadata */
  }
}

/**
 * Renders plain user text, turning valid @mentions into profile links.
 * Text is rendered as React children only — no HTML is ever injected.
 */
export function MentionText({
  text,
  knownUsernames,
  className,
}: {
  text: string;
  knownUsernames?: Set<string>;
  className?: string;
}) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(MENTION_RE)) {
    const index = match.index ?? 0;
    const lead = match[1] ?? "";
    const name = match[2]!;
    const start = index + lead.length;
    nodes.push(text.slice(last, start));
    const known = !knownUsernames || knownUsernames.has(name.toLowerCase());
    if (known) {
      nodes.push(
        <Link
          key={`m-${key++}`}
          to="/profile/$username"
          params={{ username: name }}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          @{name}
        </Link>,
      );
    } else {
      nodes.push(`@${name}`);
    }
    last = start + name.length + 1;
  }
  nodes.push(text.slice(last));

  return (
    <p className={className}>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </p>
  );
}

/** Look up which mentioned usernames in a batch of texts actually exist. */
export async function fetchKnownMentions(texts: (string | null | undefined)[]) {
  const names = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const n of extractMentionCandidates(t)) names.add(n);
  }
  if (names.size === 0) return new Set<string>();
  const rows = await resolveMentions([...names]);
  return new Set(rows.map((r) => r.username.toLowerCase()));
}
