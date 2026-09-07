import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  USERNAME_HELP,
  checkUsernameAvailable,
  claimUsername,
  suggestUsernames,
  validateUsernameFormat,
} from "@/lib/username";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "invalid"; message: string }
  | { kind: "taken" };

export function UsernamePicker({
  initialValue = "",
  submitLabel,
  onSaved,
}: {
  initialValue?: string;
  submitLabel: string;
  onSaved: (username: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) {
      setStatus({ kind: "idle" });
      setSuggestions([]);
      return;
    }
    const formatError = validateUsernameFormat(trimmed);
    if (formatError) {
      setStatus({ kind: "invalid", message: formatError });
      setSuggestions([]);
      return;
    }
    setStatus({ kind: "checking" });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const ok = await checkUsernameAvailable(trimmed);
        if (cancelled) return;
        setStatus(ok ? { kind: "available" } : { kind: "taken" });
        setSuggestions(ok ? [] : await suggestUsernames(trimmed));
      } catch {
        if (!cancelled) setStatus({ kind: "idle" });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, initialValue]);

  async function save() {
    const trimmed = value.trim();
    const formatError = validateUsernameFormat(trimmed);
    if (formatError) {
      setError(formatError);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await claimUsername(trimmed);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      setStatus({ kind: "taken" });
      setSuggestions(await suggestUsernames(trimmed));
      return;
    }
    onSaved(trimmed);
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="username-input">Username</Label>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            @
          </span>
          <Input
            id="username-input"
            value={value}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            onChange={(e) => setValue(e.target.value.replace(/\s/g, ""))}
            aria-describedby="username-help username-status"
            aria-invalid={status.kind === "invalid" || status.kind === "taken"}
          />
        </div>
        <p id="username-help" className="text-xs text-muted-foreground">
          {USERNAME_HELP}
        </p>
        <p id="username-status" aria-live="polite" className="text-xs">
          {status.kind === "checking" ? (
            <span className="text-muted-foreground">Checking availability…</span>
          ) : null}
          {status.kind === "available" ? (
            <span className="font-medium text-primary">✓ @{value.trim()} is available</span>
          ) : null}
          {status.kind === "taken" ? (
            <span className="font-medium text-destructive">✕ @{value.trim()} is already taken</span>
          ) : null}
          {status.kind === "invalid" ? (
            <span className="font-medium text-destructive">{status.message}</span>
          ) : null}
        </p>
      </div>

      {suggestions.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Try one of these instead:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button key={s} type="button" variant="outline" size="sm" onClick={() => setValue(s)}>
                @{s}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="submit"
        disabled={saving || status.kind === "checking" || status.kind === "invalid" || status.kind === "taken" || !value.trim()}
      >
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
