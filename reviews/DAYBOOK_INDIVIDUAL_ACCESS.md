# Daybook individual access — staging candidate

Daybook is listed under Developer Tools. Existing developer access is retained.
The existing audited Developer → Tool Add-Ons console manages two separate grants:

- **Daybook:** an active, individually enabled account can edit and recover its own
  planner and view a limited read-only company crew schedule. This does not grant
  Developer, HQ Time, shared write or shared recovery access.
- **Daybook pay visibility:** a separate explicit grant; no implicit Developer
  access. Only the protected Primary account manages this grant. The grant
  does not by itself open Daybook. Ordinary users with both
  grants can see rates, but cannot edit them or read shared recovery history.

The Daybook API, not the navigation switch, enforces these boundaries. A member
projection omits generic company events, sensitive contact/worker profile data,
out-of-scope referenced HQ jobs and their assignments, and non-scheduling PTO
details. The existing Jobs module policies and developer scheduling picker are
unchanged. Browser controls and backups must respect the server's capability
response; a personal planner restore never sends a shared replacement for a
non-developer. Shared saves without explicit pay access preserve stored protected
worker fields rather than zeroing them.

## Staging validation

1. Verify the exact isolated staging database and Netlify site. Apply the additive
   migration before building the matching staging web app. No grants are seeded.
2. Check a developer retains Daybook/crew editing without a grant and cannot see
   pay controls or values by default. Verify a legitimate shared edit does not
   clear stored compensation.
3. With synthetic accounts and records, check direct route and server read denial
   before grant, personal save/recover and shared view after grant, denied shared
   write/history/restore, pay absent under normal Daybook, rate-only access after
   separate pay grant, and denial after revocation. Do not use real workers or
   enable Daybook/pay for real accounts as part of automated checks.
4. Keep production unchanged. Do not migrate staging Daybook records to
   production. Promote exact reviewed changes only after acceptance.
