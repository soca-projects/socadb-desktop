export function frameBatch<T>(schedule: (run: () => void) => void) {
  let pending: T[] = [];
  let flush: ((items: T[]) => void) | null = null;
  return (item: T, onFlush: (items: T[]) => void) => {
    pending.push(item);
    flush = onFlush;
    if (pending.length > 1) return;
    schedule(() => {
      const items = pending;
      const run = flush;
      pending = [];
      flush = null;
      run?.(items);
    });
  };
}
