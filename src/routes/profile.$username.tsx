import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { POST_SELECT, type PublicPost } from "@/lib/community";

export const Route = createFileRoute("/profile/$username")({
  head: () => ({
    meta: [
      { title: "Student profile — MMCLoop" },
      {
        name: "description",
        content:
          "A minimal MMCLoop student profile: public posts and community reputation. Anonymous posts are never linked to a profile.",
      },
      { property: "og:title", content: "Student profile — MMCLoop" },
      { property: "og:description", content: "Public posts and reputation on MMCLoop." },
    ],
  }),
  component: ProfilePage,
});

const PAGE_SIZE = 10;

function ProfilePage() {
  const { username } = Route.useParams();
  const { user } = useAuth();

  const profile = useQuery({
    queryKey: ["profile", username.toLowerCase()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, reputation, created_at")
        .ilike("username", username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profileId = profile.data?.id ?? null;
  const isOwner = !!user && user.id === profileId;

  // Public posts are always keyed off the stable profile id, never the username.
  const posts = useQuery({
    queryKey: ["posts", "by-author", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_posts")
        .select(POST_SELECT)
        .eq("author_id", profileId!)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE * 3);
      if (error) throw error;
      return (data ?? []) as PublicPost[];
    },
  });

  // Only the owner can read their own anonymous posts (RLS enforces this).
  const anonCount = useQuery({
    queryKey: ["posts", "my-anon-count", profileId],
    enabled: isOwner,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("author_user_id", profileId!)
        .eq("is_anonymous", true)
        .eq("status", "visible");
      if (error) return 0;
      return count ?? 0;
    },
  });

  if (profile.isLoading) return <ListSkeleton rows={1} />;
  if (profile.isError) return <ErrorState message="This profile could not be loaded." />;
  if (!profile.data)
    return <EmptyState title="Student not found" description="No profile with that username." icon="👤" />;

  const p = profile.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="surface-panel space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-primary"
          >
            {p.username[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">@{p.username}</h1>
            {p.display_name && p.display_name !== p.username ? (
              <p className="truncate text-sm text-muted-foreground">{p.display_name}</p>
            ) : null}
          </div>
          <Badge variant="secondary" className="ml-auto rounded-full">
            {p.reputation} reputation
          </Badge>
        </div>
        {p.bio ? <p className="whitespace-pre-wrap break-words text-sm">{p.bio}</p> : null}
        <p className="text-xs text-muted-foreground">
          Joined {new Date(p.created_at).toLocaleDateString()}
        </p>
        <div className="flex flex-wrap gap-2">
          {isOwner ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">Edit profile</Link>
            </Button>
          ) : null}
          {!isOwner && user ? (
            <Button asChild size="sm" variant="secondary">
              <Link to="/chat" search={{ with: p.id }}>
                Message
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="user-posts" className="space-y-3">
        <h2 id="user-posts" className="text-lg font-semibold">
          Public posts
        </h2>
        <p className="text-xs text-muted-foreground">
          Anonymous posts never appear on a profile.
          {isOwner && (anonCount.data ?? 0) > 0
            ? ` You also have ${anonCount.data} anonymous post${anonCount.data === 1 ? "" : "s"}, visible only as “Anonymous Student”.`
            : ""}
        </p>
        {posts.isLoading ? <ListSkeleton rows={2} /> : null}
        {posts.isError ? <ErrorState message="These posts could not be loaded." /> : null}
        {posts.data && posts.data.length === 0 ? (
          isOwner ? (
            <EmptyState
              title="No public posts yet"
              description="Anything you post publicly will show up here."
              icon="📝"
              action={
                <Button asChild size="sm">
                  <Link to="/create">Create a post</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState title="No public posts yet" icon="📝" />
          )
        ) : null}
        {(posts.data ?? []).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </section>
    </div>
  );
}
