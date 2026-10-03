"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "@/components/ui/Sheet.module.css";

type SheetProps = {
  /** Names the dialog for screen readers. */
  label: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A modal sheet. Mount it to open it, unmount it to close it. It opens as a
 * native modal <dialog> (so focus is trapped, Escape closes it, and the page
 * behind is inert), returns focus to whatever opened it, and closes when the
 * dimmed area outside it is tapped.
 */
export function Sheet({ label, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // What had focus when the sheet opened, so focus can go back there when it closes.
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Recorded once: in development React runs this effect twice, and by the second run focus is already inside the sheet.
    if (opener.current === null) opener.current = document.activeElement;
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add("ync-locked");
    return () => {
      document.documentElement.classList.remove("ync-locked");
      // A native close() puts focus back where it was, but removing the dialog from
      // the page does not, and would leave a keyboard or screen-reader user back at
      // the top of the page. While the sheet is still open the browser ignores this
      // (everything outside a modal is inert), which is what makes the early
      // development-only run harmless.
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
      // Deliberately NOT dialog.close(): taking the dialog out of the page already
      // closes it, and close() fires a "close" event that would call onClose after
      // the fact. In development React runs this effect twice, and that late event
      // used to dismiss the sheet the moment it opened.
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-label={label}
      // Escape and dialog.close() both land here.
      onClose={onClose}
      // A tap on the dimmed area is a click on the dialog element itself, not on the panel inside it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.grab} aria-hidden="true" />
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
