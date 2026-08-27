/**
 * Status badge built on the existing `.status-pill` class so shipped markup and
 * new markup render identically.
 *
 * `.status-pill`, `.status-pill--good`, and `.status-pill--warn` already exist
 * in styles.css and layout.css. `--danger` and `--neutral` are added in
 * styles/primitives.css. The unmodified base is the informational (blue) tone,
 * which is why `info` maps to no modifier.
 */
const TONE_CLASS = {
  info: '',
  good: 'status-pill--good',
  warn: 'status-pill--warn',
  danger: 'status-pill--danger',
  neutral: 'status-pill--neutral',
};

/**
 * Maps common domain status strings onto a tone.
 *
 * Deliberately covers only vocabularies that are locked in ARCHITECTURE:
 * transaction_items.status (Section 14a), job status (Section 38), estimate
 * status (Section 5a), and the archive convention (Section 18). Anything
 * unrecognised falls back to `neutral` rather than guessing.
 */
export function toneForStatus(status) {
  if (!status) return 'neutral';

  switch (String(status).toLowerCase()) {
    case 'approved':
    case 'complete':
    case 'completed':
    case 'active':
    case 'current':
    case 'received':
      return 'good';

    case 'pending':
    case 'in_progress':
    case 'on_hold':
    case 'submitted':
    case 'pursuit':
    case 'ordered':
    case 'expiring':
    case 'service due':
      return 'warn';

    case 'rejected':
    case 'denied':
    case 'delayed':
    case 'cancelled':
    case 'expired':
    case 'out of service':
      return 'danger';

    case 'draft':
    case 'archived':
    case 'not_started':
      return 'neutral';

    default:
      return 'neutral';
  }
}

export function StatusBadge({
  children,
  label,
  tone = 'info',
  status = null,
  icon = null,
  title,
  incomplete = false,
}) {
  const resolvedTone = status ? toneForStatus(status) : tone;
  const modifier = TONE_CLASS[resolvedTone] ?? '';
  const content = children ?? label ?? status ?? '';

  return (
    <span className={`status-pill ${modifier}${incomplete ? ' ng-incomplete-component' : ''}`.trim()} title={title}>
      {icon ? <span className="status-pill__icon" aria-hidden="true">{icon}</span> : null}
      <span className="status-pill__label">{content}</span>
    </span>
  );
}
