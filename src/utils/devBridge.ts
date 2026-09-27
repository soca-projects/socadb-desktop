import { z } from "zod";
import { useSchemaStore } from "../stores/schemaStore";
import { useChatStore } from "../stores/chatStore";
import type { McpResult } from "./mcpActions";

const INTERACTIVE = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "summary",
  "label",
  "[contenteditable='true']",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=option]",
  "[role=checkbox]",
  "[role=switch]",
].join(",");

function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

function accessibleName(el: Element): string {
  const labelledBy = el
    .getAttribute("aria-labelledby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const fromLabel =
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
      ? [...(el.labels ?? [])].map((l) => l.textContent ?? "").join(" ")
      : "";
  return (
    el.getAttribute("aria-label") ||
    labelledBy ||
    fromLabel ||
    el.getAttribute("placeholder") ||
    (el instanceof HTMLElement ? el.innerText : el.textContent) ||
    el.getAttribute("title") ||
    ""
  ).trim();
}

function describe(el: Element): string {
  const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
  return `${role} "${accessibleName(el).replace(/\s+/g, " ").slice(0, 60)}"`;
}

function pick(matches: Element[], target: string, index?: number): Element | null {
  if (matches.length === 0) return null;
  if (index !== undefined) {
    const el = matches[index];
    if (!el)
      throw new Error(`"${target}" has ${matches.length} matches, no index ${index}`);
    return el;
  }
  if (matches.length > 1) {
    const list = matches.slice(0, 8).map((el, i) => `  [${i}] ${describe(el)}`);
    throw new Error(`"${target}" is ambiguous, pass an index:\n${list.join("\n")}`);
  }
  return matches[0];
}

function find(target: string, index?: number, includeHidden = false): Element {
  const shown = (el: Element) => includeHidden || isVisible(el);
  if (target.startsWith("css=")) {
    const matches = [...document.querySelectorAll(target.slice(4))].filter(shown);
    const el = pick(matches, target, index);
    if (!el) throw new Error(`No visible element matches ${target}`);
    return el;
  }
  const want = normalize(target);
  const interactive = [...document.querySelectorAll(INTERACTIVE)].filter(shown);
  const byName =
    pick(
      interactive.filter((el) => normalize(accessibleName(el)) === want),
      target,
      index,
    ) ??
    pick(
      interactive.filter((el) => normalize(accessibleName(el)).includes(want)),
      target,
      index,
    );
  if (byName) return byName;
  const holders = [...document.querySelectorAll("body *")].filter(
    (el) =>
      isVisible(el) &&
      normalize(el.textContent).includes(want) &&
      ![...el.children].some((child) => normalize(child.textContent).includes(want)),
  );
  const byText = pick(holders, target, index);
  if (byText) return byText;
  throw new Error(`No visible element matches "${target}"`);
}

function click(target: string, index?: number, force = false): string {
  const el = find(target, index, force);
  if (force) {
    el.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
      }),
    );
    return `force-clicked ${describe(el)}`;
  }
  el.scrollIntoView({ block: "center", inline: "center" });
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (!hit || (hit !== el && !el.contains(hit))) {
    throw new Error(`${describe(el)} is covered by ${hit ? describe(hit) : "nothing"}`);
  }
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
  };
  const pointer = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };
  hit.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
  hit.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
  if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  hit.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
  hit.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
  hit.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
  return `clicked ${describe(el)}`;
}

// React drops an input event when the value matches its tracker; setting the
// value through the prototype setter leaves the tracker on the old value.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
}

function type(target: string, text: string, append: boolean, index?: number): string {
  const el = find(target, index);
  if (el instanceof HTMLElement) el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, append ? el.value + text : text);
  } else if (el instanceof HTMLElement && el.isContentEditable) {
    el.textContent = append ? (el.textContent ?? "") + text : text;
  } else {
    throw new Error(`${describe(el)} is not a text field`);
  }
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
  );
  return `typed into ${describe(el)}`;
}

function select(target: string, option: string, index?: number): string {
  const el = find(target, index);
  if (!(el instanceof HTMLSelectElement))
    throw new Error(`${describe(el)} is not a <select>`);
  const want = normalize(option);
  const options = [...el.options];
  const match =
    options.find((o) => o.value === option) ??
    options.find((o) => normalize(o.textContent) === want) ??
    options.find((o) => normalize(o.textContent).includes(want));
  if (!match) {
    const list = options.map((o) => `${o.value} (${o.textContent?.trim()})`).join(", ");
    throw new Error(`No option "${option}" in ${describe(el)}: ${list}`);
  }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
    el,
    match.value,
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return `selected "${match.textContent?.trim()}" in ${describe(el)}`;
}

function press(combo: string, target?: string, index?: number): string {
  const parts = combo.split("+");
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  let code = key;
  if (/^[a-z]$/i.test(key)) code = `Key${key.toUpperCase()}`;
  else if (/^\d$/.test(key)) code = `Digit${key}`;
  const el = target ? find(target, index) : (document.activeElement ?? document.body);
  const init = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
    metaKey: mods.has("meta") || mods.has("cmd"),
    ctrlKey: mods.has("ctrl"),
    shiftKey: mods.has("shift"),
    altKey: mods.has("alt"),
  };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
  return `pressed ${combo} on ${describe(el)}`;
}

function text(target: string | undefined, maxChars: number): string {
  const el = target ? find(target) : document.body;
  const content = el instanceof HTMLElement ? el.innerText : (el.textContent ?? "");
  return content.length > maxChars
    ? `${content.slice(0, maxChars)}\n…[truncated]`
    : content;
}

function snapshot(): string {
  return [...document.querySelectorAll(INTERACTIVE)]
    .filter(isVisible)
    .map((el) => {
      const flags: string[] = [];
      if (
        el instanceof HTMLInputElement &&
        (el.type === "checkbox" || el.type === "radio")
      ) {
        flags.push(el.checked ? "checked" : "unchecked");
      } else if (
        (el instanceof HTMLInputElement && el.type !== "password") ||
        el instanceof HTMLTextAreaElement
      ) {
        flags.push(`value=${JSON.stringify(el.value.slice(0, 40))}`);
      }
      if (el instanceof HTMLSelectElement) {
        flags.push(
          `selected=${JSON.stringify(el.selectedOptions[0]?.textContent?.trim() ?? "")}`,
        );
      }
      if (el.matches(":disabled")) flags.push("disabled");
      return flags.length ? `${describe(el)} ${flags.join(" ")}` : describe(el);
    })
    .join("\n");
}

async function wait(
  condition: { text?: string; target?: string; gone: boolean },
  timeoutMs: number,
): Promise<string> {
  const present = () => {
    if (condition.text) {
      return normalize(document.body.innerText).includes(normalize(condition.text));
    }
    try {
      find(condition.target ?? "");
      return true;
    } catch {
      return false;
    }
  };
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (present() !== condition.gone) {
      return `after ${Math.round(performance.now() - started)} ms`;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const what = condition.text ? `text "${condition.text}"` : `"${condition.target}"`;
  throw new Error(
    `Timed out after ${timeoutMs} ms waiting for ${what} to ${condition.gone ? "disappear" : "appear"}`,
  );
}

function state() {
  const { schema } = useSchemaStore.getState();
  const chat = useChatStore.getState();
  return {
    schema: {
      name: schema.name,
      dbType: schema.dbType,
      tables: schema.tables.map((t) => ({
        name: t.name,
        columns: t.columns.map((c) => c.name),
      })),
      relations: schema.relations.length,
    },
    chat: {
      isPanelOpen: chat.isPanelOpen,
      isStreaming: chat.isStreaming,
      providers: chat.providers,
      activeConversationId: chat.activeConversationId,
      conversations: chat.conversations.length,
      messages: chat.messages.map((m) => ({
        role: m.role,
        content: m.content.slice(0, 500),
        tools: m.toolCalls.map((t) => t.name),
      })),
    },
    window: {
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
      scale: window.devicePixelRatio,
    },
  };
}

const TargetZ = z.object({
  target: z.string(),
  index: z.number().int().min(0).optional(),
});

const actions = {
  dev_click: (p: unknown) => {
    const { target, index, force } = TargetZ.extend({
      force: z.boolean().default(false),
    }).parse(p);
    return click(target, index, force);
  },
  dev_type: (p: unknown) => {
    const {
      target,
      index,
      text: value,
      append,
    } = TargetZ.extend({
      text: z.string(),
      append: z.boolean().default(false),
    }).parse(p);
    return type(target, value, append, index);
  },
  dev_focus: (p: unknown) => {
    const { target, index } = TargetZ.parse(p);
    const el = find(target, index);
    if (!(el instanceof HTMLElement))
      throw new Error(`${describe(el)} cannot take focus`);
    el.focus();
    return `focused ${describe(el)}`;
  },
  dev_select: (p: unknown) => {
    const { target, index, option } = TargetZ.extend({ option: z.string() }).parse(p);
    return select(target, option, index);
  },
  dev_press: (p: unknown) => {
    const { key, target, index } = z
      .object({
        key: z.string(),
        target: z.string().optional(),
        index: z.number().int().min(0).optional(),
      })
      .parse(p);
    return press(key, target, index);
  },
  dev_text: (p: unknown) => {
    const { target, maxChars } = z
      .object({
        target: z.string().optional(),
        maxChars: z.number().int().positive().default(6000),
      })
      .parse(p);
    return text(target, maxChars);
  },
  dev_snapshot: () => snapshot(),
  dev_wait: (p: unknown) => {
    const { timeoutMs, ...condition } = z
      .object({
        text: z.string().optional(),
        target: z.string().optional(),
        gone: z.boolean().default(false),
        timeoutMs: z.number().int().positive().max(600000).default(15000),
      })
      .refine(
        (c) => c.text !== undefined || c.target !== undefined,
        "text or target required",
      )
      .parse(p);
    return wait(condition, timeoutMs);
  },
  dev_state: () => state(),
};

function isDevAction(action: string): action is keyof typeof actions {
  return Object.hasOwn(actions, action);
}

export async function dispatchDevAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<McpResult> {
  if (!isDevAction(action)) return { ok: false, error: `Unknown dev action: ${action}` };
  try {
    return { ok: true, data: await actions[action](payload) };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: z.prettifyError(e) };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
