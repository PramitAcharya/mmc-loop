import { Link } from "@tanstack/react-router";
import { Ellipsis, MessageSquare, Share2 } from "lucide-react";
import { toast } from "sonner";
import { VoteButtons } from "@/components/VoteButtons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReportDialog } from "@/components/ReportDialog";
import { VerificationBadge } from "@/components/VerificationBadge";
import { timeAgo } from "@/lib/mmc";
import { useAuth } from "@/lib/auth";
import type { PublicPost } from "@/lib/community";

export function AuthorLine({
  isAnonymous,
  username,
  createdAt,
  isDemo,
  isVerified,
}: {
  isAnonymous: boolean;
  username: string | null;
  createdAt: string;
  isDemo?: boolean;
  isVerified?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {isAnonymous || !username ? (
        <span className="font-medium text-foreground/80">Anonymous Student</span>
      ) : (
        <Link
          to="/profile/$username"
          params={{ username }}
          className="flex items-center gap-1 font-medium text-foreground/80 underline-offset-2 hover:underline"
        >
          @{username}
          {isVerified ? <VerificationBadge status="verified" size="sm" /> : null}
        </Link>
      )}
      <span aria-hidden="true">·</span>
      <time dateTime={createdAt}>{timeAgo(createdAt)}</time>
      {isDemo ? (
        <Badge variant="outline" className="border-accent text-accent-foreground">
          Demo content
        </Badge>
      ) : null}
    </div>
  );
}

export function PostCard({ post, myVote = 0 }: { post: PublicPost; myVote?: number }) {
  const { user } = useAuth();
  const isOwnPost =
    !!user && (post.is_owner === true || (!!post.author_id && post.author_id === user.id));

  async function handleShare() {
    const url =
      typeof window === "undefined"
        ? ""
        : new URL(`/post/${post.id}`, window.location.origin).toString();

    if (!url) {
      toast.error("Could not generate a link for this post.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy the post link");
    }
  }

  return (
    <article className="surface-panel flex gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-5">
      <div className="pt-1">
        <VoteButtons
          targetId={post.id!}
          kind="post"
          score={post.score ?? 0}
          myVote={myVote}
          disabled={isOwnPost || !!post.is_demo}
          disabledReason={
            post.is_demo
              ? "Demo content is not votable"
              : isOwnPost
                ? "You cannot vote on your own post"
                : "Sign in to vote"
          }
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full">
            <span aria-hidden="true" className="mr-1">
              {post.category_emoji}
            </span>
            {post.category_name}
          </Badge>
          <AuthorLine
            isAnonymous={!!post.is_anonymous}
            username={post.author_username}
            createdAt={post.created_at ?? new Date().toISOString()}
            isDemo={!!post.is_demo}
            isVerified={!!post.author_verified}
          />
        </div>
        <h3 className="text-base font-semibold leading-snug sm:text-lg">
          <Link
            to="/post/$postId"
            params={{ postId: post.id! }}
            className="underline-offset-4 hover:underline"
          >
            {post.title}
          </Link>
        </h3>
        {post.body ? (
          <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {post.body}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link
            to="/post/$postId"
            params={{ postId: post.id! }}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium hover:bg-secondary hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {post.comment_count ?? 0} comments
          </Link>
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium hover:bg-secondary hover:text-foreground"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share
          </button>
          <ReportDialog targetId={post.id!} targetType="post" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                <Ellipsis className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/post/$postId" params={{ postId: post.id! }}>
                  Open discussion
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleShare}>Copy link</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}
