// A toast that held the focus hands it back to the page as soon as it loses
// it (sonner), which pulls it out of a modal opened from that toast.
export function takeFocus(
  container: Pick<HTMLElement, "focus" | "contains">,
  active: () => Element | null,
) {
  container.focus();
  if (!container.contains(active())) container.focus();
}
