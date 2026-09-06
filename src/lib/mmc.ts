export const DISCLAIMER =
  "MMCLoop is an unofficial student community platform and is not affiliated with, operated by, or endorsed by Makawanpur Multiple Campus.";

export const ACTIVITY_TYPES = [
  { value: "gaming", label: "Gaming", emoji: "🎮" },
  { value: "study", label: "Study", emoji: "📚" },
  { value: "hangout", label: "Hangout", emoji: "🧑‍🤝‍🧑" },
  { value: "food", label: "Food / Coffee", emoji: "☕" },
  { value: "movie", label: "Movie / Watch", emoji: "🎬" },
  { value: "walk", label: "Walk / Outdoor", emoji: "🚶" },
  { value: "talk", label: "Just Talk", emoji: "💬" },
  { value: "other", label: "Other", emoji: "✨" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

export function activityMeta(value: string) {
  return ACTIVITY_TYPES.find((a) => a.value === value) ?? ACTIVITY_TYPES[7];
}

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "misleading", label: "Misleading information" },
  { value: "other", label: "Other" },
] as const;

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function whenLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
