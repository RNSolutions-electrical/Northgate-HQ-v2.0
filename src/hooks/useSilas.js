import { useAuth } from '@clerk/clerk-react';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

export const SILAS_EMPTY_HELPER_COPY = 'Silas can answer questions about anything you have access to and can help with tasks like logging receipts. Silas never makes changes without your approval, and can only do what you\'re already permitted to do.';
export const SILAS_DISABLED_HELPER_COPY = 'Silas is currently unavailable. Contact a Developer if you believe this is unexpected.';

function normalizeConversation(row) {
  return {
    id: row.id,
    division: row.division,
    title: row.title || 'Untitled conversation',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    division: row.division,
    createdAt: row.created_at,
    role: row.role,
    content: row.content,
    suggestedAction: row.suggested_action,
    actionStatus: row.action_status,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
  };
}

function buildConversationTitle(message) {
  const collapsed = String(message || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'New conversation';
  return collapsed.length > 72 ? `${collapsed.slice(0, 69)}...` : collapsed;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function useSilas({ permissions }) {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [chatError, setChatError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [responseSource, setResponseSource] = useState('');

  const isSignedIn = Boolean(permissions?.isSignedIn && permissions?.userId);
  const canAccessDeveloper = Boolean(
    permissions?.permissionSource === 'server' && permissions?.canAccessDeveloper,
  );
  const silasEnabled = Boolean(settings?.silas_enabled);
  const silasSettingId = settings?.id ?? null;
  const canUseSilas = isSignedIn && silasEnabled;

  async function createAuthedClient() {
    const token = await getToken({ template: 'supabase' });
    return {
      token,
      client: createSupabaseClient(token),
    };
  }

  async function loadSettings({ preserveMessage = false } = {}) {
    if (!isSignedIn) {
      setSettings(null);
      setSettingsLoading(false);
      setSettingsError(null);
      return;
    }

    setSettingsLoading(true);
    setSettingsError(null);
    if (!preserveMessage) {
      setStatusMessage('');
      setChatError('');
    }

    try {
      const { client } = await createAuthedClient();
      const { data, error } = await client
        .from('silas_settings')
        .select('id,silas_enabled,updated_at,updated_by')
        .limit(1)
        .single();

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error('Silas settings load failed', error);
      setSettings(null);
      setSettingsError(error);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadConversations({ preserveSelection = true } = {}) {
    if (!canUseSilas) {
      setConversations([]);
      setConversationsLoading(false);
      if (!silasEnabled) {
        setMessages([]);
        setActiveConversationId(null);
      }
      return;
    }

    setConversationsLoading(true);

    try {
      const { client } = await createAuthedClient();
      const { data, error } = await client
        .from('silas_conversations')
        .select('id,division,title,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const next = (data ?? []).map(normalizeConversation);
      setConversations(next);
      setActiveConversationId((current) => {
        if (preserveSelection && current && next.some((row) => row.id === current)) {
          return current;
        }
        return next[0]?.id ?? null;
      });
    } catch (error) {
      console.error('Silas conversations load failed', error);
      setConversations([]);
      setChatError('Silas conversations failed to load.');
    } finally {
      setConversationsLoading(false);
    }
  }

  async function loadMessages(conversationId) {
    if (!canUseSilas || !conversationId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);

    try {
      const { client } = await createAuthedClient();
      const { data, error } = await client
        .from('silas_messages')
        .select('id,conversation_id,division,created_at,role,content,suggested_action,action_status,approved_at,approved_by')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setMessages((data ?? []).map(normalizeMessage));
    } catch (error) {
      console.error('Silas messages load failed', error);
      setMessages([]);
      setChatError('Silas message history failed to load.');
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [isSignedIn, permissions?.userId]);

  useEffect(() => {
    if (!silasEnabled) {
      setConversations([]);
      setMessages([]);
      setActiveConversationId(null);
      return;
    }

    loadConversations();
  }, [canUseSilas, silasEnabled]);

  useEffect(() => {
    loadMessages(activeConversationId);
  }, [activeConversationId, canUseSilas]);

  const activeConversation = useMemo(
    () => conversations.find((row) => row.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  async function startConversation(client, messageText) {
    const division = permissions?.division ?? 'Unassigned';
    const title = buildConversationTitle(messageText);
    const { data, error } = await client
      .from('silas_conversations')
      .insert({
        division,
        user_id: permissions.userId,
        title,
      })
      .select('id,division,title,created_at,updated_at')
      .single();

    if (error) throw error;

    const nextConversation = normalizeConversation(data);
    setConversations((current) => [nextConversation, ...current.filter((row) => row.id !== nextConversation.id)]);
    setActiveConversationId(nextConversation.id);
    return nextConversation;
  }

  async function sendMessage() {
    const messageText = draftMessage.trim();
    if (!messageText || isSending || !isSignedIn) return;
    if (!silasEnabled) {
      setChatError(SILAS_DISABLED_HELPER_COPY);
      return;
    }

    setIsSending(true);
    setStatusMessage('');
    setChatError('');
    setResponseSource('');

    try {
      const { client, token } = await createAuthedClient();
      const conversation = activeConversation ?? await startConversation(client, messageText);

      const { error: insertUserError } = await client.from('silas_messages').insert({
        conversation_id: conversation.id,
        division: conversation.division,
        role: 'user',
        content: messageText,
      });

      if (insertUserError) throw insertUserError;

      setDraftMessage('');
      await loadMessages(conversation.id);
      await loadConversations();

      const response = await fetch('/api/silas-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          message: messageText,
        }),
      });

      const payload = await parseJson(response);
      if (!response.ok) {
        const messageForUser =
          payload.reason === 'missing_api_key' && canAccessDeveloper
            ? 'Silas is missing the SILAS_ANTHROPIC_API_KEY Netlify environment variable.'
            : payload.reason === 'claude_unavailable' && canAccessDeveloper && payload.details
              ? `Silas Claude request failed: ${payload.details}`
            : payload.reason === 'silas_disabled'
              ? SILAS_DISABLED_HELPER_COPY
              : payload.message || 'Silas chat request failed.';
        throw new Error(messageForUser);
      }

      setResponseSource(payload.responseSource || '');
      await loadMessages(conversation.id);
      await loadConversations();
      setStatusMessage('Silas response saved.');
    } catch (error) {
      console.error('Silas send failed', error);
      setResponseSource('');
      setChatError(error?.message || 'Silas could not send that message.');
    } finally {
      setIsSending(false);
    }
  }

  async function toggleSilasEnabled(nextValue) {
    if (!canAccessDeveloper || !silasSettingId || isUpdatingSettings) return;

    setIsUpdatingSettings(true);
    setStatusMessage('');
    setChatError('');

    try {
      const { client } = await createAuthedClient();
      const { data, error } = await client
        .from('silas_settings')
        .update({
          silas_enabled: Boolean(nextValue),
          updated_by: permissions.userId,
        })
        .eq('id', silasSettingId)
        .select('id,silas_enabled,updated_at,updated_by')
        .single();

      if (error) throw error;
      setSettings(data);
      if (!data.silas_enabled) {
        setStatusMessage('Silas disabled.');
        setMessages([]);
        setActiveConversationId(null);
      } else {
        setStatusMessage('Silas enabled.');
        await loadConversations({ preserveSelection: false });
      }
    } catch (error) {
      console.error('Silas settings update failed', error);
      setChatError('Silas setting update failed.');
    } finally {
      setIsUpdatingSettings(false);
    }
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setStatusMessage('');
    setChatError('');
  }

  return {
    settings,
    settingsError,
    settingsLoading,
    silasEnabled,
    silasSettingId,
    canAccessDeveloper,
    canUseSilas,
    conversations,
    conversationsLoading,
    activeConversationId,
    activeConversation,
    setActiveConversationId,
    messages,
    messagesLoading,
    draftMessage,
    setDraftMessage,
    statusMessage,
    chatError,
    isSending,
    isUpdatingSettings,
    responseSource,
    loadSettings,
    sendMessage,
    toggleSilasEnabled,
    startNewConversation,
  };
}
