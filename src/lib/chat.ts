export const MAX_CHAT_MESSAGE_LENGTH = 500;

export function sanitizeChatMessage(raw: string): string {
  const normalized = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/\u0000/g, "")
    .trim();

  return normalized.replace(/\s+/g, " ").slice(0, MAX_CHAT_MESSAGE_LENGTH);
}

export function isValidChatMessage(raw: string): boolean {
  return sanitizeChatMessage(raw).length > 0;
}

export function getConversationIdForUsers(a: string, b: string): string {
  const [first, second] = [a, b].sort();
  return `${first}:${second}`;
}
