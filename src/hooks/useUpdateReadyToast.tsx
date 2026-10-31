import { useEffect } from "react";
import { toast } from "sonner";
import { useUpdateStore } from "../stores/updateStore";
import { updateToastShown } from "../utils/updater";
import { UpdateReadyToast } from "../components/UpdateReadyToast/UpdateReadyToast";

const TOAST_ID = "update-ready";

export function useUpdateReadyToast() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion);
  const afterDownload = useUpdateStore((s) => s.afterDownload);

  useEffect(() => {
    if (updateToastShown({ status, version, dismissedVersion, afterDownload })) {
      toast.custom(() => <UpdateReadyToast />, {
        id: TOAST_ID,
        duration: Infinity,
        dismissible: false,
        unstyled: true,
      });
    } else {
      toast.dismiss(TOAST_ID);
    }
  }, [status, version, dismissedVersion, afterDownload]);
}
