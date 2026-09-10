import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { VerificationBadge } from "@/components/VerificationBadge";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Get Verified — MMCLoop" },
      {
        name: "description",
        content: "Request verification as an MMC student to unlock Who's Free and other features.",
      },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { user, loading, profile, isVerifiedStudent, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/verify" }, replace: true });
  }, [loading, user, navigate]);

  const [message, setMessage] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const myRequest = useQuery({
    queryKey: ["my-verification-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_requests")
        .select("id, status, mod_note, claimed_by, created_at, updated_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        status: string;
        mod_note: string | null;
        claimed_by: string | null;
        created_at: string;
        updated_at: string;
      } | null;
    },
  });

  const submitRequest = useMutation({
    mutationFn: async () => {
      const msg = message.trim() || undefined;
      const proof = proofUrl.trim() || undefined;
      const { error } = await supabase.rpc("submit_verification_request", {
        ...(msg ? { _message: msg } : {}),
        ...(proof ? { _proof_url: proof } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification request submitted");
      setMessage("");
      setProofUrl("");
      queryClient.invalidateQueries({ queryKey: ["my-verification-request"] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Could not submit request");
    },
  });

  if (loading || !user) return null;

  if (isVerifiedStudent) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="surface-panel space-y-4 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <VerificationBadge status="verified" size="lg" />
          </div>
          <h1 className="text-2xl font-bold">You're verified!</h1>
          <p className="text-sm text-muted-foreground">
            You're a verified MMC student. You have access to all features including Who's Free.
          </p>
          <Button asChild>
            <Link to="/activities">Go to Who's Free</Link>
          </Button>
        </div>
      </div>
    );
  }

  const activeRequest = myRequest.data;
  const hasActiveRequest =
    activeRequest && (activeRequest.status === "open" || activeRequest.status === "claimed");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Get Verified</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verify that you're an MMC student to unlock Who's Free and other features.
        </p>
      </div>

      {activeRequest ? (
        <div className="surface-panel space-y-4 p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Your Request</h2>
            <Badge
              variant={
                activeRequest.status === "approved"
                  ? "default"
                  : activeRequest.status === "rejected"
                    ? "destructive"
                    : "secondary"
              }
            >
              {activeRequest.status === "open" && "Waiting for a mod"}
              {activeRequest.status === "claimed" && "Being reviewed"}
              {activeRequest.status === "approved" && "Approved"}
              {activeRequest.status === "rejected" && "Rejected"}
            </Badge>
          </div>

          {activeRequest.status === "open" && (
            <p className="text-sm text-muted-foreground">
              Your request is in the queue. A moderator will pick it up and review your proof.
              You'll be contacted via the app.
            </p>
          )}

          {activeRequest.status === "claimed" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A moderator is reviewing your request. They may reach out to you for additional
                proof (student ID, enrollment letter, etc.) through a temporary private chat.
              </p>
              {activeRequest.claimed_by ? (
                <Button size="sm" asChild>
                  <Link to="/verify/chat" search={{ request: activeRequest.id }}>
                    Message the moderator
                  </Link>
                </Button>
              ) : null}
            </div>
          )}

          {activeRequest.status === "approved" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Congratulations! Your account has been verified. You now have access to all
                features.
              </p>
              <Button size="sm" onClick={() => refreshProfile()}>
                Refresh and continue
              </Button>
            </div>
          )}

          {activeRequest.status === "rejected" && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                Your request was not approved.
                {activeRequest.mod_note && ` Reason: ${activeRequest.mod_note}`}
              </p>
              <p className="text-sm text-muted-foreground">
                You can submit a new request with different proof.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["my-verification-request"] });
                }}
              >
                Submit new request
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Submitted {new Date(activeRequest.created_at).toLocaleDateString()}
            {" · "}Last updated {new Date(activeRequest.updated_at).toLocaleDateString()}
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitRequest.mutate();
          }}
          className="surface-panel space-y-5 p-6"
        >
          <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4 text-sm">
            <h3 className="font-medium">How verification works</h3>
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Submit a request below with a message about yourself</li>
              <li>A moderator will claim your ticket</li>
              <li>You'll be contacted in private chat to provide proof</li>
              <li>Acceptable proof: student ID card, enrollment letter, class schedule, etc.</li>
              <li>Once verified, you unlock Who's Free and other student features</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label htmlFor="verify-message">Why do you want to be verified? (optional)</Label>
            <Textarea
              id="verify-message"
              value={message}
              rows={3}
              maxLength={500}
              placeholder="e.g. I'm a 2nd year BBS student at MMC. I'd like to use Who's Free to find study partners."
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="verify-proof">Proof link (optional)</Label>
            <Input
              id="verify-proof"
              type="url"
              value={proofUrl}
              placeholder="Link to a photo of your student ID, enrollment letter, etc."
              onChange={(e) => setProofUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You can also share proof directly in the private chat with a moderator later.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={submitRequest.isPending}>
            {submitRequest.isPending ? "Submitting…" : "Submit verification request"}
          </Button>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Verification is for current MMC students only. Your proof is reviewed by moderators and is
        not stored permanently.
      </p>
    </div>
  );
}
