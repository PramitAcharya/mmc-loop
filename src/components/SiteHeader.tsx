import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Home,
  Megaphone,
  MessageSquareText,
  Moon,
  PenSquare,
  Search,
  Shield,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsBell } from "@/components/Notifications";

type UnreadSummary = { unread_count: number };

type UnreadListener = () => void;
const unreadListeners = new Set<UnreadListener>();
let unreadChannel: ReturnType<typeof supabase.channel> | null = null;

function ensureUnreadChannel() {
  if (unreadChannel) return;
  unreadChannel = supabase
    .channel("chat-unread-realtime")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
      unreadListeners.forEach((notify) => notify());
    })
    .subscribe();
}

function dropUnreadChannelIfUnused() {
  if (unreadListeners.size === 0 && unreadChannel) {
    const channel = unreadChannel;
    unreadChannel = null;
    void supabase.removeChannel(channel);
  }
}

function useUnreadMessageCount(userId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    if (unreadListeners.size === 0) ensureUnreadChannel();
    const notify: UnreadListener = () => {
      queryClient.invalidateQueries({ queryKey: ["chat-unread-count", userId] });
    };
    unreadListeners.add(notify);
    return () => {
      unreadListeners.delete(notify);
      dropUnreadChannelIfUnused();
    };
  }, [userId, queryClient]);

  const { data = 0 } = useQuery<number>({
    queryKey: ["chat-unread-count", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rpcData, error } = await supabase.rpc("chat_conversation_summaries");
      if (error) throw error;
      return ((rpcData ?? []) as UnreadSummary[]).reduce(
        (sum, row) => sum + (Number(row.unread_count) || 0),
        0,
      );
    },
  });

  return { data };
}

export function SiteHeader() {
  const { user, profile, isModerator } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unreadMessages = useUnreadMessageCount(user?.id);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        <Link to="/" aria-label="MMCLoop home" className="shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          <Link
            to="/feed"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Feed
          </Link>
          <Link
            to="/activities"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Who's Free?
          </Link>
          <Link
            to="/create"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Create Post
          </Link>
          <Link
            to="/search"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Search
          </Link>
          <Link
            to="/highlights"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Megaphone className="mr-1 inline h-4 w-4" aria-hidden="true" />
            Highlights
          </Link>
          <Link
            to="/chat"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="relative rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Messages
            {unreadMessages.data && unreadMessages.data > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadMessages.data > 99 ? "99+" : unreadMessages.data}
              </span>
            ) : null}
          </Link>
          {profile?.username ? (
            <Link
              to="/profile/$username"
              params={{ username: profile.username }}
              activeProps={{ className: "bg-secondary text-secondary-foreground" }}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Profile
            </Link>
          ) : (
            <Link
              to="/auth"
              activeProps={{ className: "bg-secondary text-secondary-foreground" }}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Profile
            </Link>
          )}
          {isModerator ? (
            <Link
              to="/admin"
              activeProps={{ className: "bg-secondary text-secondary-foreground" }}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Shield className="mr-1 inline h-4 w-4" aria-hidden="true" />
              Moderation
            </Link>
          ) : null}
          <Link
            to="/help"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Help
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? <NotificationsBell /> : null}
          <ThemeToggle />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/create">
              <PenSquare className="mr-1 h-4 w-4" aria-hidden="true" />
              Create post
            </Link>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="max-w-[10rem] truncate">
                  {profile?.username ? `@${profile.username}` : "Account"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Signed in</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {profile?.username ? (
                  <DropdownMenuItem asChild>
                    <Link to="/profile/$username" params={{ username: profile.username }}>
                      My profile
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/create">Create post</Link>
                </DropdownMenuItem>
                {isModerator ? (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">Moderation</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link to="/help">Help & Contact</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const { user, profile } = useAuth();
  const unreadMessages = useUnreadMessageCount(user?.id);
  const items = [
    { to: "/feed", label: "Feed", icon: Home },
    { to: "/activities", label: "Free?", icon: CalendarClock },
    { to: "/create", label: "Post", icon: PenSquare },
    { to: "/search", label: "Search", icon: Search },
    { to: "/chat", label: "Chat", icon: MessageSquareText, unread: unreadMessages.data ?? 0 },
  ] as const;

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-[34rem] items-stretch justify-between gap-1 px-2 py-1">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <Link
              to={item.to}
              activeProps={{ className: "text-primary" }}
              className="relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
              {"unread" in item && item.unread > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                  {item.unread > 9 ? "9+" : item.unread}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
        <li className="flex-1">
          {profile?.username ? (
            <Link
              to="/profile/$username"
              params={{ username: profile.username }}
              activeProps={{ className: "text-primary" }}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <UserRound className="h-5 w-5" aria-hidden="true" />
              Profile
            </Link>
          ) : (
            <Link
              to="/auth"
              activeProps={{ className: "text-primary" }}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <UserRound className="h-5 w-5" aria-hidden="true" />
              Profile
            </Link>
          )}
        </li>
      </ul>
    </nav>
  );
}

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      {resolved === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
