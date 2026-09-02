import { useAuth } from '@clerk/clerk-react';
import * as XLSX from 'xlsx';
import { useEffect, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

function normalizeRows(rows) {
  return rows.map((row, index) => {
    const division = String(row.Division ?? row.division ?? row.division_name ?? '').trim();
    const code = String(row['Cost Code'] ?? row.cost_code ?? '').trim();
    const description = String(row.Name ?? row.description ?? '').trim();
    return {
      division_code: String(row.division_code ?? division.match(/^\d{2}/)?.[0] ?? '').trim(),
      division_name: division.replace(/^\d{2}\s*/, '').trim(),
      subdivision_name: String(row['Sub-Division'] ?? row.subdivision_name ?? '').trim().replace(/^-$/, ''),
      cost_code: code,
      description: description === 'N/A' ? division.replace(/^\d{2}\s*/, '').trim() : description,
      notes: String(row.Notes ?? row.notes ?? '').trim().replace(/^N\/A$/i, ''),
      category: String(row.category ?? (description.toLowerCase() === 'fee' ? 'ohp_fee' : 'other')).trim(),
      is_protected_financial: row.is_protected_financial === true || description.toLowerCase() === 'fee',
      sort_order: Number(row.sort_order) || index + 1,
    };
  }).filter((row) => row.cost_code && row.cost_code.toUpperCase() !== 'N/A' && row.division_code && row.division_name && row.description);
}

export function FinancialLineCatalogueConsole() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState({ loading: false, error: null, success: '' });
  async function client() { return createSupabaseClient(await getToken({ template: 'supabase' })); }
  async function reload() {
    try { const db = await client(); const { data, error } = await db.from('financial_line_catalogue').select('id,division_code,division_name,cost_code,description,is_active,sort_order').eq('is_active', true).order('sort_order'); if (error) throw error; setRows(data || []); } catch (error) { setAction({ loading: false, error, success: '' }); }
  }
  useEffect(() => { reload(); }, []);
  async function importFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setAction({ loading: true, error: null, success: '' });
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const parsed = normalizeRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }));
      if (!parsed.length) throw new Error('No valid financial lines were found. Required columns are Division, Cost Code, and Name.');
      const db = await client();
      const { data, error } = await db.rpc('replace_financial_line_catalogue', { p_rows: parsed, p_reason: reason.trim() || `Developer catalogue import: ${file.name}` });
      if (error) throw error;
      setAction({ loading: false, error: null, success: `${data} catalogue line(s) imported or updated. Existing catalogue entries were not retired.` }); await reload();
    } catch (error) { setAction({ loading: false, error, success: '' }); }
  }
  function exportFile() {
    const sheet = XLSX.utils.json_to_sheet(rows.map(({ division_code, division_name, cost_code, description, sort_order }) => ({ Division: `${division_code} ${division_name}`, 'Cost Code': cost_code, Name: description, 'Sort Order': sort_order })));
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Cost Codes'); XLSX.writeFile(workbook, 'Northgate Financial Line Catalogue.xlsx');
  }
  return <section className="developer-console-page" aria-label="Financial line catalogue"><Toolbar eyebrow="Developer" title="Financial Line Catalogue" description="Export the shared template or import a corrected workbook. Imports add or update exact cost codes; retirement is always a separate, explicit action." actions={<button type="button" className="secondary-button" onClick={exportFile} disabled={!rows.length}>Export Catalogue</button>} /><div className="developer-note-form__grid"><label className="developer-note-form__wide"><span>Audit reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this catalogue is being updated" /></label><label className="developer-note-form__wide"><span>Import .xlsx or .csv</span><input type="file" accept=".xlsx,.xls,.csv" onChange={importFile} disabled={action.loading} /></label></div><p className="developer-audit-export__note">{rows.length} active catalogue lines. Importing does not remove any existing line; use an explicit retirement workflow when a code should no longer be available.</p>{action.error ? <StatePanel tone="danger" eyebrow="Catalogue Import Failed" title="Financial-line catalogue was not updated" description={action.error.message || 'Unexpected error.'} compact /> : null}{action.success ? <StatePanel tone="success" eyebrow="Catalogue Updated" title="Financial-line catalogue saved" description={action.success} compact /> : null}</section>;
}
