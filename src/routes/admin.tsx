import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Users } from "lucide-react";
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

  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: isModerator,
    queryFn: async () => {
      const [users, posts, comments, reports, active] = await Promise.all([
        (supabase as any).from("profiles").select("id", { count: "exact", head: true }),
        (supabase as any).from("posts").select("id", { count: "exact", head: true }),
        (supabase as any).from("comments").select("id", { count: "exact", head: true }),
        (supabase as any).from("reports").select("id", { count: "exact", head: true }),
        (supabase as any)
          .from("profiles")
          .select("id")
          .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()),
      ]);

      return {
        users: users.count ?? 0,
        posts: posts.count ?? 0,
        comments: comments.count ?? 0,
        reports: reports.count ?? 0,
        newUsers: active.data?.length ?? 0,
      };
    },
  });

  const reports = useQuery({
    queryKey: ["moderation-queue"],
    enabled: isModerator,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("moderation_queue");
      if (error) throw error;
      return (data ?? []) as Array<{
        report_id: string;
        target_type: string;
        target_id: string;
        reason: string;
        status: string;
        details: string | null;
        created_at: string;
        content_title: string | null;
        content_body: string | null;
      }>;
    },
  });

  const people = useQuery({
    queryKey: ["admin-people"],
    enabled: isModerator,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, username, display_name, reputation, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        username: string;
        display_name: string | null;
        reputation: number;
        created_at: string;
      }>;
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
            ? await (supabase as any)
                .from("posts")
                .update({ status: action })
                .eq("id", targetId)
            : await (supabase as any)
                .from("comments")
                .update({ status: action })
                .eq("id", targetId);
        if (error) throw error;
      }
      const { error: rErr } = await (supabase as any)
        .from("reports")
        .update({ status: action === "dismiss" ? "dismissed" : "actioned" })
        .eq("id", reportId);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      toast.success("Report handled");
      queryClient.invalidateQueries({ queryKey: ["moderation-queue"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Secure moderation tools for the MMCLoop community.
        </p>
      </div>

      {stats.isLoading ? <ListSkeleton rows={2} /> : null}
      {stats.isError ? <ErrorState message="The dashboard could not be loaded." /> : null}

      {stats.data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Users" value={stats.data.users.toString()} icon={<Users className="h-4 w-4" />} />
          <StatCard label="New this month" value={stats.data.newUsers.toString()} icon={<ShieldCheck className="h-4 w-4" />} />
          <StatCard label="Posts" value={stats.data.posts.toString()} icon={<Badge variant="secondary">P</Badge>} />
          <StatCard label="Comments" value={stats.data.comments.toString()} icon={<Badge variant="secondary">C</Badge>} />
          <StatCard label="Open reports" value={stats.data.reports.toString()} icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="surface-panel space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Moderation queue</h2>
            <Badge variant="secondary">{reports.data?.length ?? 0} pending</Badge>
          </div>

          {reports.isLoading ? <ListSkeleton rows={3} /> : null}
          {reports.isError ? <ErrorState message="The queue could not be loaded." /> : null}
          {reports.data && reports.data.length === 0 ? (
            <EmptyState title="Nothing to review" description="No open reports right now." icon="✅" />
          ) : null}

          <ul className="space-y-3">
            {(reports.data ?? []).map((r) => (
              <li key={r.report_id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-full">
                    {r.target_type}
                  </Badge>
                  <Badge variant="outline">{r.reason}</Badge>
                  <Badge variant="outline">{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                </div>
                {r.content_title ? <p className="mt-2 font-medium">{r.content_title}</p> : null}
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{r.content_body}</p>
                {r.details ? <p className="mt-1 text-xs italic text-muted-foreground">“{r.details}”</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
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
                    Hide
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
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-panel space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent users</h2>
            <Link to="/search" className="text-xs text-primary">
              Search all
            </Link>
          </div>
          {people.isLoading ? <ListSkeleton rows={4} /> : null}
          {people.isError ? <ErrorState message="Recent users could not be loaded." /> : null}
          <ul className="space-y-2">
            {(people.data ?? []).map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{person.display_name || person.username}</p>
                  <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
                </div>
                <span className="text-xs text-muted-foreground">{person.reputation}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="surface-panel flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">{icon}</div>
    </div>
  );
}
