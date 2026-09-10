import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  CornerUpLeft,
  Megaphone,
  MessageSquareText,
  Shield,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/mmc";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton } from "@/components/States";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type NotificationType =
  "comment" | "reply" | "ticket_claim" | "verification_status" | "highlight" | "admin";

type NotificationRow = {
  id: string;
  actor_id: string | null;
  created_at: string;
  entity_id: string | null;
  entity_type: string;
  message: string | null;
  read: boolean;
  type: NotificationType;
  user_id: string;
};

const TYPE_META: Record<NotificationType, { icon: typeof Bell; label: string }> = {
  comment: { icon: MessageSquareText, label: "Comment" },
  reply: { icon: CornerUpLeft, label: "Reply" },
  ticket_claim: { icon: Users, label: "Join request" },
  verification_status: { icon: BadgeCheck, label: "Verification" },
  highlight: { icon: Megaphone, label: "Highlight" },
  admin: { icon: Shield, label: "Moderation" },
};

function notificationTitle(notification: NotificationRow): string {
  if (notification.message) return notification.message;
  switch (notification.type) {
    case "comment":
      return "Someone commented on your post";
    case "reply":
      return "Someone replied to your comment";
    case "ticket_claim":
      return "Someone wants to join your activity";
    case "verification_status":
      return "Your verification status changed";
    case "highlight":
      return "New campus highlight";
    case "admin":
      return "Moderation update";
  }
}

export function NotificationsBell() {
  const { user, isModerator } = useAuth();
  const queryClient = useQueryClient();

  const unreadQuery = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const listQuery = useQuery({
    queryKey: ["notifications-list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
          void queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-list"] });
  };

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Could not update notifications"),
  });

  const unread = unreadQuery.data ?? 0;
  const notifications = listQuery.data ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          title="Notifications"
          className="relative"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-96">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Bell className="h-4 w-4" aria-hidden="true" />
            Notifications
          </div>
          {unread > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          ) : null}
        </div>

        {listQuery.isLoading ? (
          <div className="p-3">
            <ListSkeleton rows={4} />
          </div>
        ) : null}

        {!listQuery.isLoading && !notifications.length ? (
          <div className="p-6">
            <EmptyState
              title="No notifications"
              description="Comments, replies, joins and verification updates will show up here."
              icon="🔔"
            />
          </div>
        ) : null}

        {notifications.length ? (
          <ul className="max-h-[24rem] overflow-y-auto">
            {notifications.map((notification) => {
              const meta = TYPE_META[notification.type];
              const Icon = meta.icon;
              const entityId = notification.entity_id;
              const itemClass = cn(
                "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/50",
                !notification.read && "bg-secondary/30",
              );
              const markReadOnClick = () => {
                if (!notification.read) {
                  void supabase
                    .from("notifications")
                    .update({ read: true })
                    .eq("id", notification.id)
                    .then(refresh);
                }
              };
              const content = (
                <>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {notificationTitle(notification)}
                      </span>
                      {!notification.read ? (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {meta.label} · {timeAgo(notification.created_at)}
                    </span>
                  </span>
                </>
              );
              let item: ReactNode;
              switch (notification.entity_type) {
                case "post":
                  item = entityId ? (
                    <Link
                      to="/post/$postId"
                      params={{ postId: entityId }}
                      className={itemClass}
                      onClick={markReadOnClick}
                    >
                      {content}
                    </Link>
                  ) : (
                    <Link to="/feed" className={itemClass} onClick={markReadOnClick}>
                      {content}
                    </Link>
                  );
                  break;
                case "activity":
                  item = (
                    <Link to="/activities" className={itemClass} onClick={markReadOnClick}>
                      {content}
                    </Link>
                  );
                  break;
                case "verification_request":
                  item =
                    isModerator && notification.type === "admin" ? (
                      <Link to="/admin" className={itemClass} onClick={markReadOnClick}>
                        {content}
                      </Link>
                    ) : (
                      <Link to="/verify" className={itemClass} onClick={markReadOnClick}>
                        {content}
                      </Link>
                    );
                  break;
                case "highlight":
                  item = (
                    <Link to="/highlights" className={itemClass} onClick={markReadOnClick}>
                      {content}
                    </Link>
                  );
                  break;
                default:
                  item = (
                    <div className="px-4 py-3">
                      <div className="flex items-start gap-3">{content}</div>
                    </div>
                  );
              }
              return <li key={notification.id}>{item}</li>;
            })}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
