import { commitActiveEdit } from "./menuActions";
import { installOnClose } from "./updater";

export function handleCloseRequested(event: { preventDefault(): void }) {
  commitActiveEdit();
  return installOnClose(event);
}
