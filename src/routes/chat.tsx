import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, SendHorizonal, UserCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sanitizeChatMessage, isValidChatMessage } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchParams = { with?: string; conversation?: string };

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  deleted_at?: string | null;
};

type ConversationMember = {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
};

type ConversationListItem = {
  id: string;
  updated_at: string;
  unread: number;
  lastMessage: string | null;
  otherUser?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    with: typeof search.with === "string" && search.with.trim() ? search.with.trim() : undefined,
    conversation:
      typeof search.conversation === "string" && search.conversation.trim()
        ? search.conversation.trim()
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Messages — MMCLoop" },
      {
        name: "description",
        content: "Private conversations and live chat between MMCLoop members.",
      },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate({ from: "/chat" });
  const queryClient = useQueryClient();
  const { with: targetUserId, conversation: initialConversationId } = Route.useSearch();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!initialConversationId && activeConversationId) {
      navigate({ search: (prev) => ({ ...prev, conversation: activeConversationId }), replace: true });
    }
  }, [activeConversationId, initialConversationId, navigate]);

  const conversationsQuery = useQuery({
    queryKey: ["chat-conversations", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: memberships, error: membershipsError } = await (supabase as any)
        .from("conversation_members")
        .select("conversation_id, user_id, last_read_at")
        .eq("user_id", user!.id);
      if (membershipsError) throw membershipsError;

      const conversationIds = Array.from(
        new Set((memberships ?? []).map((row: ConversationMember) => row.conversation_id)),
      );
      if (!conversationIds.length) return [] as ConversationListItem[];

      const { data: conversations, error: conversationsError } = await (supabase as any)
        .from("conversations")
        .select("id, updated_at")
        .in("id", conversationIds)
        .order("updated_at", { ascending: false });
      if (conversationsError) throw conversationsError;

      const { data: allMembers, error: membersError } = await (supabase as any)
        .from("conversation_members")
        .select("conversation_id, user_id, last_read_at")
        .in("conversation_id", conversationIds);
      if (membersError) throw membersError;

      const otherUserIds = Array.from(
        new Set(
          (allMembers ?? [])
            .filter((row: ConversationMember) => row.user_id !== user!.id)
            .map((row: ConversationMember) => row.user_id),
        ),
      );

      const profiles = otherUserIds.length
        ? (
            await (supabase as any)
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .in("id", otherUserIds)
          ).data ?? []
        : [];

      const profileMap = new Map(
        profiles.map((profile: { id: string; username: string | null; display_name: string | null; avatar_url: string | null }) => [profile.id, profile]),
      );

      const { data: messages, error: messagesError } = await (supabase as any)
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at, deleted_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false });
      if (messagesError) throw messagesError;

      const messageMap = new Map<string, ChatMessage>();
      for (const message of messages ?? []) {
        if (!messageMap.has(message.conversation_id)) {
          messageMap.set(message.conversation_id, message);
        }
      }

      const result: ConversationListItem[] = (conversations ?? []).map((conversation: any) => {
        const membership = (memberships ?? []).find(
          (row: ConversationMember) => row.conversation_id === conversation.id,
        );
        const peers = (allMembers ?? []).filter(
          (row: ConversationMember) => row.conversation_id === conversation.id && row.user_id !== user!.id,
        );
        const peer = peers[0]?.user_id ? profileMap.get(peers[0].user_id) : null;
        const last = messageMap.get(conversation.id);
        const unread = (messages ?? []).filter(
          (message: ChatMessage) =>
            message.conversation_id === conversation.id &&
            message.sender_id !== user!.id &&
            (membership?.last_read_at ? new Date(message.created_at) > new Date(membership.last_read_at) : true),
        ).length;

        return {
          id: conversation.id,
          updated_at: conversation.updated_at,
          unread,
          lastMessage: last?.content ?? null,
          otherUser: peer
            ? {
                id: peer.id,
                username: peer.username,
                display_name: peer.display_name,
                avatar_url: peer.avatar_url,
              }
            : null,
        };
      });

      return result.filter((item) => !!item.otherUser || item.lastMessage);
    },
  });

  const activeConversation = useMemo(
    () => conversationsQuery.data?.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversationsQuery.data],
  );

  const messagesQuery = useQuery({
    queryKey: ["chat-messages", activeConversationId],
    enabled: !!activeConversationId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at, deleted_at")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  const ensureConversation = useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user?.id) throw new Error("auth");
      if (user.id === otherUserId) throw new Error("You cannot message yourself.");

      const { data, error } = await (supabase as any).rpc("ensure_direct_conversation", {
        _peer_id: otherUserId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      setActiveConversationId(id);
      navigate({ search: (prev) => ({ ...prev, conversation: id, with: undefined }), replace: true });
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
  });

  const markRead = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user?.id) return;
      const { error } = await (supabase as any)
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-conversations"] }),
  });

  useEffect(() => {
    if (targetUserId && targetUserId !== user?.id) {
      void ensureConversation.mutateAsync(targetUserId).catch(() => undefined);
    }
  }, [ensureConversation, targetUserId, user?.id]);

  useEffect(() => {
    if (activeConversationId && user?.id) {
      void markRead.mutateAsync(activeConversationId).catch(() => undefined);
    }
  }, [activeConversationId, markRead, user?.id]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user?.id || !activeConversationId) throw new Error("Missing conversation");
      const content = sanitizeChatMessage(draft);
      if (!isValidChatMessage(content)) throw new Error("Please enter a message.");

      const { error } = await (supabase as any).from("messages").insert({
        id: crypto.randomUUID(),
        conversation_id: activeConversationId,
        sender_id: user.id,
        content,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;

      const { error: updateError } = await (supabase as any)
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeConversationId);
      if (updateError) throw updateError;

      setDraft("");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-messages", activeConversationId] });
    },
  });

  if (loading) return <ListSkeleton rows={2} />;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState
          title="Sign in to message"
          description="You need an account before you can chat with another MMCLoop student."
          icon="🔒"
          action={
            <Button asChild size="sm">
              <Link to="/auth">Go to sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const activeMessages = messagesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:gap-4">
      <aside className="surface-panel h-fit overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquareText className="h-4 w-4" />
            Messages
          </div>
          <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
            {conversationsQuery.data?.reduce((sum, conversation) => sum + conversation.unread, 0) ?? 0}
          </span>
        </div>

        {conversationsQuery.isLoading ? (
          <div className="space-y-2 p-3">
            <ListSkeleton rows={4} />
          </div>
        ) : null}

        {conversationsQuery.isError ? (
          <div className="p-4">
            <ErrorState message="Conversations could not be loaded." />
          </div>
        ) : null}

        {!conversationsQuery.isLoading && !conversationsQuery.isError && !conversationsQuery.data?.length ? (
          <div className="p-4">
            <EmptyState
              title="No conversations yet"
              description="Start a conversation from someone’s profile."
              icon="💬"
            />
          </div>
        ) : null}

        <ul>
          {(conversationsQuery.data ?? []).map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveConversationId(conversation.id);
                  navigate({ search: (prev) => ({ ...prev, conversation: conversation.id }), replace: true });
                }}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-secondary/50",
                  activeConversationId === conversation.id && "bg-secondary/60",
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                  {(conversation.otherUser?.display_name || conversation.otherUser?.username || "U")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {conversation.otherUser?.display_name || conversation.otherUser?.username || "Student"}
                    </span>
                    {conversation.unread > 0 ? (
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {conversation.lastMessage ?? "No messages yet"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="surface-panel min-h-[540px] rounded-2xl">
        {!activeConversation ? (
          <div className="flex h-full min-h-[420px] items-center justify-center p-6">
            <EmptyState
              title="Choose a conversation"
              description="Select a person from the list to open their chat thread."
              icon="💬"
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <UserCircle2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-semibold">
                  {activeConversation.otherUser?.display_name || activeConversation.otherUser?.username || "Student"}
                </div>
                <div className="text-xs text-muted-foreground">
                  @{activeConversation.otherUser?.username ?? "student"}
                </div>
              </div>
            </div>

            <div className="flex h-[440px] flex-col gap-3 overflow-y-auto p-4">
              {messagesQuery.isLoading ? <ListSkeleton rows={3} /> : null}
              {messagesQuery.isError ? (
                <ErrorState message="Messages could not be loaded." />
              ) : null}

              {!messagesQuery.isLoading && !activeMessages.length ? (
                <EmptyState title="No messages yet" description="Say hi to start the conversation." icon="✉️" />
              ) : null}

              {activeMessages.map((message) => {
                const isOwn = message.sender_id === user.id;
                return (
                  <div
                    key={message.id}
                    className={cn("flex", isOwn ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        isOwn ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      <p className={cn("mt-1 text-[10px] opacity-75", isOwn ? "text-primary-foreground" : "text-muted-foreground")}>
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
              className="flex gap-2 border-t border-border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (sendMessage.isPending) return;
                void sendMessage.mutateAsync();
              }}
            >
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message…"
                maxLength={500}
                aria-label="Message content"
              />
              <Button type="submit" disabled={sendMessage.isPending || !draft.trim()}>
                <SendHorizonal className="mr-1 h-4 w-4" aria-hidden="true" />
                Send
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
