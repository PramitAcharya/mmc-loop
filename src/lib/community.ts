import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PublicPost = Database["public"]["Views"]["public_posts"]["Row"];
export type PublicComment = Database["public"]["Views"]["public_comments"]["Row"];
export type PublicActivity = Database["public"]["Views"]["public_activities"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];

export const POST_SELECT =
  "id, title, body, category_id, category_slug, category_name, category_emoji, image_url, is_anonymous, is_demo, score, comment_count, created_at, author_id, author_username, author_avatar_url";

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchPosts(opts: {
  sort: "latest" | "trending";
  category?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<PublicPost[]> {
  let query = supabase.from("public_posts").select(POST_SELECT).limit(opts.limit ?? 30);
  if (opts.category) query = query.eq("category_slug", opts.category);
  if (opts.search && opts.search.trim()) {
    const term = opts.search.trim().replace(/[%,()]/g, " ");
    query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }
  query =
    opts.sort === "trending"
      ? query.order("score", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PublicPost[];
}

export async function fetchMyPostVotes(userId: string | null, postIds: string[]) {
  if (!userId || postIds.length === 0) return {} as Record<string, number>;
  const { data, error } = await supabase
    .from("post_votes")
    .select("post_id, value")
    .eq("user_id", userId)
    .in("post_id", postIds);
  if (error) return {};
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.post_id] = row.value;
  return map;
}

export async function fetchMyCommentVotes(userId: string | null, commentIds: string[]) {
  if (!userId || commentIds.length === 0) return {} as Record<string, number>;
  const { data, error } = await supabase
    .from("comment_votes")
    .select("comment_id, value")
    .eq("user_id", userId)
    .in("comment_id", commentIds);
  if (error) return {};
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.comment_id] = row.value;
  return map;
}
