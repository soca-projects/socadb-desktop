import { useEffect } from "react";
import { toast } from "sonner";
import { useReleaseNotesStore } from "../stores/releaseNotesStore";
import { WhatsNewToast } from "../components/WhatsNew/WhatsNewToast";

const TOAST_ID = "whats-new";

export function useWhatsNewToast() {
  const whatsNew = useReleaseNotesStore((s) => s.toast);

  useEffect(() => {
    if (whatsNew) {
      toast.custom(
        () => <WhatsNewToast since={whatsNew.since} version={whatsNew.version} />,
        { id: TOAST_ID, duration: Infinity, dismissible: false, unstyled: true },
      );
    } else {
      toast.dismiss(TOAST_ID);
    }
  }, [whatsNew]);
}
