import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Props = {
  targetId: string;
  kind: "post" | "comment" | "activity";
  score: number;
  myVote: number;
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  disabledReason?: string;
};

export function VoteButtons({
  targetId,
  kind,
  score,
  myVote,
  orientation = "vertical",
  disabled = false,
  disabledReason,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [optimisticVote, setOptimisticVote] = useState(myVote);
  const [optimisticDelta, setOptimisticDelta] = useState(0);
  const mutationPendingRef = useRef(false);
  const optimisticVoteRef = useRef(myVote);

  useEffect(() => {
    if (!mutationPendingRef.current) {
      setOptimisticVote(myVote);
      setOptimisticDelta(0);
      optimisticVoteRef.current = myVote;
    }
  }, [myVote]);

  const mutation = useMutation({
    mutationFn: async ({ value, remove }: { value: 1 | -1; remove: boolean }) => {
      if (!user) throw new Error("auth");
      const rpcValue = remove ? 0 : value;
      const result =
        kind === "post"
          ? await supabase.rpc("vote_post", { _post_id: targetId, _value: rpcValue })
          : kind === "activity"
            ? await supabase.rpc("vote_activity", { _activity_id: targetId, _value: rpcValue })
            : await supabase.rpc("vote_comment", { _comment_id: targetId, _value: rpcValue });
      const { data, error } = result;
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error("vote_not_saved");
      return { score: row.score, userVote: row.user_vote };
    },
    onMutate: (action) => {
      mutationPendingRef.current = true;
      const previous = optimisticVoteRef.current;
      const next = action.remove ? 0 : action.value;
      setOptimisticVote(next);
      setOptimisticDelta(next - previous);
      optimisticVoteRef.current = next;
      return { previous };
    },
    onSuccess: async (result) => {
      setOptimisticVote(result.userVote);
      setOptimisticDelta(result.score - score);
      optimisticVoteRef.current = result.userVote;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["post"] }),
        queryClient.invalidateQueries({ queryKey: ["comments"] }),
        queryClient.invalidateQueries({ queryKey: ["my-votes"] }),
        queryClient.invalidateQueries({ queryKey: ["activities"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
    },
    onError: (error: Error, _value, context) => {
      mutationPendingRef.current = false;
      const previous = context?.previous ?? myVote;
      setOptimisticVote(previous);
      optimisticVoteRef.current = previous;
      setOptimisticDelta(0);
      const message =
        error.message === "auth"
          ? "Sign in to vote"
          : error.message === "verification_required"
            ? "Verify your MMC student status to vote"
            : error.message === "self_vote_not_allowed"
              ? "You cannot vote on your own content"
              : error.message === "demo_content_untouchable"
                ? "Demo content is not votable"
                : error.message.includes("duplicate") || error.message.includes("constraint")
                  ? "That vote could not be saved. Please try again."
                  : "Could not save your vote";
      toast.error(message);
    },
    onSettled: () => {
      mutationPendingRef.current = false;
    },
  });

  const handleVote = (value: 1 | -1) => {
    if (disabled) {
      toast.error(disabledReason ?? "You cannot vote on this");
      return;
    }
    if (!user) {
      toast.error("Sign in to vote");
      return;
    }
    mutation.mutate({
      value,
      remove: optimisticVoteRef.current === value,
    });
  };

  const optimisticScore = score + optimisticDelta;
  const isUpvoted = optimisticVote === 1;
  const isDownvoted = optimisticVote === -1;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5",
        orientation === "vertical" ? "flex-col" : "flex-row",
      )}
    >
      <button
        type="button"
        aria-label={isUpvoted ? "Remove upvote" : "Upvote"}
        aria-pressed={isUpvoted}
        disabled={mutation.isPending || disabled}
        title={disabled ? (disabledReason ?? "") : isUpvoted ? "Remove upvote" : "Upvote"}
        onClick={() => handleVote(1)}
        className={cn(
          "rounded-md p-1.5 transition-all",
          "hover:bg-cyan-400/10 active:scale-95",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isUpvoted
            ? "text-cyan-400 hover:bg-cyan-400/20"
            : "text-muted-foreground hover:text-cyan-400",
        )}
      >
        <ArrowBigUp className={cn("h-6 w-6", isUpvoted && "fill-cyan-400")} aria-hidden="true" />
      </button>

      <span
        className={cn(
          "min-w-[2ch] text-center text-sm font-bold tabular-nums select-none",
          isUpvoted && "text-cyan-400",
          isDownvoted && "text-blue-500",
          !isUpvoted && !isDownvoted && "text-muted-foreground",
        )}
      >
        {optimisticScore}
      </span>

      <button
        type="button"
        aria-label={isDownvoted ? "Remove downvote" : "Downvote"}
        aria-pressed={isDownvoted}
        disabled={mutation.isPending || disabled}
        title={disabled ? (disabledReason ?? "") : isDownvoted ? "Remove downvote" : "Downvote"}
        onClick={() => handleVote(-1)}
        className={cn(
          "rounded-md p-1.5 transition-all",
          "hover:bg-blue-500/10 active:scale-95",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isDownvoted
            ? "text-blue-500 hover:bg-blue-500/20"
            : "text-muted-foreground hover:text-blue-500",
        )}
      >
        <ArrowBigDown
          className={cn("h-6 w-6", isDownvoted && "fill-blue-500")}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
