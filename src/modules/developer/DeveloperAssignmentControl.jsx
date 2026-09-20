import { useEffect, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';

const EMPTY = Object.freeze({ loading: true, isDeveloper: false, isPrimary: false, reason: '', saving: false, error: null, success: '' });

export function DeveloperAssignmentControl({ user, permissions, service, onSaved }) {
  const [state, setState] = useState(EMPTY);
  const rpc = service.rpc;

  useEffect(() => {
    let mounted = true;
    if (!permissions.canManageDevelopers || !user?.user_id) return undefined;
    setState(EMPTY);
    rpc('read_user_developer_assignment', { p_user_id: user.user_id })
      .then((result) => {
        if (mounted) setState({ ...EMPTY, loading: false, isDeveloper: result?.is_developer === true, isPrimary: result?.is_primary === true });
      })
      .catch((error) => {
        if (mounted) setState({ ...EMPTY, loading: false, error });
      });
    return () => { mounted = false; };
  }, [permissions.canManageDevelopers, rpc, user?.user_id]);

  if (!permissions.canManageDevelopers) return null;

  async function save(event) {
    event.preventDefault();
    if (state.saving || state.isPrimary || user.user_id === permissions.userId) return;
    const reason = state.reason.trim();
    if (!reason) {
      setState((current) => ({ ...current, error: new Error('Enter a reason for changing Developer access.') }));
      return;
    }
    setState((current) => ({ ...current, saving: true, error: null, success: '' }));
    try {
      const next = !state.isDeveloper;
      await rpc('set_user_developer_assignment', { p_user_id: user.user_id, p_enabled: next, p_reason: reason });
      setState((current) => ({ ...current, isDeveloper: next, reason: '', saving: false, success: next ? 'Developer assignment granted and audited.' : 'Developer assignment revoked and audited.' }));
      onSaved?.();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
    }
  }

  const protectedTarget = state.isPrimary || user.user_id === permissions.userId;
  return (
    <section className="developer-permission-profile" aria-label="Developer technical assignment">
      <div>
        <span>Developer technical assignment</span>
        <strong>{state.loading ? 'Checking…' : state.isDeveloper ? 'Assigned' : 'Not assigned'}</strong>
        <small>Technical access is separate from the user’s business rank and Department.</small>
      </div>
      {protectedTarget ? (
        <StatePanel compact tone="neutral" title={state.isPrimary ? 'Protected Primary assignment' : 'Self-service is disabled'} description="Developer administrators cannot alter this assignment from the selected-user control." />
      ) : (
        <form onSubmit={save} className="developer-permission-profile">
          <label className="developer-permission-profile__reason">
            <span>{state.isDeveloper ? 'Revocation reason' : 'Assignment reason'}</span>
            <input type="text" maxLength={500} value={state.reason} disabled={state.loading || state.saving}
              onChange={(event) => setState((current) => ({ ...current, reason: event.target.value, error: null, success: '' }))}
              placeholder="Required and retained in the audit trail" />
          </label>
          <button type="submit" className={state.isDeveloper ? 'secondary-button danger-button' : 'primary-button'} disabled={state.loading || state.saving || !state.reason.trim()}>
            {state.saving ? 'Saving…' : state.isDeveloper ? 'Revoke Developer' : 'Assign Developer'}
          </button>
        </form>
      )}
      {state.error ? <StatePanel compact tone="danger" title="Developer assignment was not changed" description={state.error.message || 'Unexpected assignment error.'} /> : null}
      {state.success ? <StatePanel compact tone="success" title="Developer assignment updated" description={state.success} /> : null}
    </section>
  );
}
