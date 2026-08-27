-- Change Order decisions use explicit audit actions so denial and employee
-- decision certification remain distinguishable in project history.
ALTER TABLE public.change_logs
  DROP CONSTRAINT IF EXISTS change_logs_action_check;

ALTER TABLE public.change_logs
  ADD CONSTRAINT change_logs_action_check
  CHECK (action IN (
    'create',
    'update',
    'delete',
    'restore',
    'archive',
    'import',
    'permission_change',
    'physical_count_correction',
    'certify',
    'deny'
  ));
