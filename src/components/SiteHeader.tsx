import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Home, PenSquare, Search, Shield } from "lucide-react";
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

const NAV = [
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/activities", label: "Who's Free?", icon: CalendarClock },
  { to: "/search", label: "Search", icon: Search },
] as const;

export function SiteHeader() {
  const { user, profile, isModerator } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "bg-secondary text-secondary-foreground" }}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
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
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/create">
              <PenSquare className="mr-1 h-4 w-4" aria-hidden="true" />
              Create post
            </Link>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
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
                  <Link to="/create">Create post</Link>
                </DropdownMenuItem>
                {isModerator ? (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">Moderation</Link>
                  </DropdownMenuItem>
                ) : null}
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
  const { profile } = useAuth();
  const items = [
    { to: "/feed", label: "Feed", icon: Home },
    { to: "/activities", label: "Free?", icon: CalendarClock },
    { to: "/create", label: "Post", icon: PenSquare },
    { to: "/search", label: "Search", icon: Search },
  ] as const;

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 py-1">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <Link
              to={item.to}
              activeProps={{ className: "text-primary" }}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
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
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]"
              >
                {profile.username[0]?.toUpperCase()}
              </span>
              You
            </Link>
          ) : (
            <Link
              to="/auth"
              activeProps={{ className: "text-primary" }}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]"
              >
                ?
              </span>
              Sign in
            </Link>
          )}
        </li>
      </ul>
    </nav>
  );
}
