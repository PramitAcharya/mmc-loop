import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, MessageCircle, Search, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/mmc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — MMCLoop" },
      {
        name: "description",
        content: "Moderator-only moderation, verification and campus highlights.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

interface VerificationRequest {
  id: string;
  username: string;
  display_name: string | null;
  verification_status: string;
  created_at: string;
}

interface Highlight {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  link_url: string | null;
  priority: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
}

function AdminPage() {
  const { user, isModerator, loading } = useAuth();
  const queryClient = useQueryClient();

  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: isModerator,
    queryFn: async () => {
      const [users, posts, comments, reports, active] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("status", "visible")
          .eq("is_demo", false),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("status", "visible"),
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase
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
      const { data, error } = await supabase.rpc("moderation_queue");
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, verification_status, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        username: string;
        display_name: string | null;
        verification_status: string;
        created_at: string;
      }>;
    },
  });

  const verifRequests = useQuery({
    queryKey: ["verification-tickets"],
    enabled: isModerator,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_requests")
        .select(
          "id, user_id, status, claimed_by, message, proof_url, mod_note, created_at, updated_at",
        )
        .in("status", ["open", "claimed"])
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      // Join with profiles to get usernames
      const requests = data ?? [];
      if (requests.length === 0) return [];
      const userIds = [
        ...new Set([
          ...requests.map((r) => r.user_id),
          ...requests.filter((r) => r.claimed_by).map((r) => r.claimed_by!),
        ]),
      ];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", userIds);
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return requests.map((r) => ({
        ...r,
        username: profileMap.get(r.user_id)?.username ?? "unknown",
        display_name: profileMap.get(r.user_id)?.display_name ?? null,
        claimed_by_username: r.claimed_by
          ? (profileMap.get(r.claimed_by)?.username ?? "mod")
          : null,
      }));
    },
  });

  const highlights = useQuery({
    queryKey: ["admin-highlights"],
    enabled: isModerator,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("college_highlights")
        .select(
          "id, title, description, image_url, link_url, priority, is_active, starts_at, expires_at",
        )
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Highlight[];
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
        .update({ status: action === "dismiss" ? "dismissed" : "resolved" })
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

  const verify = useMutation({
    mutationFn: async ({
      userId,
      status,
      reason,
    }: {
      userId: string;
      status: "pending" | "verified" | "rejected";
      reason?: string;
    }) => {
      const { error } = await supabase.rpc("set_verification_status", {
        _user_id: userId,
        _status: status,
        ...(reason ? { _reason: reason } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification status updated");
      queryClient.invalidateQueries({ queryKey: ["verification-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-people"] });
    },
    onError: () => toast.error("Could not update verification status"),
  });

  const claimTicket = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("claim_verification_request", {
        _request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket claimed");
      queryClient.invalidateQueries({ queryKey: ["verification-tickets"] });
    },
    onError: () => toast.error("Could not claim ticket — it may have been claimed by another mod"),
  });

  const resolveTicket = useMutation({
    mutationFn: async ({
      requestId,
      approved,
      modNote,
    }: {
      requestId: string;
      approved: boolean;
      modNote?: string;
    }) => {
      const { error } = await supabase.rpc("resolve_verification_request", {
        _request_id: requestId,
        _approved: approved,
        ...(modNote ? { _mod_note: modNote } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification resolved");
      queryClient.invalidateQueries({ queryKey: ["verification-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-people"] });
    },
    onError: () => toast.error("Could not resolve ticket"),
  });

  const createHighlight = useMutation({
    mutationFn: async (values: {
      title: string;
      description: string;
      emoji: string;
      image_url: string;
      video_url: string;
      link_url: string;
      priority: number;
    }) => {
      if (!user) throw new Error("not signed in");
      const { error } = await supabase.from("college_highlights").insert({
        title: values.title,
        description: values.description,
        emoji: values.emoji || "📢",
        image_url: values.image_url || null,
        video_url: values.video_url || null,
        link_url: values.link_url || null,
        priority: values.priority,
        is_active: true,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Highlight created");
      queryClient.invalidateQueries({ queryKey: ["admin-highlights"] });
    },
    onError: () => toast.error("Could not create highlight"),
  });

  const deleteHighlight = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("college_highlights").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Highlight deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-highlights"] });
    },
    onError: () => toast.error("Could not delete highlight"),
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
            <Link to="/auth" search={{ next: "/admin" }}>
              Sign in
            </Link>
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
          Moderation, student verification and campus highlights.
        </p>
      </div>

      {stats.data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Users"
            value={stats.data.users.toString()}
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="New this month"
            value={stats.data.newUsers.toString()}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Posts"
            value={stats.data.posts.toString()}
            icon={<Badge variant="secondary">P</Badge>}
          />
          <StatCard
            label="Comments"
            value={stats.data.comments.toString()}
            icon={<Badge variant="secondary">C</Badge>}
          />
          <StatCard
            label="Open reports"
            value={stats.data.reports.toString()}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="surface-panel space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Moderation queue</h2>
            <Badge variant="secondary">{reports.data?.length ?? 0} pending</Badge>
          </div>

          {reports.isLoading ? <ListSkeleton rows={3} /> : null}
          {reports.isError ? <ErrorState message="The queue could not be loaded." /> : null}
          {reports.data && reports.data.length === 0 ? (
            <EmptyState
              title="Nothing to review"
              description="No open reports right now."
              icon="✅"
            />
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
                {r.details ? (
                  <p className="mt-1 text-xs italic text-muted-foreground">“{r.details}”</p>
                ) : null}
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
        </section>

        <section className="surface-panel space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Verification tickets</h2>
            <Badge variant="secondary">{verifRequests.data?.length ?? 0} open</Badge>
          </div>

          {verifRequests.isLoading ? <ListSkeleton rows={3} /> : null}
          {verifRequests.isError ? <ErrorState message="Tickets could not be loaded." /> : null}
          {verifRequests.data && verifRequests.data.length === 0 ? (
            <EmptyState
              title="No open tickets"
              description="All verification requests handled."
              icon="✅"
            />
          ) : null}

          <ul className="space-y-3">
            {(verifRequests.data ?? []).map((ticket) => {
              const isClaimedByMe = ticket.claimed_by === user.id;
              const isUnclaimed = ticket.status === "open";
              return (
                <li key={ticket.id} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">
                          {ticket.display_name || ticket.username}
                        </p>
                        <Badge variant={isUnclaimed ? "secondary" : "default"}>
                          {isUnclaimed ? "Open" : `Claimed by @${ticket.claimed_by_username}`}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        @{ticket.username} · {new Date(ticket.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {ticket.message && (
                    <p className="text-sm text-muted-foreground">{ticket.message}</p>
                  )}

                  {ticket.proof_url && (
                    <a
                      href={ticket.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      View proof: {ticket.proof_url}
                    </a>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {isUnclaimed && (
                      <Button
                        size="sm"
                        disabled={claimTicket.isPending}
                        onClick={() => claimTicket.mutate(ticket.id)}
                      >
                        Claim ticket
                      </Button>
                    )}
                    {isClaimedByMe && (
                      <>
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/chat" search={{ with: ticket.user_id }}>
                            <MessageCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            Message
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          disabled={resolveTicket.isPending}
                          onClick={() =>
                            resolveTicket.mutate({
                              requestId: ticket.id,
                              approved: true,
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={resolveTicket.isPending}
                          onClick={() =>
                            resolveTicket.mutate({
                              requestId: ticket.id,
                              approved: false,
                              modNote: "Rejected by moderator",
                            })
                          }
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={claimTicket.isPending}
                          onClick={() => claimTicket.mutate(ticket.id)}
                        >
                          Unclaim
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="surface-panel space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Campus highlights</h2>
          <Badge variant="secondary">{highlights.data?.length ?? 0} total</Badge>
        </div>

        <HighlightForm
          pending={createHighlight.isPending}
          onSubmit={(values) => createHighlight.mutate(values)}
        />

        {highlights.isLoading ? <ListSkeleton rows={2} /> : null}
        {highlights.isError ? <ErrorState message="Highlights could not be loaded." /> : null}
        <ul className="space-y-2">
          {(highlights.data ?? []).map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {h.is_active ? h.title : `${h.title} (inactive)`}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  priority {h.priority}
                  {h.link_url ? ` · ${h.link_url}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteHighlight.isPending}
                onClick={() => deleteHighlight.mutate(h.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="surface-panel space-y-4 p-4">
        <UserManagement queryClient={queryClient} />
      </section>
    </div>
  );
}

function HighlightForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (values: {
    title: string;
    description: string;
    emoji: string;
    image_url: string;
    video_url: string;
    link_url: string;
    priority: number;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📢");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [priority, setPriority] = useState(0);

  const submit = () => {
    if (!title.trim() || !description.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      emoji: emoji.trim() || "📢",
      image_url: imageUrl.trim(),
      video_url: videoUrl.trim(),
      link_url: linkUrl.trim(),
      priority,
    });
    setTitle("");
    setDescription("");
    setEmoji("📢");
    setImageUrl("");
    setVideoUrl("");
    setLinkUrl("");
    setPriority(0);
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        placeholder="Emoji (e.g. 📢 🎓 🏃)"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        maxLength={4}
      />
      <Input
        placeholder="Image URL (optional)"
        type="url"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
      <Input
        placeholder="Video embed URL (YouTube/Vimeo, optional)"
        type="url"
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
      />
      <Input
        placeholder="Link URL (optional)"
        type="url"
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Input
          placeholder="Priority"
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) || 0)}
        />
        <Button type="button" onClick={submit} disabled={pending}>
          Create
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="surface-panel flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
        {icon}
      </div>
    </div>
  );
}

type UserTab = "recent" | "active" | "search";

function UserManagement({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [tab, setTab] = useState<UserTab>("recent");
  const [searchTerm, setSearchTerm] = useState("");

  const recentUsers = useQuery({
    queryKey: ["admin-people-recent"],
    enabled: tab === "recent",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, verification_status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        username: string;
        display_name: string | null;
        verification_status: string;
        created_at: string;
      }>;
    },
  });

  const activeUsers = useQuery({
    queryKey: ["admin-people-active"],
    enabled: tab === "active",
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, verification_status, created_at")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        username: string;
        display_name: string | null;
        verification_status: string;
        created_at: string;
      }>;
    },
  });

  const searchedUsers = useQuery({
    queryKey: ["admin-people-search", searchTerm],
    enabled: tab === "search" && searchTerm.trim().length >= 2,
    queryFn: async () => {
      const term = searchTerm.trim().replace(/[\\%_(),"]/g, (c) => `\\${c}`);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, verification_status, created_at")
        .or(`username.ilike."%${term}%",display_name.ilike."%${term}%"`)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        username: string;
        display_name: string | null;
        verification_status: string;
        created_at: string;
      }>;
    },
  });

  const users =
    tab === "recent" ? recentUsers.data : tab === "active" ? activeUsers.data : searchedUsers.data;

  const isLoading =
    tab === "recent"
      ? recentUsers.isLoading
      : tab === "active"
        ? activeUsers.isLoading
        : searchedUsers.isLoading;

  const isError =
    tab === "recent"
      ? recentUsers.isError
      : tab === "active"
        ? activeUsers.isError
        : searchedUsers.isError;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">User management</h2>
        <Link to="/search" className="text-xs text-primary">
          Advanced search
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            { key: "recent", label: "Recent", icon: Users },
            { key: "active", label: "Active (30d)", icon: ShieldCheck },
            { key: "search", label: "Search", icon: Search },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 shrink-0 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary",
              tab === t.key && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by username or display name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? <ListSkeleton rows={4} /> : null}
      {isError ? <ErrorState message="Users could not be loaded." /> : null}
      {!isLoading && !isError && (!users || users.length === 0) ? (
        <EmptyState
          title={tab === "search" ? "No users found" : "No users yet"}
          description={
            tab === "search"
              ? "Try a different search term."
              : "Users will appear here once they sign up."
          }
          icon="👤"
        />
      ) : null}

      <ul className="space-y-2">
        {(users ?? []).map((person) => (
          <li
            key={person.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{person.display_name || person.username}</p>
              <p className="truncate text-xs text-muted-foreground">
                @{person.username} · {person.verification_status}
                {" · "}
                {new Date(person.created_at).toLocaleDateString()}
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/chat" search={{ with: person.id }}>
                <MessageCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Message
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
