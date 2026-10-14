import { useAuth } from '@clerk/clerk-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';
import { EosWorkspaceContent } from './EosWorkspaceContent.jsx';

export function EosWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const call = useCallback(async (fn) => withSupabaseTokenRetry(getToken, fn), [getToken]);
  return <EosWorkspaceContent permissions={permissions} call={call} navigate={navigate} />;
}
