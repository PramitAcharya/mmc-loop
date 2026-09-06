import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Props = {
  targetId: string;
  kind: "post" | "comment";
  score: number;
  myVote: number;
  orientation?: "vertical" | "horizontal";
};

export function VoteButtons({ targetId, kind, score, myVote, orientation = "vertical" }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (value: 1 | -1) => {
      if (!user) throw new Error("auth");
      const remove = myVote === value;
      if (kind === "post") {
        const { error } = remove
          ? await supabase.from("post_votes").delete().eq("post_id", targetId).eq("user_id", user.id)
          : await supabase
              .from("post_votes")
              .upsert({ post_id: targetId, user_id: user.id, value }, { onConflict: "post_id,user_id" });
        if (error) throw error;
        return;
      }
      const { error } = remove
        ? await supabase
            .from("comment_votes")
            .delete()
            .eq("comment_id", targetId)
            .eq("user_id", user.id)
        : await supabase
            .from("comment_votes")
            .upsert(
              { comment_id: targetId, user_id: user.id, value },
              { onConflict: "comment_id,user_id" },
            );
      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
      queryClient.invalidateQueries({ queryKey: ["my-votes"] });
    },
    onError: (error: Error) => {
      toast.error(error.message === "auth" ? "Sign in to vote" : "Could not save your vote");
    },
  });

  const optimisticScore = score;

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        orientation === "vertical" ? "flex-col" : "flex-row",
      )}
    >
      <button
        type="button"
        aria-label="Upvote"
        aria-pressed={myVote === 1}
        disabled={mutation.isPending}
        onClick={() => (user ? mutation.mutate(1) : toast.error("Sign in to vote"))}
        className={cn(
          "rounded-md p-1 transition-colors hover:bg-secondary disabled:opacity-50",
          myVote === 1 && "bg-secondary text-primary",
        )}
      >
        <ArrowBigUp className="h-5 w-5" aria-hidden="true" />
      </button>
      <span
        className={cn(
          "min-w-6 text-center text-sm font-semibold tabular-nums",
          myVote === 1 && "text-primary",
          myVote === -1 && "text-destructive",
        )}
      >
        {optimisticScore}
      </span>
      <button
        type="button"
        aria-label="Downvote"
        aria-pressed={myVote === -1}
        disabled={mutation.isPending}
        onClick={() => (user ? mutation.mutate(-1) : toast.error("Sign in to vote"))}
        className={cn(
          "rounded-md p-1 transition-colors hover:bg-secondary disabled:opacity-50",
          myVote === -1 && "bg-secondary text-destructive",
        )}
      >
        <ArrowBigDown className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
