import { createContext, useContext, useEffect, type ReactNode } from "react";
import Markdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { refuseDeepNesting, webUrl } from "../../utils/chatMarkdown";
import { logWarn } from "../../utils/log";

const PARAGRAPH = "whitespace-pre-wrap [&_br]:hidden";

const InsideLink = createContext(false);

// No href: on a selected link, WebKit's native menu offers Open Link, which would
// replace the app with the page.
function WebLink({ url, children }: { url: unknown; children: ReactNode }) {
  const nested = useContext(InsideLink);
  const target = webUrl(url);
  if (!target || nested) return <>{children}</>;
  return (
    <InsideLink value>
      <a
        role="link"
        tabIndex={0}
        title={target}
        onClick={() => {
          // Dragging to select the link's text ends in a click too.
          if (window.getSelection()?.isCollapsed !== false) void openUrl(target);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void openUrl(target);
        }}
        className="cursor-pointer underline underline-offset-2 transition-colors hover:text-accent"
      >
        {children}
      </a>
    </InsideLink>
  );
}

function Heading({ children, className }: { children?: ReactNode; className?: string }) {
  return <p className={className ?? "font-semibold text-primary"}>{children}</p>;
}

const REMARK_PLUGINS: Options["remarkPlugins"] = [
  [remarkGfm, { singleTilde: false }],
  refuseDeepNesting,
];

const COMPONENTS: Components = {
  // Agents often mean a single line break; Markdown alone would join the lines.
  // The newline stays in the text, so a <br> on top of it would leave a blank line.
  p: ({ children }) => <p className={PARAGRAPH}>{children}</p>,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  strong: ({ children }) => (
    <strong className="font-semibold text-primary">{children}</strong>
  ),
  a: ({ href, children }) => <WebLink url={href}>{children}</WebLink>,
  // The app has no CSP: an image would reach any server named in the text, even
  // one taken from a page the agent read.
  img: ({ src, alt }) => <WebLink url={src}>{alt || webUrl(src)}</WebLink>,
  ul: ({ children, className }) => (
    <ul
      className={
        className?.includes("contains-task-list")
          ? "space-y-1"
          : "list-disc space-y-1 pl-4 marker:text-tertiary"
      }
    >
      {children}
    </ul>
  ),
  ol: ({ children, start }) => (
    <ol start={start} className="list-decimal space-y-1 pl-5 marker:text-tertiary">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="space-y-1">{children}</li>,
  input: ({ type, checked }) => (
    <input type={type} checked={checked} disabled className="mr-1.5 align-middle" />
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface px-1 font-mono text-[11.5px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded bg-surface px-2 py-1.5 leading-snug [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] leading-snug">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="border-b border-border-hover py-1 pr-3 text-left font-semibold text-primary last:pr-0"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border-b border-border py-1 pr-3 align-top last:pr-0">
      {children}
    </td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="space-y-2 border-l-2 border-border-hover pl-2.5">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border" />,
};

// A plain call so that the catch covers the parser. Text nested thousands deep
// overflows the stack, and a throw while rendering takes the whole window down, at
// every launch once the conversation is saved.
function renderMarkdown(text: string): ReactNode {
  try {
    return Markdown({
      remarkPlugins: REMARK_PLUGINS,
      components: COMPONENTS,
      children: text,
    });
  } catch {
    return null;
  }
}

export function ChatMarkdown({ text }: { text: string }) {
  const rendered = renderMarkdown(text);
  const failed = rendered === null;
  useEffect(() => {
    if (failed) logWarn("chat.markdown.failed", "Showed a reply as plain text");
  }, [failed]);
  return rendered ?? <p className={PARAGRAPH}>{text}</p>;
}
