import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
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

function ProfilePage() {
  const { username } = Route.useParams();

  const profile = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, reputation, created_at")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const posts = useQuery({
    queryKey: ["posts", "by-author", profile.data?.id],
    enabled: !!profile.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_posts")
        .select(POST_SELECT)
        .eq("author_id", profile.data!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PublicPost[];
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
          <div>
            <h1 className="text-xl font-bold">@{p.username}</h1>
            {p.display_name ? (
              <p className="text-sm text-muted-foreground">{p.display_name}</p>
            ) : null}
          </div>
          <Badge variant="secondary" className="ml-auto rounded-full">
            {p.reputation} reputation
          </Badge>
        </div>
        {p.bio ? <p className="text-sm">{p.bio}</p> : null}
        <p className="text-xs text-muted-foreground">
          Joined {new Date(p.created_at).toLocaleDateString()}
        </p>
      </header>

      <section aria-labelledby="user-posts" className="space-y-3">
        <h2 id="user-posts" className="text-lg font-semibold">
          Public posts
        </h2>
        <p className="text-xs text-muted-foreground">
          Anonymous posts never appear on a profile.
        </p>
        {posts.isLoading ? <ListSkeleton rows={2} /> : null}
        {posts.data && posts.data.length === 0 ? (
          <EmptyState title="No public posts yet" icon="📝" />
        ) : null}
        {(posts.data ?? []).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </section>
    </div>
  );
}
