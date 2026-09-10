import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_TTL_MS = 50 * 60 * 1000;

type CachedUrl = { url: string; expiresAt: number };

const signedUrlCache = new Map<string, CachedUrl>();
const inFlight = new Map<string, Promise<string | null>>();

function getSignedUrl(path: string): Promise<string | null> {
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.url);
  const pending = inFlight.get(path);
  if (pending) return pending;
  const promise = supabase.storage
    .from("post-images")
    .createSignedUrl(path, 3600)
    .then(({ data, error }) => {
      const url = data?.signedUrl ?? null;
      if (url) signedUrlCache.set(path, { url, expiresAt: Date.now() + CACHE_TTL_MS });
      return url;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(path);
    });
  inFlight.set(path, promise);
  return promise;
}

export function StorageImage({
  path,
  alt,
  className = "",
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    const directUrl = /^https?:\/\//i.test(path) ? path : null;
    if (directUrl) {
      setUrl(directUrl);
      return () => {
        active = false;
      };
    }
    getSignedUrl(path).then((signedUrl) => {
      if (active) {
        setUrl(signedUrl);
        setFailed(!signedUrl);
      }
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (!url || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex min-h-24 items-center justify-center rounded-xl bg-secondary px-4 text-sm text-muted-foreground ${className}`}
      >
        Image unavailable
      </div>
    );
  }
  return (
    <img src={url} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
  );
}
