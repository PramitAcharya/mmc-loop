import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function GetVerifiedBanner() {
  const { user, isVerifiedStudent, loading } = useAuth();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const submitRequest = useMutation({
    mutationFn: async () => {
      const msg = message.trim() || undefined;
      const { error } = await supabase.rpc("submit_verification_request", {
        ...(msg ? { _message: msg } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification request submitted! A moderator will review it.");
      setShowForm(false);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["my-verification-request"] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Could not submit request");
    },
  });

  if (loading || !user || isVerifiedStudent || dismissed) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Get Verified as an MMC Student</h3>
            <p className="text-xs text-muted-foreground">
              Verify your student status to unlock Who's Free, chat with any member, and more. You
              can already post and vote on the feed.
            </p>
          </div>

          {!showForm ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setShowForm(true)}>
                Get Verified
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/verify">Learn more</Link>
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitRequest.mutate();
              }}
              className="space-y-2"
            >
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Briefly introduce yourself (optional)..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                rows={2}
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={submitRequest.isPending}>
                  {submitRequest.isPending ? "Submitting..." : "Submit Request"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
