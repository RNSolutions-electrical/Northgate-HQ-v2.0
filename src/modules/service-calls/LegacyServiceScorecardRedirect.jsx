import { Navigate } from 'react-router-dom';

// Compatibility only: no old add-on component or separate permission bypass.
export function LegacyServiceScorecardRedirect() {
  return <Navigate to="/jobs" state={{directoryType:'service_calls',serviceCallView:'financials'}} replace />;
}
