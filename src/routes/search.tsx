import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ListSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchCategories, fetchPosts } from "@/lib/community";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search posts — MMCLoop" },
      {
        name: "description",
        content:
          "Search MMCLoop student posts by keyword and filter by category: college issues, study, questions, memes and more.",
      },
      { property: "og:title", content: "Search posts — MMCLoop" },
      { property: "og:description", content: "Find posts across the MMC student community." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const results = useQuery({
    queryKey: ["posts", "search", query, category],
    enabled: query.trim().length > 0 || category !== "all",
    queryFn: () =>
      fetchPosts({
        sort: "latest",
        search: query,
        category: category === "all" ? null : category,
      }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Search MMCLoop</h1>
        <p className="text-sm text-muted-foreground">Find posts by keyword and category.</p>
      </div>

      <form
        className="surface-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term);
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="q">Keyword</Label>
          <Input
            id="q"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="library, exam routine, futsal…"
          />
        </div>
        <div className="space-y-2 sm:w-52">
          <Label htmlFor="cat">Category</Label>
          <Select value={category} onValueChange={setCategory}>
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

      {results.isLoading ? <ListSkeleton rows={2} /> : null}
      {results.data && results.data.length === 0 ? (
        <EmptyState title="No matching posts" description="Try another keyword or category." icon="🔍" />
      ) : null}
      <div className="space-y-3">
        {(results.data ?? []).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
