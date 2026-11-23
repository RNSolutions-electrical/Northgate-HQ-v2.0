import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JobForecastPanel } from '../../src/modules/jobs/JobForecastPanel.jsx';
import '../../src/styles/base.css';

const initial = { id: 'test-forecast', cost_code: '01.01', description: 'Synthetic labor', updated_at: '2026-11-23T10:00:00Z', actual_cost_amount: 100, forecast_to_complete_amount: 7, forecast_final_amount: 120 };
function Fixture() {
  const [line, setLine] = useState(initial);
  const [open, setOpen] = useState(false);
  async function save(patches) {
    if (patches.length !== 1) throw new Error('Unexpected patch count');
    const { id, expected_updated_at, ...forecast } = patches[0];
    if (id !== line.id || expected_updated_at !== line.updated_at) throw new Error('Fixture detected a stale version');
    if (Object.keys(forecast).some((key) => !['forecast_to_complete_amount', 'forecast_final_amount'].includes(key))) throw new Error('Unexpected financial field');
    setLine({ ...line, ...forecast, updated_at: new Date().toISOString() });
  }
  return open ? <JobForecastPanel lines={[line]} onClose={() => setOpen(false)} onSave={save} /> :
    <button onClick={() => setOpen(true)}>Open Forecast</button>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
