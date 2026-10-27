import { updateNotice } from "../bridge.js";

type TextContent = { type: "text"; text: string };

function withNotice(text: string): TextContent[] {
  const notice = updateNotice();
  return notice
    ? [{ type: "text", text }, { type: "text", text: notice }]
    : [{ type: "text", text }];
}

export function ok(text: string) {
  return { content: withNotice(text) };
}

export function okJson(data: unknown) {
  return ok(JSON.stringify(data, null, 2));
}

export function err(text: string) {
  return { content: withNotice(text), isError: true };
}
