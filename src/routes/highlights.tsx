import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Megaphone } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Highlight = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  image_url: string | null;
  video_url: string | null;
  link_url: string | null;
  priority: number;
  starts_at: string;
  expires_at: string | null;
};

export const Route = createFileRoute("/highlights")({
  head: () => ({
    meta: [
      { title: "Campus Highlights — MMCLoop" },
      {
        name: "description",
        content: "Announcements and events shared with the MMCLoop community.",
      },
    ],
  }),
  component: HighlightsPage,
});

function HighlightsPage() {
  const highlights = useQuery({
    queryKey: ["college-highlights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("college_highlights")
        .select(
          "id, title, description, emoji, image_url, video_url, link_url, priority, starts_at, expires_at",
        )
        .order("priority", { ascending: false })
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Highlight[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold sm:text-3xl">Campus Highlights</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Information shared with the MMCLoop community. This is not an official MMC channel.
        </p>
      </div>
      {highlights.isLoading ? <ListSkeleton rows={3} /> : null}
      {highlights.isError ? <ErrorState message="Highlights could not be loaded." /> : null}
      {!highlights.isLoading && !highlights.isError && !highlights.data?.length ? (
        <EmptyState
          title="No active highlights"
          description="Check back for upcoming campus information."
          icon="📢"
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(highlights.data ?? []).map((highlight) => (
          <article key={highlight.id} className="surface-panel overflow-hidden">
            {highlight.video_url ? (
              <div className="relative w-full overflow-hidden bg-black pt-[56.25%]">
                <iframe
                  src={highlight.video_url}
                  title={highlight.title}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : highlight.image_url ? (
              <img src={highlight.image_url} alt="" className="h-40 w-full object-cover" />
            ) : null}
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">
                  {highlight.emoji || "📢"}
                </span>
                <Badge variant="secondary" className="rounded-full">
                  <CalendarDays className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Campus highlight
                </Badge>
              </div>
              <h2 className="text-lg font-semibold">{highlight.title}</h2>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {highlight.description}
              </p>
              {highlight.link_url ? (
                <a
                  href={highlight.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Open details <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <Link to="/feed" className="inline-block text-sm font-medium text-primary hover:underline">
        Back to community feed
      </Link>
    </div>
  );
}
