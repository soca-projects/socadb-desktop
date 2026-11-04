export function messageToSend(
  value: string,
  { disabled, isStreaming }: { disabled: boolean; isStreaming?: boolean },
): string | null {
  if (disabled || isStreaming) return null;
  return value.trim() || null;
}
