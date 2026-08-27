export const SUPABASE_PROJECT_REFERENCE = 'keogysnoukbendfkfjcn';

export const DEVELOPER_HELPFUL_LINKS = [
  {
    id: 'supabase',
    title: 'Supabase - Northgate HQ',
    purpose: 'Database, SQL Editor, tables, RPC inspection, logs, migrations, and server-side permission records.',
    url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REFERENCE}`,
    actionLabel: 'Open Supabase',
    reference: SUPABASE_PROJECT_REFERENCE,
    instructions: [
      `Confirm the project reference is ${SUPABASE_PROJECT_REFERENCE}.`,
      'For users and roles, open Table Editor, then public.user_permissions.',
      'Use SQL Editor for controlled inspection queries.',
      'Check Logs when an RPC or database request fails.',
      'Verify migrations against repository history before making database changes.',
    ],
    caution: 'Never edit inventory_balances directly; inventory quantities remain transaction-derived. Do not make untracked schema changes directly in production.',
  },
  {
    id: 'clerk',
    title: 'Clerk - User Accounts',
    purpose: 'Authentication users and beta-tester account administration.',
    url: 'https://dashboard.clerk.com/',
    actionLabel: 'Open Clerk',
    instructions: [
      'Open the Northgate HQ Clerk application.',
      'Use Users to review existing authenticated accounts.',
      "Use Clerk's supported invitation or user-creation workflow when adding a beta tester.",
      'After the user signs in, verify the corresponding record in Supabase public.user_permissions.',
      'Confirm role, department, active status, and approved permission overrides before granting additional application access.',
    ],
    caution: 'Never place a Clerk Secret Key in frontend code, source-controlled browser configuration, localStorage, or this Helpful Links section.',
  },
  {
    id: 'github',
    title: 'GitHub - Northgate HQ',
    purpose: 'Source code, commit history, migrations, ARCHITECTURE.md, and HANDOFF.md.',
    url: 'https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0',
    actionLabel: 'Open GitHub',
    instructions: [
      'Confirm work is on main unless a future workflow explicitly changes that convention.',
      'Check the latest commit before beginning implementation.',
      'Treat the Git repository as the source of truth.',
      'Review docs/ARCHITECTURE.md and HANDOFF.md before architecture-sensitive work.',
      'Never replace coordination files using stale uploaded copies.',
    ],
    caution: 'Do not force-push or rewrite coordination history.',
  },
  {
    id: 'netlify',
    title: 'Netlify - Production Deployment',
    purpose: 'Production deploy status, build logs, deployment history, and troubleshooting.',
    url: 'https://app.netlify.com/projects/northgate-hq-v2',
    actionLabel: 'Open Netlify',
    instructions: [
      'Open the Northgate HQ site and confirm the production deploy corresponds to the expected GitHub commit.',
      'Check Deploy Logs when production differs from a successful local build.',
      'Verify the build command remains npm ci && npm run build and the publish directory remains dist.',
      'Use deployment history when diagnosing regressions.',
    ],
    caution: 'A successful local build does not prove that production is serving the same commit.',
  },
];

export const FUTURE_USER_MANAGEMENT_CAPABILITIES = [
  'Invite beta tester',
  'Assign initial role',
  'Assign department',
  'Inspect active or inactive status',
  'Apply controlled permission overrides',
  'Resend or revoke invitations',
  'Deactivate or reactivate users',
  'Audit administrative changes',
];
