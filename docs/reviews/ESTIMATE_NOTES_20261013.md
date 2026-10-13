# Estimate annotations — local review

## Baseline and scope

Fresh remote clone on 2026-10-13: Production `origin/main` is `c1afe71`, including v0.7.1 implementation `99952ec`; `origin/staging` is `a71a47f`. Local branch: `estimate-notes-local`. Ryan's active Dropbox checkout and earlier release checkout were only read. No remote push, deployment, shared migration or live-record write occurred.

## Existing Resource notes purpose

At baseline, `ComponentEditor.jsx:45` bound Resource notes to `line.notes`. The line represents a material plus labor resource or a labor-only resource, inside an estimate work item. It is **an estimate row annotation**, not material catalogue metadata.

`WorkbenchRoute.jsx` sends the entire document to `save_estimate_workbench` (`p_document`) or personal `save_v5_working_copy` (`p_payload`). It reloads `estimate_workbenches.document`, personal payloads and approved `estimate_snapshots.workbench_document`. `20260916173238_estimating_workspace_integration.sql:80–84` inserts/updates the complete document. Existing validators check component identity and structure without projecting away annotation metadata; revision, permissions, audit and approval locks remain unchanged.

`WorkItemReview.jsx` already exposed `line.notes`, work-item `notes`, and entry `internalNotes`. Existing detailed internal reports include work-item and resource notes; public proposal, field and vendor projections exclude them. This implementation does not add any new annotations to exports.

`catalogueService.js:52–55` separately loads assembly description and `assembly_items.note` as work-item/resource notes. `app.jsx` copies these values when inserting an assembly. Explicit Assembly Library editing writes reusable assembly notes; `assemblyLibrarySave` excludes project work-item/resource notes when saving a project copy to the library. Therefore the old Resource notes label had context ambiguity. Material catalogue notes are the separate `items.catalogue_notes` field edited by `CatalogueMaterialForm.jsx`; `catalogueChanges` sends only price/labor changes and cannot write row notes into it.

## Final behavior

- Reuse entry `internalNotes`, work-item `notes`, and resource `notes`; preserve legacy values.
- Add optional `components[].internalNotes`, promoted to explicit component metadata only when a component annotation is saved.
- Compact Note buttons show a dot for nonempty annotations; component headings and work-item summaries indicate nested annotations. Expand work-item verification to read all levels, including locked/read-only estimates. Empty entries and package entries also have entry-note access.
- Note overlays buffer locally. Save commits to the owning draft; the normal draft/work-item save persists it. Cancel, Escape and close discard overlay edits. Clear clears the buffer and requires Save. Ctrl/Cmd+Enter saves; native dialog focus trapping and return focus support keyboard review. Rendering uses React plain text, including multiline text and HTML-like input.
- A resource row's note applies to its combined material/labor values. A labor-only row has its own independent note. No artificial separate material/labor entity was added.
- Estimate copies/clipboard operations preserve annotations with renewed identifiers. Reusable assembly copies strip component `internalNotes` as well as existing project work-item/resource notes. Templates and refreshed template items strip all estimate annotations. Explicit reusable library editing retains its existing source-note semantics, now labeled Assembly note / Assembly resource note. Component estimate annotations are unavailable in library mode.
- No pricing or labor-inheritance changes. No schema migration required: all added metadata is inside existing JSON document storage. Deployment can be a reviewed frontend release; database and signed-in authorization smoke remain an owner rollout check.

## Verification

Final explicit Node regression suite: 302/302 passed. `tests/estimateNotes.test.mjs` covers JSON reload, estimate/clipboard copies, reusable-source/template isolation and export allowlists. Existing labor-rate, proposal, catalogue, review and pricing suites pass.

`scripts/verify-estimate-notes.mjs` passed against the actual editor with isolated in-memory/sessionStorage callbacks and external requests blocked. It covers all note levels, persisted reload, resource and labor notes, Escape/Cancel/Clear, keyboard save, repeated reopen, plain-text rendering, read-only review, and desktop/mobile dialog bounds. Screenshots and JSON results are in `.temp/estimate-notes/`.

Production-mode Vite build passed using explicitly fake configuration for compilation only (fixture.invalid); this is not a deployable or Production-configured bundle. Existing large-chunk and dynamic-import warnings remain.

An unrestricted `node --test` picked up `scripts/serve-estimating-test.mjs`, a development server, and reported a port conflict while the UI fixture was running. Running all actual `*.test.js`/`*.test.mjs` files passes. Sandboxed Edge could not start; the same local-only browser checks passed outside the sandbox. Live database RPC round trips, signed-in live authorization and deployment were not run because this task authorizes local work only. JSON persistence verification uses the existing database function source plus the isolated callback, not a live database claim.
