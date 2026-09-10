import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Suggestion = { id: string; username: string; display_name: string | null };

/** Textarea with @username autocomplete. Value/onChange behave like a normal textarea. */
export function MentionTextarea({
  value,
  onValueChange,
  className,
  ...props
}: {
  value: string;
  onValueChange: (next: string) => void;
} & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [debounced, setDebounced] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const suggestions = useQuery({
    queryKey: ["mention-suggest", debounced],
    enabled: !!debounced && debounced.length >= 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_profiles", {
        _q: debounced!,
        _limit: 6,
      });
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
  });

  const list = useMemo(() => suggestions.data ?? [], [suggestions.data]);

  function handleChange(next: string) {
    onValueChange(next);
    const el = ref.current;
    const caret = el ? el.selectionStart : next.length;
    const before = next.slice(0, caret);
    const m = before.match(/(?:^|[^\w@])@([A-Za-z0-9_]{1,20})$/);
    setActive(0);
    setQuery(m ? m[1]! : null);
  }

  function insert(username: string) {
    const el = ref.current;
    const caret = el ? el.selectionStart : value.length;
    const before = value.slice(0, caret);
    const replaced = before.replace(/@([A-Za-z0-9_]{1,20})$/, `@${username} `);
    const next = replaced + value.slice(caret);
    onValueChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  const open = !!query && list.length > 0;

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % list.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + list.length) % list.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insert(list[active]!.username);
          } else if (e.key === "Escape") {
            setQuery(null);
          }
        }}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open ? (
        <ul
          role="listbox"
          aria-label="Mention suggestions"
          className="absolute z-30 mt-1 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {list.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(s.username);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                  i === active ? "bg-secondary" : "hover:bg-secondary/60",
                )}
              >
                <span className="font-medium">@{s.username}</span>
                {s.display_name && s.display_name !== s.username ? (
                  <span className="truncate text-xs text-muted-foreground">{s.display_name}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
