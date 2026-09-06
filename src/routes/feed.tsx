import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { fetchCategories, fetchMyPostVotes, fetchPosts } from "@/lib/community";
import { DISCLAIMER } from "@/lib/mmc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Community Feed — MMCLoop" },
      {
        name: "description",
        content:
          "Browse the latest and trending student posts from the unofficial MMC student community: issues, questions, study help, memes and more.",
      },
      { property: "og:title", content: "Community Feed — MMCLoop" },
      {
        property: "og:description",
        content: "Latest and trending posts from MMC students on MMCLoop.",
      },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { user } = useAuth();
  const [sort, setSort] = useState<"latest" | "trending">("latest");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const posts = useQuery({
    queryKey: ["posts", sort, category],
    queryFn: () => fetchPosts({ sort, category }),
  });
  const votes = useQuery({
    queryKey: ["my-votes", "posts", user?.id, posts.data?.map((p) => p.id).join(",")],
    enabled: !!user && !!posts.data?.length,
    queryFn: () =>
      fetchMyPostVotes(user!.id, (posts.data ?? []).map((p) => p.id!).filter(Boolean)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Community feed</h1>
          <p className="text-sm text-muted-foreground">
            Student-run conversations. {DISCLAIMER}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/create">Create post</Link>
        </Button>
      </div>

      <Tabs value={sort} onValueChange={(v) => setSort(v as "latest" | "trending")}>
        <TabsList>
          <TabsTrigger value="latest">Latest</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
        <button
          type="button"
          onClick={() => setCategory(null)}
          aria-pressed={category === null}
          className={cn(
            "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-secondary",
            category === null && "border-primary bg-primary text-primary-foreground",
          )}
        >
          All
        </button>
        {(categories.data ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.slug)}
            aria-pressed={category === c.slug}
            className={cn(
              "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-secondary",
              category === c.slug && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <span aria-hidden="true" className="mr-1">
              {c.emoji}
            </span>
            {c.name}
          </button>
        ))}
      </div>

      {posts.isLoading ? <ListSkeleton /> : null}
      {posts.isError ? <ErrorState message="The feed could not be loaded." /> : null}
      {posts.data && posts.data.length === 0 ? (
        <EmptyState
          title="No posts here yet"
          description="Be the first to start a conversation in this category."
          icon="✍️"
          action={
            <Button asChild size="sm">
              <Link to="/create">Create the first post</Link>
            </Button>
          }
        />
      ) : null}

      <div className="space-y-3">
        {(posts.data ?? []).map((post) => (
          <PostCard key={post.id} post={post} myVote={votes.data?.[post.id!] ?? 0} />
        ))}
      </div>
    </div>
  );
}
