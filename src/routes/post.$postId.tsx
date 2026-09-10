import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthorLine } from "@/components/PostCard";
import { VoteButtons } from "@/components/VoteButtons";
import { ReportDialog } from "@/components/ReportDialog";
import { StorageImage } from "@/components/StorageImage";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MentionTextarea } from "@/components/MentionTextarea";
import { MentionText, fetchKnownMentions, syncMentions } from "@/lib/mentions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { POST_SELECT, fetchMyCommentVotes, type PublicComment } from "@/lib/community";

export const Route = createFileRoute("/post/$postId")({
  head: () => ({
    meta: [
      { title: "Post — MMCLoop" },
      {
        name: "description",
        content: "Read the full discussion, vote and reply on the MMCLoop student community.",
      },
      { property: "og:title", content: "Post — MMCLoop" },
      { property: "og:description", content: "A discussion on the MMCLoop student community." },
    ],
  }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const { user, isModerator } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [commentHasMore, setCommentHasMore] = useState(true);
  const [deletingPost, setDeletingPost] = useState(false);

  const post = useQuery({
    queryKey: ["post", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_posts")
        .select(POST_SELECT)
        .eq("id", postId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const comments = useQuery({
    queryKey: ["comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_comments")
        .select(
          "id, post_id, parent_id, body, is_anonymous, score, created_at, author_username, author_id, is_owner",
        )
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .range(0, 199);
      if (error) throw error;
      return (data ?? []) as PublicComment[];
    },
  });

  const loadMoreComments = useMutation({
    mutationFn: async () => {
      const offset = (comments.data ?? []).length;
      const { data, error } = await supabase
        .from("public_comments")
        .select(
          "id, post_id, parent_id, body, is_anonymous, score, created_at, author_username, author_id, is_owner",
        )
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .range(offset, offset + 199);
      if (error) throw error;
      return (data ?? []) as PublicComment[];
    },
    onSuccess: (more) => {
      queryClient.setQueryData<PublicComment[]>(["comments", postId], (current = []) => {
        const seen = new Set(current.map((comment) => comment.id));
        return [...current, ...more.filter((comment) => !seen.has(comment.id))];
      });
      setCommentHasMore(more.length === 200);
      void queryClient.invalidateQueries({ queryKey: ["known-mentions", postId] });
    },
    onError: () => toast.error("Could not load more comments"),
  });

  const myVotes = useQuery({
    queryKey: [
      "my-votes",
      "comments",
      user?.id,
      postId,
      comments.data?.map((comment) => comment.id).join(","),
    ],
    enabled: !!user && !!comments.data?.length,
    queryFn: () =>
      fetchMyCommentVotes(user!.id, (comments.data ?? []).map((c) => c.id!).filter(Boolean)),
  });

  const myPostVote = useQuery({
    queryKey: ["my-votes", "post", user?.id, postId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("post_votes")
        .select("value")
        .eq("post_id", postId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.value ?? 0;
    },
  });

  const knownMentions = useQuery({
    queryKey: ["known-mentions", postId, post.data?.body, comments.data?.length],
    enabled: !!post.data,
    queryFn: () =>
      fetchKnownMentions([post.data?.body, ...(comments.data ?? []).map((c) => c.body)]),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      const text = body.trim();
      if (text.length < 2) throw new Error("short");
      if (text.length > 2000) throw new Error("long");
      const { data, error } = await supabase
        .from("comments")
        .insert({
          post_id: postId,
          author_user_id: user.id,
          parent_id: replyTo,
          body: text,
          is_anonymous: anonymous,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (data) await syncMentions("comment", data.id, text);
    },
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      toast.success("Comment added");
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      queryClient.invalidateQueries({ queryKey: ["known-mentions", postId] });
    },
    onError: (error: Error) => {
      if (error.message === "auth") toast.error("Sign in to comment");
      else if (error.message === "short") toast.error("Write a slightly longer comment");
      else if (error.message === "long") toast.error("Comments must be under 2000 characters");
      else toast.error("Could not post your comment");
    },
  });

  const editComment = useMutation({
    mutationFn: async () => {
      if (!user || !editingComment) throw new Error("auth");
      const text = editBody.trim();
      if (text.length < 2 || text.length > 2000) throw new Error("invalid");
      const { error } = await supabase
        .from("comments")
        .update({ body: text })
        .eq("id", editingComment)
        .eq("author_user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingComment(null);
      setEditBody("");
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      toast.success("Comment updated");
    },
    onError: () => toast.error("Could not update this comment"),
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error("auth");
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("author_user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      toast.success("Comment deleted");
    },
    onError: () => toast.error("Could not delete this comment"),
  });

  async function deletePost() {
    if (deletingPost) return;
    setDeletingPost(true);
    const imagePath =
      post.data?.image_url && !/^https?:\/\//i.test(post.data.image_url)
        ? post.data.image_url
        : null;
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      setDeletingPost(false);
      toast.error("Could not delete this post");
      return;
    }
    if (imagePath) {
      void supabase.storage
        .from("post-images")
        .remove([imagePath])
        .then(({ error: rmErr }) => {
          if (rmErr) console.error("Could not remove post image", rmErr);
        });
    }
    toast.success("Post deleted");
    navigate({ to: "/feed" });
  }

  if (post.isLoading) return <ListSkeleton rows={1} />;
  if (post.isError) return <ErrorState message="This post could not be loaded." />;
  if (!post.data)
    return (
      <EmptyState
        title="Post not found"
        description="It may have been removed by its author or a moderator."
        icon="🔍"
        action={
          <Button asChild size="sm">
            <Link to="/feed">Back to feed</Link>
          </Button>
        }
      />
    );

  const p = post.data;
  const isOwner = !!user && (p.is_owner === true || p.author_id === user.id);
  const canDelete = isOwner || isModerator;
  const roots = (comments.data ?? []).filter((c) => !c.parent_id);
  const childrenOf = (id: string) => (comments.data ?? []).filter((c) => c.parent_id === id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/feed" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to feed
      </Link>

      <article className="surface-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full">
            <span aria-hidden="true" className="mr-1">
              {p.category_emoji}
            </span>
            {p.category_name}
          </Badge>
          <AuthorLine
            isAnonymous={!!p.is_anonymous}
            username={p.author_username}
            createdAt={p.created_at ?? new Date().toISOString()}
            isDemo={!!p.is_demo}
          />
        </div>

        <h1 className="text-2xl font-bold leading-tight">{p.title}</h1>
        {p.body ? (
          <MentionText
            text={p.body}
            knownUsernames={knownMentions.data}
            className="whitespace-pre-wrap break-words text-sm leading-relaxed"
          />
        ) : null}
        {p.image_url ? (
          <StorageImage
            path={p.image_url}
            alt={`Image shared with the post: ${p.title}`}
            className="max-h-96 w-full rounded-xl object-cover"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <VoteButtons
            targetId={p.id!}
            kind="post"
            score={p.score ?? 0}
            myVote={myPostVote.data ?? 0}
            orientation="horizontal"
            disabled={isOwner || !!p.is_demo}
            disabledReason={
              p.is_demo
                ? "Demo content is not votable"
                : isOwner
                  ? "You cannot vote on your own post"
                  : "Sign in to vote"
            }
          />
          <span className="text-sm text-muted-foreground">{p.comment_count ?? 0} comments</span>
          <div className="ml-auto flex items-center gap-1">
            <ReportDialog targetId={p.id!} targetType="post" />
            {canDelete ? (
              <Button variant="ghost" size="sm" onClick={deletePost} disabled={deletingPost}>
                {deletingPost ? "Deleting…" : "Delete"}
              </Button>
            ) : null}
          </div>
        </div>
      </article>

      <section aria-labelledby="comments" className="space-y-4">
        <h2 id="comments" className="text-lg font-semibold">
          Comments
        </h2>

        {user ? (
          <form
            className="surface-panel space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              addComment.mutate();
            }}
          >
            {replyTo ? (
              <p className="text-xs text-muted-foreground">
                Replying to a comment.{" "}
                <button type="button" className="underline" onClick={() => setReplyTo(null)}>
                  Cancel reply
                </button>
              </p>
            ) : null}
            <Label htmlFor="comment-body" className="sr-only">
              Your comment
            </Label>
            <MentionTextarea
              id="comment-body"
              value={body}
              rows={3}
              maxLength={2000}
              placeholder="Add to the discussion… type @ to mention someone"
              onValueChange={setBody}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="anon-comment" checked={anonymous} onCheckedChange={setAnonymous} />
                <Label htmlFor="anon-comment" className="text-sm">
                  Comment anonymously
                </Label>
              </div>
              <Button type="submit" size="sm" className="ml-auto" disabled={addComment.isPending}>
                {addComment.isPending ? "Posting…" : "Comment"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="surface-panel p-4 text-sm text-muted-foreground">
            <Link
              to="/auth"
              search={{ next: `/post/${postId}` }}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>{" "}
            to join this discussion.
          </div>
        )}

        {comments.isLoading ? <ListSkeleton rows={2} /> : null}
        {comments.data && comments.data.length === 0 ? (
          <EmptyState title="No comments yet" description="Start the conversation." icon="💬" />
        ) : null}

        <ul className="space-y-3">
          {roots.map((c) => (
            <li key={c.id} className="space-y-3">
              <CommentItem
                comment={c}
                myVote={myVotes.data?.[c.id!] ?? 0}
                knownMentions={knownMentions.data}
                onReply={() => setReplyTo(c.id!)}
                isOwner={c.is_owner === true || c.author_id === user?.id}
                canModerate={isModerator}
                editing={editingComment === c.id}
                editBody={editBody}
                onEdit={() => {
                  setEditingComment(c.id!);
                  setEditBody(c.body ?? "");
                }}
                onCancelEdit={() => setEditingComment(null)}
                onEditBody={setEditBody}
                onSaveEdit={() => editComment.mutate()}
                onDelete={() => deleteComment.mutate(c.id!)}
              />
              {childrenOf(c.id!).length ? (
                <ul className="ml-5 space-y-3 border-l border-border pl-4">
                  {childrenOf(c.id!).map((child) => (
                    <li key={child.id}>
                      <CommentItem
                        comment={child}
                        myVote={myVotes.data?.[child.id!] ?? 0}
                        knownMentions={knownMentions.data}
                        isOwner={child.is_owner === true || child.author_id === user?.id}
                        canModerate={isModerator}
                        editing={editingComment === child.id}
                        editBody={editBody}
                        onEdit={() => {
                          setEditingComment(child.id!);
                          setEditBody(child.body ?? "");
                        }}
                        onCancelEdit={() => setEditingComment(null)}
                        onEditBody={setEditBody}
                        onSaveEdit={() => editComment.mutate()}
                        onDelete={() => deleteComment.mutate(child.id!)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>

        {!comments.isLoading && comments.data && comments.data.length === 200 && commentHasMore ? (
          <div className="pt-2 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loadMoreComments.isPending}
              onClick={() => loadMoreComments.mutate()}
            >
              {loadMoreComments.isPending ? "Loading…" : "Load more comments"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CommentItem({
  comment,
  myVote,
  knownMentions,
  onReply,
  isOwner,
  canModerate,
  editing,
  editBody,
  onEdit,
  onCancelEdit,
  onEditBody,
  onSaveEdit,
  onDelete,
}: {
  comment: PublicComment;
  myVote: number;
  knownMentions?: Set<string> | undefined;
  onReply?: () => void;
  isOwner?: boolean;
  canModerate?: boolean;
  editing?: boolean;
  editBody?: string;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onEditBody?: (value: string) => void;
  onSaveEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="surface-panel space-y-2 p-4">
      <AuthorLine
        isAnonymous={!!comment.is_anonymous}
        username={comment.author_username}
        createdAt={comment.created_at ?? new Date().toISOString()}
      />
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editBody}
            maxLength={2000}
            onChange={(event) => onEditBody?.(event.target.value)}
            className="min-h-20 w-full rounded-lg border border-border bg-background p-2 text-sm"
            aria-label="Edit comment"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={onSaveEdit}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <MentionText
          text={comment.body ?? ""}
          knownUsernames={knownMentions}
          className="whitespace-pre-wrap break-words text-sm leading-relaxed"
        />
      )}
      <div className="flex items-center gap-2">
        <VoteButtons
          targetId={comment.id!}
          kind="comment"
          score={comment.score ?? 0}
          myVote={myVote}
          orientation="horizontal"
          disabled={!!isOwner}
          disabledReason={isOwner ? "You cannot vote on your own comment" : "Sign in to vote"}
        />
        {onReply ? (
          <Button variant="ghost" size="sm" onClick={onReply}>
            Reply
          </Button>
        ) : null}
        {(isOwner || canModerate) && !editing ? (
          <>
            {isOwner ? (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onDelete}>
              {canModerate && !isOwner ? "Remove" : "Delete"}
            </Button>
          </>
        ) : null}
        <div className="ml-auto">
          <ReportDialog targetId={comment.id!} targetType="comment" />
        </div>
      </div>
    </div>
  );
}
