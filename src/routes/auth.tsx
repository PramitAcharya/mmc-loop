import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DISCLAIMER } from "@/lib/mmc";
import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { recovery?: "1" | undefined; next?: string | undefined } => ({
    recovery: search["recovery"] === "1" ? "1" : undefined,
    next: typeof search["next"] === "string" && search["next"] ? search["next"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Join MMCLoop — Sign in or sign up" },
      {
        name: "description",
        content:
          "Create your MMCLoop account to post, vote, comment and find MMC students who are free right now.",
      },
      { property: "og:title", content: "Join MMCLoop" },
      { property: "og:description", content: "Sign in to the unofficial MMC student community." },
    ],
  }),
  component: AuthPage,
});

function passwordExceedsBcryptLimit(password: string): boolean {
  return new TextEncoder().encode(password).length > 72;
}

function safeNext(raw: string | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.length > 256) return null;
  return raw;
}

function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Request timed out. Check your connection and try again.")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine((value) => !passwordExceedsBcryptLimit(value), {
      message: "Password must be 72 bytes or fewer",
    }),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be under 20 characters")
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only"),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { recovery, next: nextParam } = Route.useSearch();
  const next = safeNext(nextParam);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [activeTab, setActiveTab] = useState("signin");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  function authErrorMessage(message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes("invalid login")) return "Email or password is incorrect.";
    if (normalized.includes("email not confirmed"))
      return "Please confirm your email before signing in. Check your inbox for the confirmation link.";
    if (normalized.includes("already registered"))
      return "That email is already registered. Try signing in instead.";
    if (normalized.includes("rate limit"))
      return "Too many attempts. Please wait a moment and try again.";
    if (normalized.includes("weak password"))
      return "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
    return "Authentication failed. Please try again.";
  }

  useEffect(() => {
    if (!loading && user && recovery !== "1") navigate({ to: next ?? "/feed", replace: true });
  }, [loading, user, navigate, recovery, next]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      toast.error("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
      if (error) {
        toast.error(authErrorMessage(error.message));
        return;
      }
      toast.success("Welcome back to MMCLoop");
      navigate({ to: next ?? "/feed" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const email = resetEmail.trim();
    if (!z.string().email().safeParse(email).success) {
      toast.error("Enter a valid email address");
      return;
    }

    setBusy(true);
    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?recovery=1`,
        }),
      );
      if (error) {
        toast.error(authErrorMessage(error.message));
        return;
      }
      setResetSent(true);
      toast.success("If an account exists with that email, a reset link is on its way.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not send a reset link. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (passwordExceedsBcryptLimit(newPassword)) {
      toast.error("Password must be 72 bytes or fewer");
      return;
    }
    setBusy(true);
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password: newPassword }));
      if (error) {
        toast.error(authErrorMessage(error.message));
        return;
      }
      toast.success("Password updated successfully");
      navigate({ to: "/feed" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update your password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      username: String(form.get("username") ?? "").toLowerCase(),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { username: parsed.data.username },
          },
        }),
      );
      if (error) {
        toast.error(authErrorMessage(error.message));
        return;
      }
      if (!data.session) {
        setCheckEmail(true);
        setSignupEmail(parsed.data.email);
        setResendCooldown(60);
        setResendCount(0);
        return;
      }
      toast.success("Welcome to MMCLoop");
      navigate({ to: next ?? "/feed" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create your account. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    if (resendCooldown > 0 || !signupEmail) return;
    setBusy(true);
    try {
      const { error } = await withTimeout(
        supabase.auth.resend({ type: "signup", email: signupEmail }),
      );
      if (error) {
        toast.error(authErrorMessage(error.message));
        return;
      }
      setResendCount((c) => c + 1);
      setResendCooldown(60);
      toast.success("Confirmation email sent. Check your inbox and spam folder.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not resend the email. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const redirectTo = next
      ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth`;
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        }),
      );
      if (error) {
        toast.error("Google sign-in failed. Try email instead.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed. Try email instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <Wordmark className="text-2xl" />
        <h1 className="mt-3 text-2xl font-bold">Join the student loop</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browsing is open to everyone. Posting, voting and commenting needs an account.
        </p>
      </div>

      <div className="surface-panel p-5">
        {recovery === "1" && user ? (
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose a new password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your new password below. Make it at least 8 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || newPassword.length < 8}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        ) : checkEmail ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              >
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="mt-1 text-sm text-muted-foreground">We sent a confirmation link to</p>
              <p className="mt-1 text-sm font-medium text-foreground">{signupEmail}</p>
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-4 text-left text-sm">
              <p className="font-medium">What to do next:</p>
              <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>Open the email from MMCLoop</li>
                <li>Click the confirmation link</li>
                <li>Come back here and sign in</li>
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              Didn't get it? Check your spam or junk folder.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={handleResendConfirmation}
                disabled={busy || resendCooldown > 0}
              >
                {busy
                  ? "Sending…"
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend confirmation email"}
              </Button>
              {resendCount >= 2 ? (
                <p className="text-xs text-muted-foreground">
                  Still nothing? Make sure <strong>{signupEmail}</strong> is correct and try signing
                  up again.
                </p>
              ) : null}
              <Button variant="ghost" onClick={() => setCheckEmail(false)}>
                Back to sign in
              </Button>
            </div>
          </div>
        ) : showReset && resetSent ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              >
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                If an account exists at <strong>{resetEmail}</strong>, we sent a password reset
                link.
              </p>
            </div>
            <div className="space-y-2">
              <Button variant="outline" onClick={() => setResetSent(false)} disabled={busy}>
                Send again
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowReset(false);
                  setResetSent(false);
                }}
              >
                Back to sign in
              </Button>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={showReset ? handleReset : handleSignIn} className="space-y-4">
                {showReset ? (
                  <div className="space-y-2">
                    <div>
                      <h2 className="text-lg font-semibold">Reset your password</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Enter the email you signed up with and we'll send you a reset link.
                      </p>
                    </div>
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                ) : null}
                {!showReset ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="si-email">Email</Label>
                      <Input
                        id="si-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="si-password">Password</Label>
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => {
                            setShowReset(true);
                            setResetSent(false);
                          }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <Input
                        id="si-password"
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                  </>
                ) : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy
                    ? showReset
                      ? "Sending…"
                      : "Signing in…"
                    : showReset
                      ? resetSent
                        ? "Send reset link again"
                        : "Send reset link"
                      : "Sign in"}
                </Button>
                {showReset ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowReset(false)}
                  >
                    Back to sign in
                  </Button>
                ) : null}
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="su-username">Username</Label>
                  <Input
                    id="su-username"
                    name="username"
                    required
                    placeholder="e.g. hetauda_dev"
                    aria-describedby="su-username-help"
                  />
                  <p id="su-username-help" className="text-xs text-muted-foreground">
                    Shown on your public posts. Lowercase letters, numbers, underscores.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required autoComplete="email" />
                  <p className="text-xs text-muted-foreground">
                    You'll need to confirm this email before you can post.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Password</Label>
                  <Input
                    id="su-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}

        {!checkEmail && !(showReset && resetSent) ? (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </Button>
          </>
        ) : null}
      </div>

      <p className="text-center text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
