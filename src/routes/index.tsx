import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MessagesSquare, ShieldQuestion, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/Brand";
import { PostCard } from "@/components/PostCard";
import { ListSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { fetchPosts } from "@/lib/community";
import { DISCLAIMER } from "@/lib/mmc";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MMCLoop — Unofficial MMC Student Community" },
      {
        name: "description",
        content:
          "MMCLoop is an independent student community for Makawanpur Multiple Campus: discuss college life, ask questions, post anonymously and find students who are free.",
      },
      { property: "og:title", content: "MMCLoop — Unofficial MMC Student Community" },
      {
        property: "og:description",
        content:
          "Discuss college life, report issues anonymously, share study help and find students free for activities.",
      },
    ],
  }),
  component: Landing,
});

const HIGHLIGHTS = [
  {
    icon: MessagesSquare,
    title: "Talk about college life",
    text: "Study help, questions, memes, suggestions and everyday campus chatter in one feed.",
  },
  {
    icon: ShieldQuestion,
    title: "Speak up anonymously",
    text: "Raise issues as “Anonymous Student”. Your username is never shown on anonymous posts.",
  },
  {
    icon: CalendarClock,
    title: "Who's Free?",
    text: "Post when you're free for gaming, study, coffee or a walk, and see who else is around.",
  },
];

function Landing() {
  const preview = useQuery({
    queryKey: ["posts", "trending", null, "preview"],
    queryFn: () => fetchPosts({ sort: "trending", limit: 3 }),
  });

  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-[image:var(--gradient-hero)] px-6 py-14 text-center sm:px-10 sm:py-20">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Student-run · Unofficial
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-balance text-4xl font-bold leading-tight sm:text-5xl">
          The student loop of <Wordmark className="align-middle text-4xl sm:text-5xl" />
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          A community portal by and for Makawanpur Multiple Campus students in Hetauda — discuss,
          ask, vote, report issues anonymously and find people who are free right now.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Join the community</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/feed">Browse the feed</Link>
          </Button>
        </div>
        <p className="mx-auto mt-6 max-w-lg text-xs text-muted-foreground">{DISCLAIMER}</p>
      </section>

      <section aria-labelledby="what" className="space-y-6">
        <h2 id="what" className="text-2xl font-bold">
          What you can do here
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="surface-panel p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <h.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 font-semibold">{h.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{h.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="activity" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="activity" className="text-2xl font-bold">
            Happening now
          </h2>
          <Link to="/feed" className="text-sm font-medium text-primary hover:underline">
            See all posts
          </Link>
        </div>
        {preview.isLoading ? <ListSkeleton rows={2} /> : null}
        <div className="space-y-3">
          {(preview.data ?? []).map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </section>
    </div>
  );
}
