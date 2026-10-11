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

// Escapes are skipped so `\"name\"` inside a JSON string can't flip the match;
// a quote right after a letter is an apostrophe ("can't"), not an opening one.
const DOUBLE_QUOTED = /"(?:[^"\\]|\\.)*"/g;
const SINGLE_QUOTED = /(?<![\p{L}\p{N}])'(?:[^'\\]|\\.)*'/gu;

export function maskQuoted(text: string): string {
  return text.replace(DOUBLE_QUOTED, '"…"').replace(SINGLE_QUOTED, "'…'");
}

// A path runs to the end of the message or to the next known separator: folder
// names often hold spaces ("Acme Corp"), so whitespace can't end it.
const PATH_END = String.raw`(?=\s+with error:|, maybe |["'\`]|$)`;
const FILE_URL = /file:\/\/\S+/gi;
const LABELLED_PATH = new RegExp(String.raw`(path:\s*)(.+?)${PATH_END}`, "gim");
const UNC_PATH = new RegExp(String.raw`\\\\[^\\\s]+\\.*?${PATH_END}`, "gm");
const WINDOWS_PATH = new RegExp(String.raw`\b[a-z]:\\.*?${PATH_END}`, "gim");
const POSIX_PATH = new RegExp(
  String.raw`(?<![\w:/.])\/(?:Users|home|Volumes|private|var|tmp|mnt|media|opt|srv|root)\/.*?${PATH_END}`,
  "gm",
);

// Error text from file APIs quotes the full path; the log keeps only a
// placeholder, and callers pass pathForLog() in ctx when the place matters.
export function maskPaths(text: string): string {
  return text
    .replace(FILE_URL, "<path>")
    .replace(LABELLED_PATH, "$1<path>")
    .replace(UNC_PATH, "<path>")
    .replace(WINDOWS_PATH, "<path>")
    .replace(POSIX_PATH, "<path>");
}
