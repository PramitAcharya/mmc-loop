import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Paperclip, SendHorizonal, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sanitizeChatMessage, isValidChatMessage } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Input } from "@/components/ui/input";
import { ChatAttachment } from "@/components/ChatAttachment";
import { cn } from "@/lib/utils";

type SearchParams = { request?: string | undefined };

type VerificationMessage = {
  id: string;
  request_id: string;
  sender_id: string;
  content: string | null;
  message_type: "text" | "image" | "document" | "voice";
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
};

type VerificationRequest = {
  id: string;
  user_id: string;
  claimed_by: string | null;
  status: string;
};

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

export const Route = createFileRoute("/verify/chat")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    request:
      typeof search["request"] === "string" && search["request"].trim()
        ? search["request"].trim()
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Verification Portal — MMCLoop" },
      {
        name: "description",
        content: "Temporary private chat between an applicant and the moderator reviewing them.",
      },
    ],
  }),
  component: VerifyChatPage,
});

function sortMessages(list: VerificationMessage[]): VerificationMessage[] {
  return list.slice().sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at);
    return byTime || a.id.localeCompare(b.id);
  });
}

function mergeMessage(
  current: VerificationMessage[] = [],
  message: VerificationMessage,
  max = 5000,
): VerificationMessage[] {
  if (!current.some((item) => item.id === message.id)) {
    const merged = [...current, message];
    const sorted = sortMessages(merged);
    return sorted.length > max ? sorted.slice(-max) : sorted;
  }
  const sorted = sortMessages(current.map((item) => (item.id === message.id ? message : item)));
  return sorted.length > max ? sorted.slice(-max) : sorted;
}

function VerifyChatPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate({ from: "/verify/chat" });
  const queryClient = useQueryClient();
  const { request: requestId } = Route.useSearch();
  const [draft, setDraft] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate({
        to: "/auth",
        search: { next: requestId ? `/verify/chat?request=${requestId}` : "/verify" },
        replace: true,
      });
    }
  }, [loading, user, navigate, requestId]);

  useEffect(() => {
    if (user && !requestId) {
      navigate({ to: "/verify", replace: true });
    }
  }, [user, requestId, navigate]);

  const requestQuery = useQuery({
    queryKey: ["verification-request", requestId],
    enabled: !!user && !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_requests")
        .select("id, user_id, claimed_by, status")
        .eq("id", requestId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as VerificationRequest | null;
    },
  });

  const request = requestQuery.data;

  const otherUserId =
    request && user ? (request.user_id === user.id ? request.claimed_by : request.user_id) : null;

  const otherProfileQuery = useQuery({
    queryKey: ["verification-portal-profile", otherUserId],
    enabled: !!otherUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_profiles")
        .select("id, username, display_name")
        .eq("id", otherUserId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; username: string | null; display_name: string | null } | null;
    },
  });

  const openPortal = useMutation({
    mutationFn: async () => {
      if (!requestId) throw new Error("Missing verification request");
      const { error } = await supabase.rpc("open_verification_chat", {
        _request_id: requestId,
      });
      if (error) throw error;
      return true;
    },
    onError: (error: Error) => {
      toast.error(error.message || "Verification chat is not available.");
    },
  });

  useEffect(() => {
    if (!request || !requestId || openPortal.data || openPortal.isPending || openPortal.isError) {
      return;
    }
    const participant = request.user_id === user?.id || request.claimed_by === user?.id;
    if (participant && ["open", "claimed"].includes(request.status)) {
      void openPortal.mutateAsync().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id, request?.status, requestId, user?.id]);

  const messagesQuery = useQuery({
    queryKey: ["verification-chat-messages", requestId],
    enabled: !!user && !!requestId && !!openPortal.data && !openPortal.isError,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_verification_chat_messages", {
        _request_id: requestId!,
      });
      if (error) throw error;
      return (data ?? []) as VerificationMessage[];
    },
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!requestId || !user) throw new Error("Missing conversation");
      const content = sanitizeChatMessage(draft);
      if (!isValidChatMessage(content)) throw new Error("Please enter a message.");
      const { error } = await supabase.rpc("send_verification_chat_message", {
        _request_id: requestId,
        _content: content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["verification-chat-messages", requestId] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not send message"),
  });

  const sendAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!requestId || !user) throw new Error("Missing conversation");
      if (file.size > MAX_ATTACHMENT_SIZE) {
        throw new Error("Attachments must be 25 MB or smaller.");
      }
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!/^[a-z0-9]{2,5}$/.test(ext)) throw new Error("Unsupported file type.");
      const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: sendError } = await supabase.rpc("send_verification_chat_message", {
        _request_id: requestId,
        _attachment_url: path,
        _attachment_name: file.name,
        _attachment_type: file.type,
        _attachment_size: file.size,
      });
      if (sendError) {
        void supabase.storage.from("chat-attachments").remove([path]);
        throw sendError;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["verification-chat-messages", requestId] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not send attachment"),
  });

  useEffect(() => {
    if (!requestId || !user || openPortal.isError) return;
    let disposed = false;
    const channel = supabase
      .channel(`verification:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "verification_chat_messages",
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const message = payload.new as VerificationMessage;
          queryClient.setQueryData<VerificationMessage[]>(
            ["verification-chat-messages", requestId],
            (current = []) => mergeMessage(current, message),
          );
        },
      )
      .subscribe((status) => {
        if (
          !disposed &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
        ) {
          toast.error("Live portal disconnected. The other person's messages may be delayed.");
        }
      });
    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [requestId, user, queryClient, openPortal.isError]);

  if (loading || !user) return <ListSkeleton rows={2} />;

  const isParticipant = request && (request.user_id === user.id || request.claimed_by === user.id);
  const isClosed = request && !["open", "claimed"].includes(request.status);
  const isUnavailable = !request || !isParticipant || isClosed || openPortal.isError;

  const roleLabel =
    request && request.user_id === user.id
      ? "Applicant"
      : request && request.claimed_by === user.id
        ? "Reviewer"
        : "";

  const otherName =
    otherProfileQuery.data?.display_name || otherProfileQuery.data?.username || "Your reviewer";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Back to verification"
          >
            <Link to="/verify">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold sm:text-xl">Verification Portal</h1>
          </div>
        </div>
        {roleLabel ? (
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
            You: {roleLabel}
          </span>
        ) : null}
      </div>

      {!isUnavailable ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Temporary private chat to complete your verification. It closes automatically once your
            request is resolved.
          </span>
        </div>
      ) : null}

      {requestQuery.isLoading ? (
        <ListSkeleton rows={2} />
      ) : requestQuery.isError ? (
        <ErrorState message="This verification request could not be loaded." />
      ) : isClosed && request ? (
        <EmptyState
          title="Verification completed"
          description="Your request has been resolved, so this temporary chat has closed."
          icon="✅"
          action={
            <Button asChild size="sm">
              <Link to={request.status === "approved" ? "/verify" : "/verify"}>Back to status</Link>
            </Button>
          }
        />
      ) : isUnavailable ? (
        <EmptyState
          title="Portal unavailable"
          description="Your verification request is waiting in the queue, or this chat is not open to you yet."
          icon="🔒"
          action={
            <Button asChild size="sm">
              <Link to="/verify">Go to Get Verified</Link>
            </Button>
          }
        />
      ) : (
        <section className="surface-panel overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="font-semibold">{otherName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {otherProfileQuery.data?.username
                  ? `@${otherProfileQuery.data.username}`
                  : "Moderator / reviewer"}
              </div>
            </div>
            <Link to="/verify" className="text-xs font-medium text-primary hover:underline">
              Status
            </Link>
          </div>

          <div className="flex h-[420px] flex-col gap-3 overflow-y-auto p-4">
            {messagesQuery.isLoading ? <ListSkeleton rows={3} /> : null}
            {messagesQuery.isError ? <ErrorState message="Messages could not be loaded." /> : null}

            {!messagesQuery.isLoading && !messagesQuery.isError && !messagesQuery.data?.length ? (
              <EmptyState
                title="No messages yet"
                description="Say hi — this is where you and your reviewer exchange proof and updates."
                icon="🛡️"
              />
            ) : null}

            {(messagesQuery.data ?? []).map((message) => {
              const isOwn = message.sender_id === user.id;
              return (
                <div
                  key={message.id}
                  className={cn("flex", isOwn ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                      isOwn
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {message.message_type === "text" ? (
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    ) : (
                      <ChatAttachment message={message} />
                    )}
                    <p
                      className={cn(
                        "mt-1 text-[10px] opacity-75",
                        isOwn ? "text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (sendMessage.isPending || isClosed) return;
              void sendMessage.mutateAsync();
            }}
          >
            <input
              ref={attachmentInputRef}
              type="file"
              className="sr-only"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.csv,.ods,.odt,.mp3,.m4a,.ogg,.opus,.wav"
              aria-label="Attach a file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void sendAttachment.mutate(file);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={sendAttachment.isPending || isClosed}
              aria-label="Attach a file"
              onClick={() => attachmentInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {sendAttachment.isPending ? (
              <span className="text-xs text-muted-foreground">Uploading…</span>
            ) : null}
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a message…"
              maxLength={500}
              aria-label="Message content"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={sendMessage.isPending || !draft.trim() || isClosed}>
              <SendHorizonal className="mr-1 h-4 w-4" aria-hidden="true" />
              Send
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
