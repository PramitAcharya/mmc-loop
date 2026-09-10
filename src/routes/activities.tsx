import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportDialog } from "@/components/ReportDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { ACTIVITY_TYPES, activityMeta, whenLabel } from "@/lib/mmc";
import type { PublicActivity } from "@/lib/community";
import { VoteButtons } from "@/components/VoteButtons";
import { GetVerifiedBanner } from "@/components/GetVerifiedBanner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/activities")({
  head: () => ({
    meta: [
      { title: "Who's Free? — MMCLoop" },
      {
        name: "description",
        content:
          "See which MMC students are free for gaming, study sessions, coffee, movies or a walk — and post your own availability.",
      },
      { property: "og:title", content: "Who's Free? — MMCLoop" },
      {
        property: "og:description",
        content: "Find MMC students free for study, gaming, coffee and hangouts.",
      },
    ],
  }),
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const { user, isVerifiedStudent, isModerator, loading } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const activities = useQuery({
    queryKey: ["activities", filter],
    enabled: isVerifiedStudent,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_activities", {
        ...(filter ? { _activity_type: filter } : {}),
      });
      if (error) throw error;
      return (data ?? []) as PublicActivity[];
    },
  });

  const myResponses = useQuery({
    queryKey: ["my-activity-responses", user?.id],
    enabled: !!user && isVerifiedStudent,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_responses")
        .select("activity_id")
        .eq("user_id", user!.id);
      return new Set((data ?? []).map((r) => r.activity_id));
    },
  });

  const myActivityVotes = useQuery({
    queryKey: ["my-activity-votes", user?.id],
    enabled: !!user && isVerifiedStudent,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_votes")
        .select("activity_id, value")
        .eq("user_id", user!.id);
      const map: Record<string, number> = {};
      for (const v of data ?? []) map[v.activity_id] = v.value;
      return map;
    },
  });

  const respond = useMutation({
    mutationFn: async ({ id, joined }: { id: string; joined: boolean }) => {
      if (!user) throw new Error("auth");
      const { error } = joined
        ? await supabase
            .from("activity_responses")
            .delete()
            .eq("activity_id", id)
            .eq("user_id", user.id)
        : await supabase.from("activity_responses").insert({ activity_id: id, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["my-activity-responses"] });
    },
    onError: (e: Error) =>
      toast.error(e.message === "auth" ? "Sign in to respond" : "Could not save your response"),
  });

  if (loading) return <ListSkeleton rows={2} />;

  if (!user || !isVerifiedStudent) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="surface-panel space-y-4 p-8 text-center">
          <span aria-hidden="true" className="text-4xl">
            🗓️
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Who's Free? is verified-only</h1>
            <p className="text-sm text-muted-foreground">
              See which MMC students are free for gaming, study, coffee or a walk — open to verified
              students so the circle stays trustworthy.
            </p>
          </div>
          {user ? (
            <div className="space-y-2">
              <Button asChild size="sm">
                <Link to="/verify">Verify your MMC student status</Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                A moderator will review your request and contact you privately with questions or
                next steps.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Button asChild size="sm">
                <Link to="/auth" search={{ next: "/verify" }}>
                  Sign in and get verified
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                Sign in, then verify that you're an MMC student to unlock Who's Free.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GetVerifiedBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Who's Free?</h1>
          <p className="text-sm text-muted-foreground">
            See who's around campus right now. Post when you're free.
          </p>
        </div>
      </div>

      {isVerifiedStudent && (
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="w-full rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/10"
        >
          {showForm ? "Close" : "＋ I'm free right now"}
        </button>
      )}

      {showForm && user ? <ActivityForm onDone={() => setShowForm(false)} /> : null}

      {!isVerifiedStudent && user && (
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/verify" className="text-primary hover:underline">
            Get verified
          </Link>{" "}
          to post your availability.
        </p>
      )}

      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        role="group"
        aria-label="Filter activities"
      >
        <button
          type="button"
          onClick={() => setFilter(null)}
          aria-pressed={filter === null}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
            filter === null
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
        >
          All
        </button>
        {ACTIVITY_TYPES.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setFilter(a.value)}
            aria-pressed={filter === a.value}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
              filter === a.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {a.emoji} {a.label}
          </button>
        ))}
      </div>

      {activities.isLoading ? <ListSkeleton /> : null}
      {activities.isError ? <ErrorState message="Activities could not be loaded." /> : null}
      {activities.data && activities.data.length === 0 ? (
        <EmptyState
          title="Nobody has posted yet"
          description="Be the first to say when you're free."
          icon="🕒"
        />
      ) : null}

      <ul className="space-y-3">
        {(activities.data ?? []).map((a) => (
          <ActivityCard
            key={a.id}
            activity={a}
            user={user}
            isVerifiedStudent={isVerifiedStudent}
            isModerator={isModerator}
            joined={myResponses.data?.has(a.id!) ?? false}
            myVote={myActivityVotes.data?.[a.id!] ?? 0}
            onRespond={(id: string, joined: boolean) => respond.mutate({ id, joined })}
          />
        ))}
      </ul>
    </div>
  );
}

function ActivityCard({
  activity,
  user,
  isVerifiedStudent,
  isModerator,
  joined,
  myVote,
  onRespond,
}: {
  activity: PublicActivity;
  user: { id: string } | null;
  isVerifiedStudent: boolean;
  isModerator: boolean;
  joined: boolean;
  myVote: number;
  onRespond: (id: string, joined: boolean) => void;
}) {
  const meta = activityMeta(activity.activity_type ?? "other");
  const mine = !!user && activity.creator_id === user.id;
  const canDelete = mine || isModerator;
  const [showComments, setShowComments] = useState(false);
  const queryClient = useQueryClient();

  const deleteActivity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("activities").delete().eq("id", activity.id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Activity deleted");
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: () => toast.error("Could not delete activity"),
  });

  return (
    <li className="surface-panel overflow-hidden">
      <div className="flex items-start gap-3 p-4 pb-0">
        <span aria-hidden="true" className="mt-0.5 text-2xl">
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full text-xs">
              {meta.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {activity.creator_username ? `@${activity.creator_username}` : "Student"}
            </span>
            {activity.is_demo && (
              <Badge variant="outline" className="border-accent text-xs">
                Demo
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed">{activity.message}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{activity.available_at ? whenLabel(activity.available_at) : "Anytime"}</span>
            {activity.duration_minutes ? <span>· {activity.duration_minutes} min</span> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-border px-4 py-2">
        <VoteButtons
          targetId={activity.id!}
          kind="activity"
          score={activity.score ?? 0}
          myVote={myVote}
          orientation="horizontal"
          disabled={!isVerifiedStudent}
          disabledReason={!user ? "Sign in to vote" : "Student verification required"}
        />
        <Button
          size="sm"
          variant={joined ? "secondary" : "default"}
          disabled={mine}
          onClick={() =>
            user ? onRespond(activity.id!, joined) : toast.error("Sign in to respond")
          }
          className="ml-1"
        >
          {mine ? "Your post" : joined ? "✓ Interested" : "I'm interested"}
        </Button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          💬 {activity.comment_count ?? 0}
        </button>
        {canDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive"
            disabled={deleteActivity.isPending}
            onClick={() => {
              if (window.confirm("Delete this activity?")) deleteActivity.mutate();
            }}
          >
            {mine ? "Delete" : "Remove"}
          </Button>
        ) : (
          <ReportDialog targetId={activity.id!} targetType="activity" />
        )}
      </div>

      {showComments ? (
        <div className="border-t border-border">
          <ActivityCommentSection
            activityId={activity.id!}
            user={user}
            isVerifiedStudent={isVerifiedStudent}
            isModerator={isModerator}
          />
        </div>
      ) : null}
    </li>
  );
}

function ActivityCommentSection({
  activityId,
  user,
  isVerifiedStudent,
  isModerator,
}: {
  activityId: string;
  user: { id: string } | null;
  isVerifiedStudent: boolean;
  isModerator: boolean;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const comments = useQuery({
    queryKey: ["activity-comments", activityId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_activity_comments", {
        _activity_id: activityId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const myCommentVotes = useQuery({
    queryKey: ["my-activity-comment-votes", user?.id, activityId],
    enabled: !!user && !!comments.data?.length,
    queryFn: async () => {
      const ids = (comments.data ?? []).map((c) => c.id!).filter(Boolean);
      if (ids.length === 0) return {} as Record<string, number>;
      const { data } = await supabase
        .from("comment_votes")
        .select("comment_id, value")
        .eq("user_id", user!.id)
        .in("comment_id", ids);
      const map: Record<string, number> = {};
      for (const v of data ?? []) map[v.comment_id] = v.value;
      return map;
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [comments.data?.length]);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !isVerifiedStudent) return;
    const text = body.trim();
    if (text.length < 1 || text.length > 2000) {
      toast.error("Comment must be between 1 and 2000 characters");
      return;
    }
    setPosting(true);
    const { error } = await supabase.from("activity_comments").insert({
      activity_id: activityId,
      author_user_id: user.id,
      body: text,
    });
    setPosting(false);
    if (error) {
      toast.error("Could not post comment");
      return;
    }
    setBody("");
    setReplyTo(null);
    queryClient.invalidateQueries({ queryKey: ["activity-comments", activityId] });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
  }

  const topLevel = (comments.data ?? []).filter(
    (c) => !("parent_id" in c && (c as Record<string, unknown>)["parent_id"]),
  );
  const replies = (comments.data ?? []).filter(
    (c) => "parent_id" in c && (c as Record<string, unknown>)["parent_id"],
  );

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div ref={scrollRef} className="max-h-64 space-y-2 overflow-y-auto">
        {comments.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading comments…</p>
        ) : comments.data && comments.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet</p>
        ) : (
          topLevel.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={replies.filter(
                (r) => "parent_id" in r && (r as Record<string, unknown>)["parent_id"] === c["id"],
              )}
              user={user}
              isVerifiedStudent={isVerifiedStudent}
              isModerator={isModerator}
              myVote={myCommentVotes.data?.[c.id!] ?? 0}
              activityId={activityId}
              onReply={() => setReplyTo(c.id!)}
            />
          ))
        )}
      </div>
      {user && isVerifiedStudent ? (
        <form onSubmit={postComment} className="flex gap-2">
          {replyTo && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              Replying…
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-primary hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
            maxLength={2000}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={posting || !body.trim()}>
            Post
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          {!user ? "Sign in to comment." : "Student verification required to comment."}
        </p>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  user,
  isVerifiedStudent,
  isModerator,
  myVote,
  activityId,
  onReply,
}: {
  comment: Record<string, unknown>;
  replies: Record<string, unknown>[];
  user: { id: string } | null;
  isVerifiedStudent: boolean;
  isModerator: boolean;
  myVote: number;
  activityId: string;
  onReply: () => void;
}) {
  const queryClient = useQueryClient();
  const [showReplies, setShowReplies] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const isOwner = !!user && comment["author_id"] === user.id;
  const canModerate = isOwner || isModerator;

  const voteMutation = useMutation({
    mutationFn: async (value: number) => {
      if (!user) throw new Error("auth");
      const { error } = await supabase.rpc("vote_comment", {
        _comment_id: comment["id"] as string,
        _value: value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-comments", activityId] });
      queryClient.invalidateQueries({
        queryKey: ["my-activity-comment-votes", user?.id, activityId],
      });
    },
    onError: () => toast.error("Could not save vote"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("activity_comments")
        .delete()
        .eq("id", comment["id"] as string);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comment deleted");
      queryClient.invalidateQueries({ queryKey: ["activity-comments", activityId] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: () => toast.error("Could not delete comment"),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const text = editBody.trim();
      if (text.length < 1 || text.length > 2000) throw new Error("invalid");
      const { error } = await supabase
        .from("activity_comments")
        .update({ body: text, updated_at: new Date().toISOString() })
        .eq("id", comment["id"] as string);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comment updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["activity-comments", activityId] });
    },
    onError: () => toast.error("Could not update comment"),
  });

  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2 space-y-1">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium">
          {comment["is_anonymous"]
            ? "Anonymous Student"
            : `@${comment["author_username"] ?? "student"}`}
          <span className="ml-2 font-normal text-muted-foreground">
            {comment["created_at"]
              ? new Date(comment["created_at"] as string).toLocaleDateString()
              : ""}
          </span>
        </p>
        {user && isVerifiedStudent && (
          <button
            type="button"
            onClick={onReply}
            className="ml-auto text-xs text-muted-foreground hover:text-primary"
          >
            Reply
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1">
          <textarea
            value={editBody}
            maxLength={2000}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm">{comment["body"] as string}</p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!user || !isVerifiedStudent}
            onClick={() => voteMutation.mutate(1)}
            className={`hover:text-cyan-400 ${myVote === 1 ? "text-cyan-400" : ""}`}
          >
            ▲
          </button>
          <span className={myVote === 1 ? "text-cyan-400" : myVote === -1 ? "text-blue-400" : ""}>
            {((comment["score"] as number) ?? 0) + myVote}
          </span>
          <button
            type="button"
            disabled={!user || !isVerifiedStudent}
            onClick={() => voteMutation.mutate(-1)}
            className={`hover:text-blue-400 ${myVote === -1 ? "text-blue-400" : ""}`}
          >
            ▼
          </button>
        </div>
        {replies.length > 0 && (
          <button
            type="button"
            onClick={() => setShowReplies((v) => !v)}
            className="hover:underline"
          >
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </button>
        )}
        {canModerate && !editing && (
          <>
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setEditBody(comment["body"] as string);
                }}
                className="hover:text-foreground"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this comment?")) deleteMutation.mutate();
              }}
              className="text-destructive hover:text-destructive/80"
            >
              {isModerator && !isOwner ? "Remove" : "Delete"}
            </button>
          </>
        )}
        {user && !isOwner && (
          <ReportDialog targetId={comment["id"] as string} targetType="activity_comment" />
        )}
      </div>
      {showReplies && replies.length > 0 && (
        <div className="ml-4 space-y-2 border-l border-border pl-3">
          {replies.map((r) => {
            const rIsOwner = !!user && r["author_id"] === user.id;
            return (
              <div key={r["id"] as string} className="rounded-lg bg-secondary/30 px-3 py-2">
                <p className="text-xs font-medium">
                  {r["is_anonymous"]
                    ? "Anonymous Student"
                    : `@${r["author_username"] ?? "student"}`}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {r["created_at"]
                      ? new Date(r["created_at"] as string).toLocaleDateString()
                      : ""}
                  </span>
                </p>
                <p className="mt-1 text-sm">{r["body"] as string}</p>
                {(rIsOwner || isModerator) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this reply?")) {
                        supabase
                          .from("activity_comments")
                          .delete()
                          .eq("id", r["id"] as string)
                          .then(({ error }) => {
                            if (error) toast.error("Could not delete");
                            else {
                              toast.success("Reply deleted");
                              queryClient.invalidateQueries({
                                queryKey: ["activity-comments", activityId],
                              });
                            }
                          });
                      }
                    }}
                    className="mt-1 text-xs text-destructive hover:text-destructive/80"
                  >
                    {isModerator && !rIsOwner ? "Remove" : "Delete"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivityForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("study");
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("60");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const text = message.trim();
    if (text.length < 3 || text.length > 280) {
      toast.error("Message must be between 3 and 280 characters");
      return;
    }
    if (!when) {
      toast.error("Pick when you're free");
      return;
    }
    const whenMs = new Date(when).getTime();
    if (!Number.isFinite(whenMs) || whenMs <= Date.now()) {
      toast.error("Pick a time in the future");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("activities").insert({
      creator_user_id: user.id,
      activity_type: type,
      message: text,
      available_at: new Date(whenMs).toISOString(),
      duration_minutes: duration ? Number(duration) : null,
    });
    setBusy(false);
    if (error) {
      toast.error("Could not post your availability");
      return;
    }
    toast.success("Posted — students can now see you're free");
    setMessage("");
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    onDone();
  }

  return (
    <form onSubmit={submit} className="surface-panel space-y-4 p-4">
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setType(a.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              type === a.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {a.emoji} {a.label}
          </button>
        ))}
      </div>
      <Textarea
        value={message}
        maxLength={280}
        rows={2}
        placeholder="What's up? What do you want to do?"
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="activity-when" className="text-xs">
            When
          </Label>
          <Input
            id="activity-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="activity-duration" className="text-xs">
            Duration
          </Label>
          <Input
            id="activity-duration"
            type="number"
            min={15}
            max={480}
            step={15}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-28"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}
