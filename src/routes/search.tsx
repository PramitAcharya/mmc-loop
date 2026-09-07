import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchCategories, fetchPosts } from "@/lib/community";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  tab: fallback(z.string(), "all").default("all"),
  category: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Search people and posts — MMCLoop" },
      {
        name: "description",
        content:
          "Search MMCLoop for students by username or name, and find posts by keyword or category across the MMC student community.",
      },
      { property: "og:title", content: "Search people and posts — MMCLoop" },
      { property: "og:description", content: "Find students and discussions on MMCLoop." },
    ],
  }),
  component: SearchPage,
});

type PersonResult = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  reputation: number;
};

function SearchPage() {
  const { q, tab, category } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [term, setTerm] = useState(q);
  const [debounced, setDebounced] = useState(q);

  useEffect(() => setTerm(q), [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(term.trim());
      if (term.trim() !== q) {
        navigate({ search: (prev) => ({ ...prev, q: term.trim() }), replace: true });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const cleanTerm = debounced.replace(/^@+/, "").trim();
  const isHandleSearch = debounced.startsWith("@");
  const hasQuery = cleanTerm.length > 0;
  const activeCategory = category === "all" ? null : category;

  const categories = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const people = useQuery({
    queryKey: ["search", "people", cleanTerm],
    enabled: hasQuery && tab !== "posts",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_profiles", { _q: cleanTerm, _limit: 20 });
      if (error) throw error;
      return (data ?? []) as PersonResult[];
    },
  });

  const posts = useQuery({
    queryKey: ["search", "posts", cleanTerm, activeCategory],
    enabled: (hasQuery || !!activeCategory) && tab !== "people" && !isHandleSearch,
    queryFn: () =>
      fetchPosts({ sort: "latest", search: cleanTerm || null, category: activeCategory, limit: 30 }),
  });

  const showPeople = tab === "all" || tab === "people";
  const showPosts = tab === "all" || tab === "posts";
  const peopleList = people.data ?? [];
  const postList = posts.data ?? [];
  const nothing =
    hasQuery &&
    !people.isLoading &&
    !posts.isLoading &&
    (!showPeople || peopleList.length === 0) &&
    (!showPosts || postList.length === 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Search MMCLoop</h1>
        <p className="text-sm text-muted-foreground">
          Find students and posts. Start with <span className="font-medium">@</span> to look up a
          username.
        </p>
      </div>

      <form
        className="surface-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setDebounced(term.trim());
          navigate({ search: (prev) => ({ ...prev, q: term.trim() }), replace: true });
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            value={term}
            autoComplete="off"
            onChange={(e) => setTerm(e.target.value)}
            placeholder="@username, library, exam routine…"
          />
        </div>
        <div className="space-y-2 sm:w-52">
          <Label htmlFor="cat">Post category</Label>
          <Select
            value={category}
            onValueChange={(value) =>
              navigate({ search: (prev) => ({ ...prev, category: value }), replace: true })
            }
          >
            <SelectTrigger id="cat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.slug}>
                  {c.emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">Search</Button>
      </form>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ search: (prev) => ({ ...prev, tab: value }), replace: true })
        }
      >
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} forceMount className="mt-4 space-y-6">
          {!hasQuery && !activeCategory ? (
            <EmptyState
              title="Search the community"
              description="Type a name, a username with @, or a keyword from a post."
              icon="🔎"
            />
          ) : null}

          {showPeople && hasQuery ? (
            <section aria-labelledby="people-results" className="space-y-3">
              <h2 id="people-results" className="text-lg font-semibold">
                People
              </h2>
              {people.isLoading ? <ListSkeleton rows={2} /> : null}
              {people.isError ? <ErrorState message="People search failed. Try again." /> : null}
              {!people.isLoading && peopleList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students matched “{cleanTerm}”.</p>
              ) : null}
              <ul className="space-y-2">
                {peopleList.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/profile/$username"
                      params={{ username: p.username }}
                      className="surface-panel flex items-center gap-3 p-3 transition-shadow hover:shadow-[var(--shadow-lift)]"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary"
                      >
                        {p.username[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {p.display_name || p.username}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{p.username} · {p.reputation} reputation
                        </span>
                        {p.bio ? (
                          <span className="block truncate text-xs text-muted-foreground">{p.bio}</span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showPosts && (hasQuery || activeCategory) && !isHandleSearch ? (
            <section aria-labelledby="post-results" className="space-y-3">
              <h2 id="post-results" className="text-lg font-semibold">
                Posts
              </h2>
              {posts.isLoading ? <ListSkeleton rows={2} /> : null}
              {posts.isError ? <ErrorState message="Post search failed. Try again." /> : null}
              {!posts.isLoading && postList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No posts matched your search.</p>
              ) : null}
              {postList.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </section>
          ) : null}

          {nothing ? (
            <EmptyState
              title="No results"
              description="Try a shorter keyword, or check the spelling of the username."
              icon="🤔"
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
