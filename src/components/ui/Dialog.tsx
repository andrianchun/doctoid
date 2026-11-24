import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  danger?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel = 'Simpan',
  cancelLabel = 'Batal',
  onConfirm,
  danger = false,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="doctoid-dialog-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="doctoid-dialog-title" className="text-xl font-bold leading-snug">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-base leading-relaxed text-slate-600 dark:text-zinc-300">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          {onConfirm ? (
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default Dialog;
