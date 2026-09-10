import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CornerUpLeft,
  MessageSquareText,
  Paperclip,
  Pencil,
  Search,
  SendHorizonal,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sanitizeChatMessage, isValidChatMessage } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/States";
import { Input } from "@/components/ui/input";
import { ChatAttachment } from "@/components/ChatAttachment";
import { cn } from "@/lib/utils";

type SearchParams = { with?: string | undefined; conversation?: string | undefined };

const MESSAGE_SELECT =
  "id, conversation_id, sender_id, content, message_type, attachment_url, attachment_name, attachment_type, attachment_size, created_at, deleted_at, parent_id, edited_at";

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: "text" | "image" | "document" | "voice";
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
  deleted_at?: string | null;
  parent_id: string | null;
  edited_at: string | null;
};

type ChatSummary = {
  conversation_id: string;
  updated_at: string;
  other_user_id: string;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
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

type ProfileSearchResult = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  reputation: number;
};

function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return list.slice().sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at);
    return byTime || a.id.localeCompare(b.id);
  });
}

function mergeMessages(
  current: ChatMessage[] = [],
  incoming: ChatMessage[],
  max = 5000,
): ChatMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const merged = [...current];
  for (const message of incoming) {
    if (!seen.has(message.id)) {
      seen.add(message.id);
      merged.push(message);
    }
  }
  const sorted = sortMessages(merged);
  return sorted.length > max ? sorted.slice(-max) : sorted;
}

function mergeMessage(
  current: ChatMessage[] = [],
  message: ChatMessage,
  max = 5000,
): ChatMessage[] {
  if (!current.some((item) => item.id === message.id))
    return mergeMessages(current, [message], max);
  const sorted = sortMessages(current.map((item) => (item.id === message.id ? message : item)));
  return sorted.length > max ? sorted.slice(-max) : sorted;
}

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    with:
      typeof search["with"] === "string" && search["with"].trim()
        ? search["with"].trim()
        : undefined,
    conversation:
      typeof search["conversation"] === "string" && search["conversation"].trim()
        ? search["conversation"].trim()
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
  const [profileSearch, setProfileSearch] = useState("");
  const [debouncedProfileSearch, setDebouncedProfileSearch] = useState("");
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const ensuredTargetRef = useRef<string | null>(null);
  const markedReadRef = useRef<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [parentMessages, setParentMessages] = useState<Record<string, ChatMessage>>({});

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedProfileSearch(profileSearch.trim().toLowerCase()),
      300,
    );
    return () => clearTimeout(timer);
  }, [profileSearch]);

  const searchTerm = debouncedProfileSearch;

  useEffect(() => {
    if (initialConversationId && initialConversationId !== activeConversationId) {
      setActiveConversationId(initialConversationId);
      return;
    }
    if (!initialConversationId && activeConversationId) {
      navigate({
        search: (prev) => ({ ...prev, conversation: activeConversationId }),
        replace: true,
      });
    }
  }, [activeConversationId, initialConversationId, navigate]);

  useEffect(() => {
    setReplyTarget(null);
    setEditingMessageId(null);
    setEditDraft("");
    setDraft("");
  }, [activeConversationId]);

  const conversationsQuery = useQuery({
    queryKey: ["chat-conversations", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("chat_conversation_summaries");
      if (error) throw error;
      return ((data ?? []) as ChatSummary[]).map((summary) => ({
        id: summary.conversation_id,
        updated_at: summary.updated_at,
        unread: summary.unread_count,
        lastMessage: summary.last_message,
        otherUser: {
          id: summary.other_user_id,
          username: summary.other_username,
          display_name: summary.other_display_name,
          avatar_url: summary.other_avatar_url,
        },
      })) as ConversationListItem[];
    },
  });

  const profileSearchQuery = useQuery({
    queryKey: ["chat-profile-search", user?.id, searchTerm],
    enabled: !!user?.id && searchTerm.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_profiles", {
        _q: searchTerm,
        _limit: 8,
      });
      if (error) throw error;
      return ((data ?? []) as ProfileSearchResult[]).filter((profile) => profile.id !== user?.id);
    },
  });

  const activeConversation = useMemo(
    () =>
      conversationsQuery.data?.find((conversation) => conversation.id === activeConversationId) ??
      null,
    [activeConversationId, conversationsQuery.data],
  );

  const messagesQuery = useQuery({
    queryKey: ["chat-messages", activeConversationId],
    enabled: !!activeConversationId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("conversation_id", activeConversationId!)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as ChatMessage[]).reverse();
    },
  });

  useEffect(() => {
    if (messagesQuery.data) setHasMoreHistory(messagesQuery.data.length === 50);
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!messagesQuery.data?.length) return;
    const missingIds = Array.from(
      new Set(
        messagesQuery.data
          .map((message) => message.parent_id)
          .filter((id): id is string => Boolean(id && !parentMessages[id])),
      ),
    );
    if (!missingIds.length) return;
    let cancelled = false;
    void supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .in("id", missingIds)
      .limit(missingIds.length)
      .then(({ data, error }) => {
        if (error || cancelled) return;
        const resolved = Object.fromEntries(
          ((data ?? []) as ChatMessage[]).map((message) => [message.id, message]),
        );
        setParentMessages((prev) => ({ ...prev, ...resolved }));
      });
    return () => {
      cancelled = true;
    };
  }, [messagesQuery.data, parentMessages]);

  const loadOlder = useMutation({
    mutationFn: async () => {
      const current =
        queryClient.getQueryData<ChatMessage[]>(["chat-messages", activeConversationId]) ?? [];
      const oldest = sortMessages(current)[0];
      if (!oldest) return [] as ChatMessage[];
      const cursorTime = encodeURIComponent(oldest.created_at);
      const cursorId = encodeURIComponent(oldest.id);
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("conversation_id", activeConversationId!)
        .or(`created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    onSuccess: (older) => {
      queryClient.setQueryData<ChatMessage[]>(
        ["chat-messages", activeConversationId],
        (current = []) => mergeMessages(current, older),
      );
      setHasMoreHistory(older.length === 50);
    },
    onError: (error: Error) => toast.error(error.message || "Could not load earlier messages"),
  });

  const updateLastRead = useCallback(
    async (conversationId: string) => {
      if (!user?.id) return;
      try {
        const { error } = await supabase
          .from("conversation_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id);
        if (error) throw error;
        void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      } catch {
        // Read status is best-effort; never surface errors for it.
      }
    },
    [queryClient, user?.id],
  );

  useEffect(() => {
    if (!activeConversationId || !user?.id) return;
    let disposed = false;
    const channel = supabase
      .channel(`chat:${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const message = payload.new as ChatMessage;
          queryClient.setQueryData<ChatMessage[]>(
            ["chat-messages", activeConversationId],
            (current = []) => mergeMessage(current, message),
          );
          void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
          void updateLastRead(activeConversationId);
        },
      )
      .subscribe((status) => {
        if (
          !disposed &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
        ) {
          toast.error("Live chat disconnected. Refresh to reconnect.");
        }
      });
    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [activeConversationId, queryClient, updateLastRead, user?.id]);

  const ensureConversation = useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user?.id) throw new Error("auth");
      if (user.id === otherUserId) throw new Error("You cannot message yourself.");

      const { data, error } = await supabase.rpc("ensure_direct_conversation", {
        _peer_id: otherUserId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      setActiveConversationId(id);
      navigate({
        search: (prev) => {
          const { with: _with, ...rest } = prev;
          return { ...rest, conversation: id };
        },
        replace: true,
      });
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not open conversation"),
  });

  useEffect(() => {
    if (targetUserId && targetUserId !== user?.id) {
      const key = `${user?.id}:${targetUserId}`;
      if (ensuredTargetRef.current === key) return;
      ensuredTargetRef.current = key;
      void ensureConversation.mutateAsync(targetUserId).catch(() => {
        ensuredTargetRef.current = null;
      });
    }
  }, [ensureConversation, targetUserId, user?.id]);

  useEffect(() => {
    if (activeConversationId && user?.id) {
      if (markedReadRef.current === activeConversationId) return;
      markedReadRef.current = activeConversationId;
      void updateLastRead(activeConversationId);
    }
  }, [activeConversationId, updateLastRead, user?.id]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user?.id || !activeConversationId) throw new Error("Missing conversation");
      const content = sanitizeChatMessage(draft);
      if (!isValidChatMessage(content)) throw new Error("Please enter a message.");
      const { data: message, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content,
          parent_id: replyTarget?.id ?? null,
        })
        .select(MESSAGE_SELECT)
        .single();
      if (error) throw error;
      return message as ChatMessage;
    },
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(
        ["chat-messages", activeConversationId],
        (current = []) => mergeMessage(current, message),
      );
      setDraft("");
      setReplyTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not send message"),
  });

  const sendAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id || !activeConversationId) throw new Error("Missing conversation");
      if (file.size > MAX_ATTACHMENT_SIZE) {
        throw new Error("Attachments must be 25 MB or smaller.");
      }
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!/^[a-z0-9]{2,5}$/.test(ext)) throw new Error("Unsupported file type.");
      const path = `${activeConversationId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const messageType = file.type.startsWith("image/") ? "image" : "document";
      const { data: message, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content: null,
          message_type: messageType,
          attachment_url: path,
          attachment_name: file.name,
          attachment_type: file.type,
          attachment_size: file.size,
        })
        .select(MESSAGE_SELECT)
        .single();
      if (insertError || !message) {
        void supabase.storage.from("chat-attachments").remove([path]);
        throw insertError ?? new Error("Could not send attachment");
      }
      return message as ChatMessage;
    },
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(
        ["chat-messages", activeConversationId],
        (current = []) => mergeMessage(current, message),
      );
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not send attachment"),
  });

  const editMessage = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      if (!user?.id) throw new Error("auth");
      const cleaned = sanitizeChatMessage(content);
      if (!isValidChatMessage(cleaned)) throw new Error("Please enter a message.");
      const { data, error } = await supabase
        .from("messages")
        .update({ content: cleaned, edited_at: new Date().toISOString() })
        .eq("id", id)
        .select(MESSAGE_SELECT)
        .single();
      if (error) throw error;
      return data as ChatMessage;
    },
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(
        ["chat-messages", activeConversationId],
        (current = []) => mergeMessage(current, message),
      );
      setEditingMessageId(null);
      setEditDraft("");
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not edit message"),
  });

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error("auth");
      const { data, error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .select(MESSAGE_SELECT)
        .single();
      if (error) throw error;
      return data as ChatMessage;
    },
    onSuccess: (message) => {
      queryClient.setQueryData<ChatMessage[]>(
        ["chat-messages", activeConversationId],
        (current = []) => mergeMessage(current, message),
      );
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete message"),
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
              <Link to="/auth" search={{ next: "/chat" }}>
                Go to sign in
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const activeMessages = messagesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:gap-4">
      <aside
        className={cn(
          "surface-panel h-fit overflow-hidden rounded-2xl",
          activeConversationId && "hidden md:block",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquareText className="h-4 w-4" />
            Messages
          </div>
          <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
            {conversationsQuery.data?.reduce((sum, conversation) => sum + conversation.unread, 0) ??
              0}
          </span>
        </div>

        <div className="border-b border-border p-3">
          <label htmlFor="chat-profile-search" className="sr-only">
            Search students to message
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="chat-profile-search"
              value={profileSearch}
              onChange={(event) => setProfileSearch(event.target.value)}
              placeholder="Search students to message"
              className="pl-9"
              maxLength={50}
            />
          </div>
          {profileSearch.trim().length === 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">Type at least 2 characters.</p>
          ) : null}
          {profileSearchQuery.isError ? (
            <p className="mt-2 text-xs text-destructive">Student search is unavailable.</p>
          ) : null}
          {profileSearchQuery.data?.length ? (
            <ul className="mt-2 space-y-1" aria-label="Students matching your search">
              {profileSearchQuery.data.map((profile) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-secondary/60"
                    disabled={ensureConversation.isPending}
                    onClick={() => {
                      setProfileSearch("");
                      ensureConversation.mutate(profile.id);
                    }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                      {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {profile.display_name || profile.username}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{profile.username}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {profileSearchQuery.data?.length === 0 && searchTerm.length >= 2 ? (
            <p className="mt-2 text-xs text-muted-foreground">No students found.</p>
          ) : null}
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

        {!conversationsQuery.isLoading &&
        !conversationsQuery.isError &&
        !conversationsQuery.data?.length ? (
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
                  navigate({
                    search: (prev) => ({ ...prev, conversation: conversation.id }),
                    replace: true,
                  });
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
                      {conversation.otherUser?.display_name ||
                        conversation.otherUser?.username ||
                        "Student"}
                    </span>
                    {conversation.unread > 0 ? (
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full bg-primary"
                        role="img"
                        aria-label={`${conversation.unread} unread message${conversation.unread === 1 ? "" : "s"}`}
                        title={`${conversation.unread} unread`}
                      />
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

      <section
        className={cn(
          "surface-panel min-h-[540px] rounded-2xl",
          !activeConversationId && "hidden md:block",
        )}
      >
        {!activeConversationId ? (
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Back to conversations"
                onClick={() => {
                  setActiveConversationId(null);
                  navigate({
                    search: (prev) => {
                      const { conversation: _conversation, ...rest } = prev;
                      return rest;
                    },
                    replace: true,
                  });
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <UserCircle2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-semibold">
                  {activeConversation?.otherUser?.display_name ||
                    activeConversation?.otherUser?.username ||
                    "Conversation"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeConversation?.otherUser?.username
                    ? `@${activeConversation.otherUser.username}`
                    : "Loading…"}
                </div>
              </div>
            </div>

            <div className="flex h-[440px] flex-col gap-3 overflow-y-auto p-4">
              {messagesQuery.isLoading ? <ListSkeleton rows={3} /> : null}
              {messagesQuery.isError ? (
                <ErrorState message="Messages could not be loaded." />
              ) : null}

              {!messagesQuery.isLoading && !activeMessages.length ? (
                <EmptyState
                  title="No messages yet"
                  description="Say hi to start the conversation."
                  icon="✉️"
                />
              ) : null}

              {activeMessages.length >= 50 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-center"
                  disabled={loadOlder.isPending || !hasMoreHistory}
                  onClick={() => loadOlder.mutate()}
                >
                  {loadOlder.isPending
                    ? "Loading…"
                    : hasMoreHistory
                      ? "Load earlier messages"
                      : "No earlier messages"}
                </Button>
              ) : null}

              {activeMessages.map((message) => {
                const isOwn = message.sender_id === user.id;
                const isDeleted = Boolean(message.deleted_at);
                const isEditing = editingMessageId === message.id;
                const parent = message.parent_id ? parentMessages[message.parent_id] : undefined;
                return (
                  <div
                    key={message.id}
                    className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}
                  >
                    {parent ? (
                      <button
                        type="button"
                        className="mb-1 flex max-w-[70%] items-center gap-1.5 rounded-lg bg-secondary/40 px-2 py-1 text-left text-xs text-muted-foreground hover:bg-secondary/70"
                        onClick={() => setReplyTarget(message)}
                      >
                        <CornerUpLeft className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {parent.deleted_at
                            ? "Deleted message"
                            : parent.message_type === "text"
                              ? parent.content
                              : parent.message_type === "voice"
                                ? "Voice message"
                                : "Attachment"}
                        </span>
                      </button>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        isOwn
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {isDeleted ? (
                        <p className="text-xs italic opacity-60">Message deleted</p>
                      ) : isEditing ? (
                        <form
                          className="flex flex-col gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!editDraft.trim() || editMessage.isPending) return;
                            void editMessage.mutateAsync({ id: message.id, content: editDraft });
                          }}
                        >
                          <textarea
                            value={editDraft}
                            onChange={(event) => setEditDraft(event.target.value)}
                            rows={2}
                            maxLength={500}
                            aria-label="Edit message"
                            className="w-full resize-none rounded-lg bg-background/20 p-2 text-sm"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button type="submit" size="sm" disabled={editMessage.isPending}>
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingMessageId(null);
                                setEditDraft("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : message.message_type === "text" ? (
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
                        {message.edited_at ? " · edited" : ""}
                        {message.deleted_at ? " · deleted" : ""}
                      </p>
                    </div>
                    {!isDeleted && !isEditing ? (
                      <div className="mt-0.5 flex items-center gap-0.5 px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          aria-label="Reply"
                          title="Reply"
                          onClick={() => setReplyTarget(message)}
                        >
                          <CornerUpLeft className="h-3.5 w-3.5" />
                        </Button>
                        {isOwn && message.message_type === "text" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            aria-label="Edit message"
                            title="Edit message"
                            onClick={() => {
                              setEditingMessageId(message.id);
                              setEditDraft(message.content ?? "");
                              setReplyTarget(null);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {isOwn ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            aria-label="Delete message"
                            title="Delete message"
                            disabled={deleteMessage.isPending}
                            onClick={() => deleteMessage.mutate(message.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {replyTarget ? (
              <div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/30 px-4 py-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  Replying to{" "}
                  <span className="font-medium text-foreground">
                    {replyTarget.deleted_at
                      ? "a deleted message"
                      : replyTarget.message_type === "text"
                        ? replyTarget.content
                        : replyTarget.message_type === "voice"
                          ? "a voice message"
                          : "an attachment"}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={() => setReplyTarget(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : null}

            <form
              className="flex items-center gap-2 border-t border-border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (sendMessage.isPending) return;
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
                disabled={sendAttachment.isPending}
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
