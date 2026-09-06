import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/mmc";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Moderation — MMCLoop" },
      {
        name: "description",
        content: "Moderator-only review queue for reported posts and comments on MMCLoop.",
      },
      { property: "og:title", content: "Moderation — MMCLoop" },
      { property: "og:description", content: "Review reported content on MMCLoop." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isModerator, loading } = useAuth();
  const queryClient = useQueryClient();

  const reports = useQuery({
    queryKey: ["moderation-queue"],
    enabled: isModerator,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("moderation_queue");
      if (error) throw error;
      return data ?? [];
    },
  });

  const act = useMutation({
    mutationFn: async ({
      targetType,
      targetId,
      reportId,
      action,
    }: {
      targetType: string;
      targetId: string;
      reportId: string;
      action: "hidden" | "removed" | "dismiss";
    }) => {
      if (action !== "dismiss") {
        const table = targetType === "post" ? "posts" : "comments";
        const { error } =
          table === "posts"
            ? await supabase.from("posts").update({ status: action }).eq("id", targetId)
            : await supabase.from("comments").update({ status: action }).eq("id", targetId);
        if (error) throw error;
      }
      const { error: rErr } = await supabase
        .from("reports")
        .update({ status: action === "dismiss" ? "dismissed" : "actioned" })
        .eq("id", reportId);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      toast.success("Report handled");
      queryClient.invalidateQueries({ queryKey: ["moderation-queue"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: () => toast.error("Could not update this report"),
  });

  if (loading) return <ListSkeleton rows={1} />;
  if (!user)
    return (
      <EmptyState
        title="Moderators only"
        description="Sign in with a moderator account to review reports."
        icon="🔒"
        action={
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        }
      />
    );
  if (!isModerator)
    return (
      <EmptyState
        title="You don't have moderator access"
        description="This area is limited to MMCLoop community moderators."
        icon="🔒"
      />
    );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Moderation queue</h1>
        <p className="text-sm text-muted-foreground">
          Reports from students. Hiding content removes it from public views.
        </p>
      </div>

      {reports.isLoading ? <ListSkeleton /> : null}
      {reports.isError ? <ErrorState message="The queue could not be loaded." /> : null}
      {reports.data && reports.data.length === 0 ? (
        <EmptyState title="Nothing to review" description="No open reports right now." icon="✅" />
      ) : null}

      <ul className="space-y-3">
        {(reports.data ?? []).map((r) => (
          <li key={r.report_id} className="surface-panel space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {r.target_type}
              </Badge>
              <Badge variant="outline">{r.reason}</Badge>
              <Badge variant="outline">{r.status}</Badge>
              <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
            </div>
            {r.content_title ? <p className="font-semibold">{r.content_title}</p> : null}
            <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {r.content_body}
            </p>
            {r.details ? <p className="text-xs italic text-muted-foreground">“{r.details}”</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({
                    targetType: r.target_type,
                    targetId: r.target_id,
                    reportId: r.report_id,
                    action: "dismiss",
                  })
                }
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({
                    targetType: r.target_type,
                    targetId: r.target_id,
                    reportId: r.report_id,
                    action: "hidden",
                  })
                }
              >
                Hide content
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({
                    targetType: r.target_type,
                    targetId: r.target_id,
                    reportId: r.report_id,
                    action: "removed",
                  })
                }
              >
                Remove content
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
