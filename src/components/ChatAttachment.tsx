import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export type AttachableMessage = {
  message_type: "text" | "image" | "document" | "voice";
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatAttachment({ message }: { message: AttachableMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const path = message.attachment_url;
    if (!path) {
      setFailed(true);
      return () => {
        active = false;
      };
    }
    if (/^https?:\/\//i.test(path)) {
      setUrl(path);
      return () => {
        active = false;
      };
    }
    void supabase.storage
      .from("chat-attachments")
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (active) {
          setUrl(data?.signedUrl ?? null);
          setFailed(!!error || !data?.signedUrl);
        }
      });
    return () => {
      active = false;
    };
  }, [message.attachment_url]);

  const fileName = message.attachment_name ?? "Attachment";
  const metaLabel = [
    message.attachment_size != null ? formatBytes(message.attachment_size) : null,
    message.message_type === "voice" ? "voice message" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (failed) {
    return <p className="text-xs opacity-80">Attachment unavailable.</p>;
  }

  if (message.message_type === "image") {
    if (!url) {
      return <div className="h-24 w-40 animate-pulse rounded-lg bg-secondary/60" />;
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title={fileName} className="block">
        <img src={url} alt={fileName} loading="lazy" className="max-h-72 max-w-full rounded-lg" />
      </a>
    );
  }

  if (!url) {
    return <div className="h-10 w-48 animate-pulse rounded-lg bg-secondary/60" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-full items-center gap-2 rounded-lg bg-black/10 px-3 py-2 hover:bg-black/20"
    >
      <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{fileName}</span>
        {metaLabel ? (
          <span className="block truncate text-[10px] opacity-75">{metaLabel}</span>
        ) : null}
      </span>
    </a>
  );
}
