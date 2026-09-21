import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20260921143000_estimate_review_tasks_and_linked_proposals.sql',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../src/modules/dashboard/DashboardWorkspace.jsx',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/components/layout/AppLayout.jsx',import.meta.url),'utf8');

test('estimate submission preserves project work and splits shared proposals into review destinations',()=>{
 assert.match(migration,/working_copy\.payload-'reviewProposals'/);
 assert.match(migration,/'shared_assembly'/);
 assert.match(migration,/'catalogue_updates'/);
 assert.match(migration,/'V3-012'/);
 assert.match(migration,/public\.submit_v5_working_copy/);
 assert.match(migration,/apply_v5_estimate_linked_destination/);
 assert.match(migration,/complete_v5_destination_application/);
});

test('review inbox is permission evaluated and appears in the bell and Pulse',()=>{
 assert.match(migration,/current_scoped_authorization_decision\(destination\.action_id,destination\.scope_context\)/);
 assert.match(shell,/useReviewTasks/);
 assert.match(shell,/reviewDestinationId/);
 assert.match(dashboard,/Assigned reviews/);
 assert.match(dashboard,/reviewTaskGroups/);
});
