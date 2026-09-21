import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260920231500_v5_estimate_submission_review_queue.sql',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/modules/estimates/workbench/WorkbenchRoute.jsx',import.meta.url),'utf8');
test('estimate submission wrapper fixes destination and approval action',()=>{assert.match(migration,/'destination_key','official_estimate'/);assert.match(migration,/'action_id','POL-002'/);assert.match(migration,/owner_user_id=actor FOR UPDATE/);});
test('review queue is pending, authorized and Department-scoped',()=>{assert.match(migration,/destination\.status='pending'/);assert.match(migration,/current_scoped_authorization_decision/);assert.match(migration,/reviewer\.business_role='Director'/);assert.match(migration,/reviewer\.division IS NOT DISTINCT FROM/);});
test('UI connects submission and review actions',()=>{for(const text of ['submit_v5_estimate_for_review','read_v5_estimate_task_queue','Review submissions','Promote to Official Draft','Return for Changes'])assert.match(route,new RegExp(text));});
test('UI binds decisions to exact version and hash',()=>{assert.match(route,/p_expected_version:selectedReview\.destination_version/);assert.match(route,/p_expected_payload_hash:selectedReview\.payload_hash/);assert.match(route,/apply_v5_estimate_promotion/);});
