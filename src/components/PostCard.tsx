import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { VoteButtons } from "@/components/VoteButtons";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/mmc";
import type { PublicPost } from "@/lib/community";

export function AuthorLine({
  isAnonymous,
  username,
  createdAt,
  isDemo,
}: {
  isAnonymous: boolean;
  username: string | null;
  createdAt: string;
  isDemo?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {isAnonymous || !username ? (
        <span className="font-medium text-foreground/80">Anonymous Student</span>
      ) : (
        <Link
          to="/profile/$username"
          params={{ username }}
          className="font-medium text-foreground/80 underline-offset-2 hover:underline"
        >
          @{username}
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
  return (
    <article className="surface-panel flex gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-5">
      <div className="pt-1">
        <VoteButtons targetId={post.id!} kind="post" score={post.score ?? 0} myVote={myVote} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
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
        <Link
          to="/post/$postId"
          params={{ postId: post.id! }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          {post.comment_count ?? 0} comments
        </Link>
      </div>
    </article>
  );
}
