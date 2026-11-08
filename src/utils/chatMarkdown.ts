export function webUrl(url: unknown): string | undefined {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : undefined;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[!-/:-@[-`{-~]/g, "\\$&").replace(/^[ \t]+/gm, "");
}

const MAX_TREE_DEPTH = 40;

interface MarkdownNode {
  children?: MarkdownNode[];
}

function isDeeperThan(root: MarkdownNode, limit: number): boolean {
  let level = [root];
  for (let depth = 0; level.length > 0; depth++) {
    if (depth > limit) return true;
    level = level.flatMap((node) => node.children ?? []);
  }
  return false;
}

// Text nested this deep can still parse, then overflow the stack while React commits
// it, where the catch in ChatMarkdown can't reach.
export function refuseDeepNesting() {
  return (tree: MarkdownNode) => {
    if (isDeeperThan(tree, MAX_TREE_DEPTH)) throw new Error("Markdown nested too deep");
  };
}
