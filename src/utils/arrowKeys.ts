export type ArrowAxis = "vertical" | "both";

export function arrowTarget(
  key: string,
  index: number,
  count: number,
  axis: ArrowAxis,
): number | null {
  if (count === 0) return null;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "ArrowRight":
      return axis === "both" ? (index + 1) % count : null;
    case "ArrowLeft":
      return axis === "both" ? (index - 1 + count) % count : null;
    default:
      return null;
  }
}
