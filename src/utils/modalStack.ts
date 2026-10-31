interface Entry {
  id: symbol;
  focus?: () => void;
}

const stack: Entry[] = [];

export function enterModal(focus?: () => void): {
  isTop: () => boolean;
  leave: () => void;
} {
  const id = Symbol("modal");
  stack.push({ id, focus });
  return {
    isTop: () => stack[stack.length - 1]?.id === id,
    leave: () => {
      const index = stack.findIndex((entry) => entry.id === id);
      if (index !== -1) stack.splice(index, 1);
    },
  };
}

export function focusTopModal() {
  stack[stack.length - 1]?.focus?.();
}
