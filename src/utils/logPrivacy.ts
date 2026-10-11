export interface PathForLog {
  where: string;
  ext: string;
  id: string;
}

const HOME = /^(?:\/Users\/[^/]+|\/home\/[^/]+|[a-z]:\\users\\[^\\]+)(?:[/\\](.*))?$/i;
const KNOWN_FOLDERS = ["Documents", "Desktop", "Downloads"];

function locationOf(path: string): string {
  if (path.startsWith("\\\\")) return "network share";
  if (path.startsWith("/Volumes/")) return "external volume";
  const home = HOME.exec(path);
  if (!home) return "outside home";
  const [first = "", second = ""] = (home[1] ?? "").split(/[/\\]/);
  if (first === "Library" && second === "Mobile Documents") return "iCloud Drive";
  if (/^onedrive/i.test(first)) return "OneDrive";
  const known = KNOWN_FOLDERS.find(
    (folder) => folder.toLowerCase() === first.toLowerCase(),
  );
  return known ? `~/${known}` : "~";
}

// FNV-1a: tells two files apart in a log without naming either.
function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// Where a schema file is, never its name or folders: logs are meant to be sent
// to support, and folder names often name clients or projects.
export function pathForLog(path: string): PathForLog {
  return {
    where: locationOf(path),
    ext: /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "",
    id: hashOf(path),
  };
}

export function maskQuoted(text: string): string {
  return text.replace(/"[^"]*"/g, '"…"');
}

const LABELLED_PATH = /(at path: |forbidden path: )(.+?)(?= with error:|, maybe |$)/g;
const POSIX_PATH = /(?<![\w:/.])\/(?:[^\s/"'`]+\/)+[^\s"'`,)]*/g;
const WINDOWS_PATH = /\b[a-z]:\\[^\s"'`,)]*/gi;
const UNC_PATH = /\\\\[^\s"'`,)]+/g;

// Error text from file APIs quotes the full path; the log keeps only a
// placeholder, and callers pass pathForLog() in ctx when the place matters.
export function maskPaths(text: string): string {
  return text
    .replace(LABELLED_PATH, "$1<path>")
    .replace(UNC_PATH, "<path>")
    .replace(WINDOWS_PATH, "<path>")
    .replace(POSIX_PATH, "<path>");
}
