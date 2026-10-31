const stack: symbol[] = [];

export function enterModal(): { isTop: () => boolean; leave: () => void } {
  const id = Symbol("modal");
  stack.push(id);
  return {
    isTop: () => stack[stack.length - 1] === id,
    leave: () => {
      const index = stack.indexOf(id);
      if (index !== -1) stack.splice(index, 1);
    },
  };
}
