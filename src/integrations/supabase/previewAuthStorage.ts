export function brokeredPreviewStorage() {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
