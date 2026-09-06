import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PermissionTemplateEditor, UserPermissionTemplateEditor } from '../../src/modules/developer/PermissionTemplates.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';

const options = [
  { flag: 'can_estimate', group: 'Financials and estimates', label: 'Estimate' },
  { flag: 'can_view_protected_project_financials', group: 'Financials and estimates', label: 'View Protected Project Financials' },
  { flag: 'can_create_jobs', group: 'Jobs', label: 'Create Jobs' },
];
const initial = { id: 'template-1', name: 'Electrical / User', permissions: { can_estimate: false, can_view_protected_project_financials: false, can_create_jobs: false }, version: 1, default_role: 'User', default_division: 'Electrical', linked_users: 2 };
window.testCalls = [];
window.failNextSave = false;
function Fixture() {
  const [templates, setTemplates] = useState([initial]);
  const [assignments, setAssignments] = useState({});
  const [user, setUser] = useState({ user_id: 'test-user', role: 'User', division: 'Electrical', active_overrides: [], base_permissions: initial.permissions });
  const service = {
    templates, assignments, isLoading: false, error: null, reload: async () => {},
    rpc: async (name, params) => {
      window.testCalls.push({ name, params });
      if (window.failNextSave) { window.failNextSave = false; throw new Error('Template changed since you opened it. Reload before saving.'); }
      if (name === 'save_permission_template') {
        const saved = { id: params.p_id || 'template-2', name: params.p_name, permissions: params.p_permissions, version: (params.p_expected_version || 0)+1, linked_users: 2 };
        setTemplates((rows) => [...rows.filter((r) => r.id !== saved.id), saved]);
        return saved;
      }
      setAssignments({ 'test-user': params.p_template_id });
      setUser((u) => ({ ...u, active_overrides: Object.entries(params.p_overrides).map(([permission_flag,granted]) => ({ permission_flag,granted })) }));
    },
  };
  return <main style={{ padding: '16px', maxWidth: '1100px', margin: 'auto' }}>
    <PermissionTemplateEditor service={service} options={options} />
    <UserPermissionTemplateEditor user={user} service={service} options={options} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
