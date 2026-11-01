import { useEffect } from "react";
import { toast } from "sonner";
import { useUpdateStore } from "../stores/updateStore";
import { useReleaseNotesStore } from "../stores/releaseNotesStore";
import { updateToastShown } from "../utils/updater";
import { UpdateReadyToast } from "../components/UpdateReadyToast/UpdateReadyToast";

const TOAST_ID = "update-ready";

export function useUpdateReadyToast() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion);
  const afterDownload = useUpdateStore((s) => s.afterDownload);
  const notesOpen = useReleaseNotesStore((s) => s.modal !== null);

  useEffect(() => {
    if (
      updateToastShown({ status, version, dismissedVersion, afterDownload }, notesOpen)
    ) {
      toast.custom(() => <UpdateReadyToast />, {
        id: TOAST_ID,
        duration: Infinity,
        dismissible: false,
        unstyled: true,
      });
    } else {
      toast.dismiss(TOAST_ID);
    }
  }, [notesOpen, status, version, dismissedVersion, afterDownload]);
}
