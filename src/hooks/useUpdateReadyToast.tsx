import { useEffect } from "react";
import { toast } from "sonner";
import { useUpdateStore } from "../stores/updateStore";
import { UpdateReadyToast } from "../components/UpdateReadyToast/UpdateReadyToast";

const TOAST_ID = "update-ready";

export function useUpdateReadyToast() {
  const status = useUpdateStore((s) => s.status);
  const update = useUpdateStore((s) => s.update);
  const pendingUpdateVersion = useUpdateStore((s) => s.pendingUpdateVersion);

  useEffect(() => {
    const alreadyConsented = update !== null && pendingUpdateVersion === update.version;
    const installInFlight = status === "installing";
    const promptForConsent = status === "ready" && !alreadyConsented;
    const shouldShow = installInFlight || promptForConsent;
    if (shouldShow) {
      toast.custom((id) => <UpdateReadyToast toastId={id} />, {
        id: TOAST_ID,
        duration: Infinity,
        dismissible: false,
        position: "bottom-right",
        unstyled: true,
      });
    } else {
      toast.dismiss(TOAST_ID);
    }
  }, [status, update, pendingUpdateVersion]);
}
