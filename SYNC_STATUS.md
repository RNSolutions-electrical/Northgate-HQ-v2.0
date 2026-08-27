# Northgate HQ Cross-Machine Sync Status

This file is the repository-visible source of truth for Codex handoffs between machines.

## Current durable sync marker

- Marker: `CITRINE-MENU-20260827-001`
- Feature commit: `d235a3a`
- GitHub branch: `main`
- Production deploy: `6a904f04012805ac0160bf30`
- Production URL: `https://rnsolutions.net/northgate/`
- Verified: August 27, 2026 (America/New_York)

The hierarchy feature commit establishes the official Page/Card/Module/Function vocabulary,
Department terminology for Northgate organizational scope, Inventory and Add-On
Tools navigation groups, Developer Display Controls, canonical roles through
Director, and server-enforced Protected Project Financials.

The current marker additionally records the desktop grouped-navigation fix: the
Inventory and Add-On Tools menus must remain visible and selectable below the
header rather than being clipped by the navigation container.

## Superseded task-only marker

`TEAL-MERIDIAN-20260826` was reported in a Codex task but was not committed to the repository. It is retained here so machines searching for that marker can resolve it to the feature commit above.

## Required sync procedure

Before continuing Northgate HQ work on any machine:

1. Fetch `origin/main`.
2. Read this file and report the current durable marker.
3. Confirm the local base contains the feature commit listed above.
4. Preserve unrelated local work; do not reset or overwrite it to synchronize.

Every future completed cross-machine synchronization must replace the current marker with a new unique marker and retain the prior marker in the history section below.

## Marker history

- `OPAL-GATEWAY-20260827-001` — production record for the final terminology-overlay deployment, commit `273226d`.
- `AMBER-ANCHOR-20260827-001` — activates undefined UI review markers, commit `4ef95ae`.
- `TOPAZ-HARBOR-20260827-001` — production record for the hierarchy cleanup deployment.
- `MOONSTONE-RELAY-20260827-001` — repository sync record for feature commit `2268e16`.
- `SABLE-COMPASS-20260827` — feature implementation commit `2268e16`.
- `ONYX-BEACON-20260827-001` — feature commit `9ec9e78`; durable repository status established.
- `TEAL-MERIDIAN-20260826` — feature commit `9ec9e78`; originally task-only, made discoverable by `ONYX-BEACON-20260827-001`.
