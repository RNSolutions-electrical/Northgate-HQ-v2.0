import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Confirmation surface with optional required reason capture.
 *
 * `requireReason` exists because ARCHITECTURE mandates a reason on several
 * actions, and a shared surface is the only way to make that structural rather
 * than remembered:
 *
 *   - budget changes (Section 7, Section 19)
 *   - archive / retire actions (Section 18, Section 23)
 *   - physical count corrections (Section 12, Section 23)
 *   - developer process overrides (Section 22)
 *
 * When `requireReason` is set, Confirm stays disabled until a non-whitespace
 * reason is entered, and the reason is handed to `onConfirm`. Callers pass it
 * to the controlled RPC that writes the audit entry.
 *
 * This dialog does not write anything and is not an authorization boundary. It
 * collects intent. The server still validates the caller and records the audit
 * entry (Constitutional Rules 4, 5, 6).
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonHint = 'Recorded in the audit log.',
  reasonPlaceholder = '',
  isSubmitting = false,
  children = null,
}) {
  const [reason, setReason] = useState('');
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!isSubmitting) onCancel?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isSubmitting, onCancel],
  );

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const reasonSatisfied = !requireReason || trimmedReason.length > 0;
  const confirmDisabled = !reasonSatisfied || isSubmitting;

  const handleConfirm = () => {
    if (confirmDisabled) return;
    onConfirm?.(requireReason ? trimmedReason : undefined);
  };

  return (
    <div className="ng-dialog-root">
      <div className="ng-dialog-scrim is-open" />

      <section
        ref={panelRef}
        className={`ng-dialog ng-dialog--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header className="ng-dialog__header">
          {tone === 'danger' ? (
            <span className="ng-dialog__icon" aria-hidden="true">
              <AlertTriangle />
            </span>
          ) : null}
          <div>
            <h3 id={titleId}>{title}</h3>
            {description ? <p className="ng-dialog__description">{description}</p> : null}
          </div>
        </header>

        {children ? <div className="ng-dialog__body">{children}</div> : null}

        {requireReason ? (
          <div className="ng-dialog__reason">
            <label htmlFor={reasonId}>
              {reasonLabel}
              <span className="ng-dialog__required" aria-hidden="true"> *</span>
            </label>
            <textarea
              id={reasonId}
              value={reason}
              rows={3}
              placeholder={reasonPlaceholder}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`${reasonId}-hint`}
              required
            />
            <p className="ng-dialog__hint" id={`${reasonId}-hint`}>
              {reasonHint}
            </p>
          </div>
        ) : null}

        <footer className="ng-dialog__actions">
          <button
            type="button"
            className="ng-dialog__button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ng-dialog__button ng-dialog__button--${
              tone === 'danger' ? 'danger' : 'primary'
            }`}
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {isSubmitting ? 'Working…' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
