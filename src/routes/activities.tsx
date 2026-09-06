import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { ACTIVITY_TYPES, activityMeta, whenLabel } from "@/lib/mmc";
import type { PublicActivity } from "@/lib/community";
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const activities = useQuery({
    queryKey: ["activities", filter],
    queryFn: async () => {
      let q = supabase
        .from("public_activities")
        .select(
          "id, activity_type, message, available_at, duration_minutes, response_count, is_demo, created_at, creator_id, creator_username",
        )
        .order("available_at", { ascending: true })
        .limit(50);
      if (filter) q = q.eq("activity_type", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PublicActivity[];
    },
  });

  const myResponses = useQuery({
    queryKey: ["my-activity-responses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_responses")
        .select("activity_id")
        .eq("user_id", user!.id);
      return new Set((data ?? []).map((r) => r.activity_id));
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Who's Free?</h1>
          <p className="text-sm text-muted-foreground">
            Post when you're free and see who else is around campus.
          </p>
        </div>
        {user ? (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "I'm free…"}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link to="/auth">Sign in to post</Link>
          </Button>
        )}
      </div>

      {showForm && user ? <ActivityForm onDone={() => setShowForm(false)} /> : null}

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter activities">
        <button
          type="button"
          onClick={() => setFilter(null)}
          aria-pressed={filter === null}
          className={cn(
            "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary",
            filter === null && "border-primary bg-primary text-primary-foreground",
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
              "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary",
              filter === a.value && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <span aria-hidden="true" className="mr-1">
              {a.emoji}
            </span>
            {a.label}
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

      <ul className="grid gap-3 sm:grid-cols-2">
        {(activities.data ?? []).map((a) => {
          const meta = activityMeta(a.activity_type ?? "other");
          const joined = myResponses.data?.has(a.id!) ?? false;
          const mine = !!user && a.creator_id === user.id;
          return (
            <li key={a.id} className="surface-panel space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-xl">
                  {meta.emoji}
                </span>
                <Badge variant="secondary" className="rounded-full">
                  {meta.label}
                </Badge>
                {a.is_demo ? (
                  <Badge variant="outline" className="border-accent">
                    Demo content
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed">{a.message}</p>
              <p className="text-xs text-muted-foreground">
                {a.available_at ? whenLabel(a.available_at) : "Anytime"}
                {a.duration_minutes ? ` · about ${a.duration_minutes} min` : ""}
                {" · "}
                {a.creator_username ? `@${a.creator_username}` : "Student"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={joined ? "secondary" : "default"}
                  disabled={mine || respond.isPending}
                  onClick={() =>
                    user
                      ? respond.mutate({ id: a.id!, joined })
                      : toast.error("Sign in to respond")
                  }
                >
                  {mine ? "Your post" : joined ? "Interested ✓" : "I'm interested"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {a.response_count ?? 0} interested
                </span>
              </div>
            </li>
          );
        })}
      </ul>
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
    if (text.length < 5 || text.length > 280) {
      toast.error("Message must be between 5 and 280 characters");
      return;
    }
    if (!when) {
      toast.error("Pick when you're free");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("activities").insert({
      creator_user_id: user.id,
      activity_type: type,
      message: text,
      available_at: new Date(when).toISOString(),
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
    <form onSubmit={submit} className="surface-panel grid gap-4 p-5 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="activity-type">Activity</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger id="activity-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_TYPES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.emoji} {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="activity-when">When are you free?</Label>
        <Input
          id="activity-when"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="activity-message">Short message</Label>
        <Textarea
          id="activity-message"
          value={message}
          maxLength={280}
          rows={2}
          placeholder="e.g. Free after 3pm for a stats revision session near the library."
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="activity-duration">Duration (minutes, optional)</Label>
        <Input
          id="activity-duration"
          type="number"
          min={15}
          max={480}
          step={15}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="flex items-end justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Posting…" : "Post availability"}
        </Button>
      </div>
    </form>
  );
}
