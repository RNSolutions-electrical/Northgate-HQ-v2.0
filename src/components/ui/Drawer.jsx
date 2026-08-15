import { X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Slide-over drawer / sheet.
 *
 * Section 50 requires drawers and sheets for mobile navigation and record
 * detail. This provides the shared surface: scrim, Escape to close, focus trap,
 * focus restoration, and body scroll lock.
 *
 * The scrim follows the shipped `.is-open` convention used by
 * `.top-nav-scrim` and `.workspace-sidebar-scrim`.
 *
 * A drawer is presentation. It never implies authorization — if its contents
 * are protected, the caller must not render the drawer at all rather than
 * relying on it being closed.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  description,
  side = 'right',
  width = null,
  footer = null,
  children,
  closeLabel = 'Close',
  labelledById = 'ng-drawer-title',
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
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
    [onClose],
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

  return (
    <div className="ng-drawer-root">
      <button
        type="button"
        className="ng-drawer-scrim is-open"
        aria-label={closeLabel}
        onClick={onClose}
        tabIndex={-1}
      />

      <section
        ref={panelRef}
        className={`ng-drawer ng-drawer--${side}`}
        style={width ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledById : undefined}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header className="ng-drawer__header">
          <div className="ng-drawer__header-copy">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h3 id={labelledById}>{title}</h3> : null}
            {description ? <p className="ng-drawer__description">{description}</p> : null}
          </div>
          <button
            type="button"
            className="ng-drawer__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="ng-drawer__body">{children}</div>

        {footer ? <footer className="ng-drawer__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
