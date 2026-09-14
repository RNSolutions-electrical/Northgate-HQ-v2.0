# Electrical inspection legacy import — field mapping review

**Status:** Proposed import contract; not an implemented importer.
**Date:** 2026-09-14
**Companion:** [Integration plan](ELECTRICAL_INSPECTION_INTEGRATION_PLAN.md), HANDOFF Entry 240.

## Verified source and handling

Read the user-supplied ZIP in place. The recovered HTML's SHA-256 matches the manifest:
`6e3ad9ad2751efcc28c29cdb078edbd81bc876104437716253770cee8ec6208f`.
Parsed `embeddedState` JSON matches the separately extracted saved-state JSON. The HTML was not run in a browser. No customer content, original HTML, populated JSON, photographs, or executable prototype was copied into the repository.

The saved state has six panels, each configured for 42 circuit positions. These 252 positions are not a claim that all circuits were measured. There are three saved findings, no general panel-photo entries and no finding-photo values in this sample. Future photo import needs synthetic test cases; this sample cannot validate it.

Source dates are materially distinct: `_meta.savedAt` is July 22, 2026; panel `header.date` values are July 16, 2026; nested `inspectionData.date` values are blank. Two panel headers contain visit times, while the nested times are blank. Do not assign the save date as the visit date or erase the populated header date because its nested counterpart is blank.

The sample has 18 unanswered checklist responses: six visual and twelve labeling. Those remain Not assessed. The saved finding severities are two `minor` and one `major`; new Low/Medium/High priority is unselected until reviewer disposition. Finding categories and code references are not reliably supplied by this shape and must not be invented from descriptive wording.

## Mapping convention

`P` means each `panels[i]`; `D` means `P.inspectionData`. Target names refer to the proposed inspection data model. Preserve an immutable archival copy of the entire original saved payload as well as the normalized representation. Store source path, original value/type, and any explicit normalization decision. IDs are stable within the committed import and retry; source array position is provenance, not the future identity.

| Saved source path | Proposed target / handling |
|---|---|
| `_meta.appVersion` | Import source version. Recognize `northgate-inspection-2.0`; reject unsupported versions with a useful message or explicit reviewed compatibility path. |
| `_meta.savedAt` | Original save timestamp, separate from visit date/time and HQ import time. Preserve exact text and parsed timestamp only when valid. |
| `activePanelIndex` | Optional UI selection hint after validating bounds. Never determines which panels are imported or reported. |
| `client.clientName` | Historical client name snapshot. Do not create or match a customer master by name. |
| `client.siteAddress` | Historical site-address text. Preserve intact; any structured address split requires explicit user review. |
| `client.contactName` | Historical contact name. |
| `client.contactPhone` | Contact phone text; preserve formatting and leading characters. |
| `client.contactEmail` | Contact email snapshot; validate before use as an address, never send mail as part of import. |
| `client.jobNumber` | Historical job-number text. Suggest authorized candidate matches; no automatic job link by filename/number alone. |
| `client.visitNotes` | Visit notes, distinct from private HQ review comments. Report inclusion must be explicit in the report projection. |
| `P.header.date` | Per-equipment visit date source. Parse explicitly as the supported slash format; retain original. Header date is the populated source in this sample. Do not collapse differing dates across panels to one silently. |
| `P.header.time` | Per-equipment local visit time source. Preserve text; do not invent a time zone or UTC instant from a time-only value. |
| `D.date`, `D.time` | Retained alternate date/time source values. Present non-equivalent conflicts and blank-versus-populated duplication in import warnings; record the accepted source precedence. |
| `D.technician` | Historical technician text, separate from authenticated importer and assigned HQ account. Placeholder text is retained as provenance, not used to assign a person. |
| `P.panel.designator` | Equipment designator plus stable equipment ID and original array order. |
| `P.panel.nominalVoltage` | Recorded nominal system voltage text. Does not imply conductor pair or authorize automatic grading. |
| `P.panel.amperage` | Recorded equipment ampere rating; preserve raw text plus validated numeric value where possible. Blank remains absent. |
| `P.panel.mainConfig` | Main configuration; retain source enum and warn on unknown values. |
| `P.panel.phaseConfig` | Actual recorded phase/wire configuration. Do not infer neutral from UI color-variable names. |
| `P.panel.phaseRotation` | Recorded phase rotation. Blank remains unrecorded. |
| `P.panel.faultCurrent` | Available fault-current value as recorded; unit must be confirmed from source labeling. Not a computed compliance assessment. |
| `P.panel.faultCurrentDate` | Original recorded fault-current date plus explicit parsing. |
| `D.panel.designator`, `.voltage`, `.amperage`, `.mainConfig`, `.phaseConfig`, `.phaseRotation`, `.faultCurrent`, `.faultCurrentDate` | Alternate saved setup representation; compare with outer `P.panel` field by field (`voltage` corresponds to `nominalVoltage`). Preserve both. Import preview records the selected primary value and warns on discrepancies; no last-write-wins merge. |
| `P.circuitCount` | Declared circuit count; validate range/shape without truncating populated keys outside the count. Report discrepancy and require a resolution before commit. |
| `P.thermalNotes`, `D.thermalNotes` | Separate source paths for thermal observation notes. Equal values may share a normalized target with both provenance paths; differing values require explicit resolution. |
| `P.voltageNotes` | Recorded voltage notes and limitations; do not drop because the nested legacy data has no corresponding populated field. |
| `D.feeders[]` | Ordered feeder records with stable IDs. Preserve all sets rather than flattening into a single phase reading. |
| `D.feeders[].sets` | Recorded set count; validate as count, preserve original type/value. |
| `D.feeders[].size` | Conductor size text. Do not coerce AWG/kcmil descriptions into an unqualified number. |
| `D.feeders[].type` | Retain source conductor-type value; confirm whether the enum denotes material before setting normalized material. |
| `D.feeders[].insulation` | Conductor insulation text/enum with raw provenance. |
| `D.feeders[].temp.{a,b,c,n}.{f,c}` | Temperature observations with explicit conductor and units. Preserve both supplied Fahrenheit/Celsius values. Detect inconsistent pairs; do not silently recompute one over the other. |
| `D.feeders[].amps.{a,b,c,n}` | Current reading per recorded conductor in amperes; blank, zero and invalid text remain distinct. |
| `D.feeders[].voltage.{a,b,c,n}` | Voltage observations with original channel name. If conductor pair is not established by reliable source context, mark pair unresolved and require reviewer clarification; never assume A-N rather than A-B from `a` alone. |
| `D.feederTemps.{a,b,neutral}.{f,c}` | Older phase-temperature representation. Preserve independently; do not merge into feeder 1 or treat `neutral` as a second energized conductor without evidence. |
| `D.feederAmps` | Legacy current map; retain every key/value even when empty or not represented by the modern feeder array. Resolve any duplicate measurement channel explicitly. |
| `D.voltageReadings` | Legacy voltage map; preserve arbitrary recorded keys. Same conductor-pair ambiguity rules as modern feeder voltage fields. |
| `D.circuitTemps.{number}` | Circuit temperature keyed by source position. Resolve unit from source control labels, record the provenance, and keep blank distinct from zero. Do not assign the active panel's units to all panels without evidence. |
| `D.circuitBreakers.{number}.amps` | Breaker rating for that circuit; separate from measured current and equipment rating. |
| `D.circuitBreakers.{number}.wireSize` | Circuit conductor size as text. No automatic ampacity/compliance verdict. |
| `D.circuitBreakers.{number}.poles` | Pole count after validation; preserve missing/invalid input and do not silently default it to one. |
| `D.circuitBreakers.{number}.notes` | Circuit description/notes exactly as saved; stable circuit ID and source position retained. |
| `D.visualChecklist[].label` | Exact checklist wording and source order; stable template item ID plus original label. |
| `D.visualChecklist[].status` | `good` -> Acceptable; `bad` -> Needs attention; empty -> Not assessed, with original status retained. Unknown states remain unresolved. Validate other supported legacy states from source, rather than inventing mappings. |
| `D.visualChecklist[].notes` | Per-response notes, separate from finding descriptions. |
| `D.labelingChecklist[].label`, `.status`, optional `.notes` | Same exact wording/status rules; keep labeling separate from visual even when wording overlaps. Preserve extra fields. |
| `D.findings[].description` | Finding description; no automatic code reference or category inference. |
| `D.findings[].severity` | Unchanged `legacySeverity`; new `priority=null` until reviewer selection. Preserve unknown/blank values. |
| `D.findings[].action` | Recommended corrective action; distinct from completed correction evidence. |
| `D.findings[].completed` | Retained historical completion flag and provenance; does not imply reviewed correction, issued report, permit pass or closed service call. |
| `D.findings[].photo` | Optional protected finding evidence; validate legacy string/object shape against source before extraction. This sample's values are null. |
| `D.photos[].id` | Historical photo ID retained as provenance; new attachment ID must avoid collision across panels/imports. |
| `D.photos[].dataUrl` | Decode approved inline image types, validate bytes/dimensions/size, hash and store through protected upload; never fetch an arbitrary supplied URL. |
| `D.photos[].caption` | Exact caption, frozen in any issued report snapshot that uses it. |
| Any additional key anywhere | Preserve in archival source payload with path; report unsupported fields in preview. Never discard because the current editor lacks a field. |

## Exact baseline checklist wording

Visual:

1. Broken, damaged, or melted insulation
2. Missing or damaged breakers
3. Missing connectors
4. Open knockouts
5. Corrosion on bus bars, terminals, or wire
6. Broken or cracked wire insulation

Labeling:

1. Arc flash warning labels present
2. Panel designators visible
3. Accurate panel schedule present
4. Panel schedule legible
5. Circuit numbers identified
6. Wire identification markings

New Not applicable and Inaccessible responses require a reason. Imported unanswered items remain unassessed; template migration cannot convert them to acceptable. Preserve wording/version even when a later template improves phrasing.

## Other supported input shapes

- **Version 2 JSON:** `_meta`, `client`, `panels[]`, `activePanelIndex` as mapped above.
- **Earlier single-panel JSON:** wrap top-level `inspectionData`, `panel`, `header`, `circuitCount`, and notes as one equipment record, preserving all original paths. Validate with a synthetic single-panel fixture because the supplied saved JSON is version 2.
- **Legacy HTML:** extract only the `application/json` script with ID `embeddedState` as inert text. Parse data without executing JavaScript, mounting the document, fetching remote images, or injecting its HTML into the app. Compare relevant statically represented form values separately and surface differences; saved embedded state remains authoritative unless the user explicitly resolves a discrepancy.

## New fields that are not recoverable source facts

HQ account assignment/reviewer, division authorization, job/call ID, new priority/category, review disposition, access/load limitations not actually recorded, explicit voltage conductor pairs where ambiguous, immutable issue/revision metadata, permit links and jurisdiction results are new inputs. Create them blank or with explicitly chosen values; never present defaults as recovered observations.

The source functions `calculateTemperatureScore` and `calculateVoltageScore` return 100 with no readings (HTML lines 4286 and 4358 in this archive). Preserve that algorithm only as historical provenance. Do not use it for the new condition result. `calculateAmpacityCompletionScore` is completeness, not a conductor/breaker compliance check. No automated engineering thresholds are adopted by this mapping.

## Import acceptance sequence

1. Check version, byte/type/size/image limits and complete payload shape before writes.
2. Compute exact source hash and canonical saved-state fingerprint; compare only within authorized scope. Warn on duplicate content without disclosing inaccessible records.
3. Preview historical client/site, panel/circuit counts, findings, dates, missing measurements, duplicate representations and unknown fields. Do not expose real customer content in public screenshots or fixtures.
4. User chooses authorized parent/department and confirms mapping warnings. Reviewer priority may remain pending in a draft, but must be resolved before issue.
5. Commit normalized rows, provenance and request receipt atomically; reserve/upload/finalize evidence separately with explicit recoverable status.
6. Exact retry returns the same inspection. A duplicate-source override, if supported, is an explicit audited new inspection, never a silent overwrite.
7. Export the normalized supported representation plus provenance, then compare every original source value against the protected archival payload. Test zeros, empty strings, nulls, unexpected enums, duplicate panel names and out-of-range populated circuits.

The integrity checks above were completed. The importer, full per-value round-trip, HTML form-discrepancy detector, file upload, report rendering and authenticated field pilot remain implementation/acceptance work.
