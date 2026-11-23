import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FinancialsLanding } from '../../src/modules/jobs/FinancialsLanding.jsx';
import { financialContractSummary } from '../../src/modules/jobs/financialsLanding.js';
import '../../src/styles/base.css';

function Fixture() {
  const [posted, setPosted] = useState(false);
  const [position, setPosition] = useState('');
  const contract = financialContractSummary({
    original: 100000,
    changeOrders: [{ id: 'synthetic', price_amount: 10000, status: 'approved' }],
    sovLines: [{ scheduled_value_amount: 100000, approved_change_amount: posted ? 10000 : 0 }],
  });
  return <main style={{ padding: 12 }}>
    <FinancialsLanding contract={contract} budget={{ detailed: 100000, execution: 75000, actual: 45000, remaining: 30000 }}
      billing={{ billed: 33000 }} forecasting={{ completion: 73000 }} canViewDetailed
      onDetails={() => setPosition('Budget lines')} onBilling={() => setPosition('SOV & Billing')}
      onChangeOrders={() => setPosition('Approved changes')} onForecast={() => setPosition('Financials Workspace')}
      onQuickForecast={() => setPosition('Quick forecast')} />
    <button type="button" onClick={() => setPosted(true)}>Simulate SOV post</button>
    <output aria-label="Selected tool">{position}</output>
  </main>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
