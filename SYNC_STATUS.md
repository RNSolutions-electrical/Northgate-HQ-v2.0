# Northgate HQ Cross-Machine Sync Status

This file is the repository-visible source of truth for Codex handoffs between machines.

## Current durable sync marker

- Marker: `ONYX-BEACON-20260827-001`
- Feature commit: `9ec9e782c893bfad7c70224454b5d0bfb26e8fff`
- GitHub branch: `main`
- Production deploy: `6a8fa3a848fd9a783e22dbb4`
- Production URL: `https://rnsolutions.net/northgate/`
- Verified: August 27, 2026 (America/New_York)

The feature commit includes the Service Performance JWT timing fix and the Jobs/Service Calls directory separation. Regular Jobs are the default Jobs-page view; Service Calls require selecting their tab.

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

- `TEAL-MERIDIAN-20260826` — feature commit `9ec9e78`; originally task-only, made discoverable by `ONYX-BEACON-20260827-001`.
