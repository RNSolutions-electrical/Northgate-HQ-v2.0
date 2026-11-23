# Schedule of Values workspace — Staging
Jobs → job → Financials → SOV & billing. Before this update, the financial
workspace was at 4fe76fa4e69ce5215ccdc0644bdc8cf6dcd49484. The prior ledger,
application workflow, approvals, receipts, audit and corrections remain.
Use **Open Legacy SOV & Billing** any time.

Start a division with a name/code and manually entered target, or import
the sum of the original budget amounts on that project's division. The
imported starting point is explicit; it is never assumed to be a signed
amount. Add rows in dollars or a share of the division. Remaining work
is computed from measured work progress; remaining billing is the linked
base scheduled value less recorded billing. Unlinked billing is unknown,
not zero, and can only be linked one-to-one to equivalent existing rows.
Change orders are not folded into original schedule allocation.

Saving the rebuilt draft does not write any billing rows. A reviewer may
activate a complete first schedule only when every division is allocated
to the cent, every line is positive, the combined schedule matches the
confirmed original job contract, and there is no prior schedule or Pay
App history. Existing jobs can plan and explicitly link their draft
without replacing historical billing. Actual pay applications continue
through the preserved workflow. Work progress can be updated separately
after activation. No existing jobs were migrated or modified.
