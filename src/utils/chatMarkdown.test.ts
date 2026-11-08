import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import { ChatMarkdown } from "../components/ChatMessage/ChatMarkdown";
import { escapeMarkdown, webUrl } from "./chatMarkdown";

function render(text: string) {
  return renderToStaticMarkup(createElement(ChatMarkdown, { text }));
}

describe("webUrl", () => {
  it.each(["https://example.com/a", "http://example.com", "HTTPS://EXAMPLE.COM"])(
    "accepts %s",
    (url) => {
      expect(webUrl(url)).toBe(url);
    },
  );

  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "mailto:a@example.com",
    "/relative",
    "#anchor",
    "",
    undefined,
  ])("refuses %s", (url) => {
    expect(webUrl(url)).toBeUndefined();
  });
});

describe("escapeMarkdown", () => {
  it.each([
    "C:\\Users\\me\\.socadb\\agent",
    "C:\\Temp\\_old\\*",
    "__init__.py",
    "# not a heading",
    "1. not a list",
    "[a](b)",
    "a | b",
  ])("keeps %s as written", (text) => {
    expect(render(escapeMarkdown(text))).toContain(`>${text}</p>`);
  });

  it("keeps indented lines from becoming code", () => {
    const html = render(escapeMarkdown("first\n\n    at foo (a.js:1:2)\n\tat bar_baz"));
    expect(html).not.toContain("<pre");
    expect(html).toContain("at foo (a.js:1:2)\nat bar_baz");
  });

  it("keeps a line followed by dashes from becoming a heading", () => {
    expect(render(escapeMarkdown("Title\n---"))).toContain(">Title\n---</p>");
  });
});

describe("a chat reply", () => {
  it("shows what the agent formats", () => {
    const html = render(
      "**users**\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```sql\nSELECT 1;\n```",
    );
    expect(html).toContain("<strong");
    expect(html).toContain("<li");
    expect(html).toContain("<table");
    expect(html).toContain("<pre");
  });

  it("never loads an image", () => {
    const html = render("![the plan](https://example.com/x.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain("the plan");
  });

  it("gives a link no address the app could navigate to", () => {
    const html = render("[docs](https://example.com)");
    expect(html).not.toContain("href");
    expect(html).toContain('title="https://example.com"');
    expect(html).toContain("docs");
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "/relative"])(
    "leaves a link to %s as plain text",
    (url) => {
      const html = render(`[click](${url})`);
      expect(html).not.toContain("<a");
      expect(html).toContain("click");
    },
  );

  it("shows raw HTML as text", () => {
    const html = render("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("keeps a single line break", () => {
    const html = render("first\nsecond");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain(">first\nsecond</p>");
  });

  it("doesn't strike out the text between two approximations", () => {
    expect(render("~100 tables and ~200 columns")).not.toContain("<del");
  });

  it("keeps the number of a list that resumes after a paragraph", () => {
    expect(render("2. second")).toContain('start="2"');
  });

  it("makes a single link of an image inside a link", () => {
    const html = render("[![CI](https://example.com/x.svg)](https://example.com/repo)");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('title="https://example.com/repo"');
    expect(html).toContain("CI");
  });

  it.each([
    ["lists", "- ".repeat(2000) + "x"],
    ["numbered lists", "1. ".repeat(2000) + "x"],
    ["quotes too deep to parse", ">".repeat(6000) + "x"],
    ["emphasis", "**a ".repeat(2000) + "x" + " a**".repeat(2000)],
  ])("shows %s nested thousands deep as plain text", (_, text) => {
    const html = render(text);
    expect(html).toContain("x");
    expect(html).not.toMatch(/<(li|blockquote|strong)/);
  });

  it("still formats ordinary nesting", () => {
    expect(render("- a\n  - b\n    - c").match(/<ul/g)).toHaveLength(3);
  });

  it("keeps the footnotes heading for screen readers only", () => {
    expect(render("text[^1]\n\n[^1]: note")).toContain('class="sr-only"');
  });
});
