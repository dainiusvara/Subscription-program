"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * A modal built on the native <dialog>: the browser handles focus trapping,
 * Escape and hiding the page behind it from screen readers.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  initialFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      initialFocus?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onClose={onClose}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[440px] rounded-[18px] border border-line bg-surface p-0 text-ink"
    >
      <div className="grid gap-3 p-[22px]">{children}</div>
    </dialog>
  );
}
