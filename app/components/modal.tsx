import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { setupModal } from "../lib/modal";
import { t } from "../lib/i18n";

export function Modal({
  title,
  children,
  onClose,
  busy = false,
  className = "",
  id,
}: {
  title: string;
  children: React.ReactNode;
  onClose(): void;
  busy?: boolean;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    const cleanup = setupModal(dialog, {
      canDismiss: () => !latest.current.busy,
      dismiss: () => latest.current.onClose(),
    });
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>("[data-initial-focus]")
      ?.focus({ preventScroll: true });
    return () => {
      cleanup();
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      id={id}
      className={`modal-surface ${className}`}
      aria-labelledby={heading}
    >
      <div className="dialog-inner">
        <div className="dialog-head">
          <h2 id={heading}>{title}</h2>
          <button
            type="button"
            className="tool"
            disabled={busy}
            onClick={onClose}
            aria-label={t("关闭")}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
