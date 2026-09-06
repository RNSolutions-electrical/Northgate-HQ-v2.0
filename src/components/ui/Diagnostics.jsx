import { createContext, useContext } from 'react';

export const DiagnosticsContext = createContext(false);
export function DiagnosticsProvider({ permissions, enabled, children }) {
  const visible = permissions?.permissionSource === 'server' && permissions?.canAccessDeveloper === true && enabled === true;
  return <DiagnosticsContext.Provider value={visible}>{children}</DiagnosticsContext.Provider>;
}
export function useDiagnostics() { return useContext(DiagnosticsContext); }
export function Diagnostics({ children }) {
  return useDiagnostics() ? children : null;
}
