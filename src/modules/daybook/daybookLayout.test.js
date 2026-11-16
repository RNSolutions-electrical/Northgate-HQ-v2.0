import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./DaybookWorkspace.jsx',import.meta.url),'utf8');
const frame=readFileSync(new URL('./daybookFrame.js',import.meta.url),'utf8');
test('compact controls retain save and recovery safeguards',()=>{
 assert.match(ui,/aria-label="About Daybook staging"/);
 const prefs=ui.slice(ui.indexOf('<details className="daybook-preferences"'),ui.indexOf('</header>'));
 assert.match(prefs,/Save to HQ/);assert.match(prefs,/Recovery history/);assert.match(prefs,/lastExport/);assert.match(prefs,/loadedBackup/);
 assert.match(ui,/role="status"/);assert.match(ui,/Unsaved changes/);assert.match(ui,/disabled=\{busy\|\|dirty\}/);
 assert.match(ui,/p_restore:restoring/);assert.match(ui,/p_personal_version:current.personal.version/);
});
test('frame grows with content rather than nested vertical viewport',()=>{
 assert.match(frame,/ResizeObserver\(reportHeight\)/);assert.match(frame,/\.layout\{min-height:0\}/);
 assert.match(ui,/Number.isFinite\(m.height\)/);assert.doesNotMatch(ui,/85vh/);
});
