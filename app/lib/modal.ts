// Shared by every React dialog. Both ends of a gesture must be on the backdrop.
export function setupModal(
  dialog: HTMLDialogElement,
  {
    canDismiss = () => true,
    dismiss = () => dialog.close(),
  }: { canDismiss?: () => boolean; dismiss?: () => void } = {},
) {
  dialog.classList.add("modal-surface");
  const outside = (event: MouseEvent) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    );
  };
  let backdropStart = false;
  const down = (event: PointerEvent) => {
    backdropStart = event.button === 0 && outside(event);
  };
  const cancelPointer = () => {
    backdropStart = false;
  };
  const click = (event: MouseEvent) => {
    const close = backdropStart && outside(event);
    backdropStart = false;
    if (close && canDismiss()) dismiss();
  };
  const cancel = (event: Event) => {
    event.preventDefault();
    if (canDismiss()) dismiss();
  };
  dialog.addEventListener("pointerdown", down);
  dialog.addEventListener("pointercancel", cancelPointer);
  dialog.addEventListener("click", click);
  dialog.addEventListener("cancel", cancel);
  return () => {
    dialog.removeEventListener("pointerdown", down);
    dialog.removeEventListener("pointercancel", cancelPointer);
    dialog.removeEventListener("click", click);
    dialog.removeEventListener("cancel", cancel);
  };
}
