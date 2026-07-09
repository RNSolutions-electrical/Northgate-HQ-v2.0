import { createClient } from '@supabase/supabase-js';

const DISABLED_MESSAGE = 'Silas is currently unavailable. Contact a Developer if you believe this is unexpected.';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function getBearerToken(req) {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function createUserScopedClient(accessToken) {
  const env = globalThis.Netlify?.env;
  const supabaseUrl = env?.get('SUPABASE_URL') ?? env?.get('VITE_SUPABASE_URL') ?? '';
  const supabaseAnonKey = env?.get('SUPABASE_ANON_KEY') ?? env?.get('VITE_SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase URL or anon key configuration for Silas.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function buildFallbackAssistantReply(prompt) {
  const collapsed = String(prompt || '').replace(/\s+/g, ' ').trim();
  const excerpt = collapsed.length > 140 ? `${collapsed.slice(0, 137)}...` : collapsed;
  return `Silas foundation is online. I saved your message${excerpt ? ` about "${excerpt}"` : ''} and will stay inside your existing permissions. Approve/Deny business actions, receipts, and module-specific automations are not enabled yet in Phase 1.`;
}

async function loadSilasSettings(client) {
  const { data, error } = await client
    .from('silas_settings')
    .select('id,silas_enabled')
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

async function loadConversation(client, conversationId) {
  const { data, error } = await client
    .from('silas_conversations')
    .select('id,division,title')
    .eq('id', conversationId)
    .single();

  if (error) throw error;
  return data;
}

async function loadRecentMessages(client, conversationId) {
  const { data, error } = await client
    .from('silas_messages')
    .select('role,content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(12);

  if (error) throw error;
  return data ?? [];
}

async function callAnthropic({ apiKey, promptMessages }) {
  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 350,
      system: 'You are Silas, a cautious assistant for Northgate HQ. Stay high-level, avoid claiming write authority, and do not suggest executing actions that are not explicitly enabled yet.',
      messages: promptMessages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })),
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${errorPayload}`);
  }

  const payload = await response.json();
  const textBlocks = Array.isArray(payload?.content)
    ? payload.content.filter((block) => block?.type === 'text' && block?.text)
    : [];
  const combined = textBlocks.map((block) => block.text.trim()).filter(Boolean).join('\n\n').trim();
  return combined;
}

async function insertAssistantMessage(client, conversation, content) {
  const { data, error } = await client
    .from('silas_messages')
    .insert({
      conversation_id: conversation.id,
      division: conversation.division,
      role: 'assistant',
      content,
    })
    .select('id,conversation_id,division,created_at,role,content,suggested_action,action_status,approved_at,approved_by')
    .single();

  if (error) throw error;

  const { error: touchError } = await client
    .from('silas_conversations')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  if (touchError) throw touchError;

  return data;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ message: 'Method not allowed.' }, { status: 405 });
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return json({ message: 'Authentication required.' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ message: 'Invalid JSON body.' }, { status: 400 });
  }

  const conversationId = String(body?.conversationId ?? '').trim();
  const message = String(body?.message ?? '').trim();
  if (!conversationId || !message) {
    return json({ message: 'Conversation ID and message are required.' }, { status: 400 });
  }

  try {
    const client = createUserScopedClient(accessToken);

    // The kill switch is read before any user-scoped data lookup or Claude call.
    const settings = await loadSilasSettings(client);
    if (!settings?.silas_enabled) {
      return json({ message: DISABLED_MESSAGE, reason: 'silas_disabled' }, { status: 503 });
    }

    // This read is intentionally performed with the requesting user's JWT-scoped client.
    const conversation = await loadConversation(client, conversationId);
    const promptMessages = await loadRecentMessages(client, conversationId);

    const env = globalThis.Netlify?.env;
    const apiKey = env?.get('SILAS_ANTHROPIC_API_KEY') ?? '';
    if (!apiKey) {
      return json({ message: DISABLED_MESSAGE, reason: 'missing_api_key' }, { status: 503 });
    }

    let assistantContent = '';
    let responseSource = 'claude';

    try {
      assistantContent = await callAnthropic({ apiKey, promptMessages });
      if (!assistantContent) {
        assistantContent = buildFallbackAssistantReply(message);
        responseSource = 'fallback';
      }
    } catch (error) {
      console.error('Silas Claude call failed, using foundation fallback', error);
      assistantContent = buildFallbackAssistantReply(message);
      responseSource = 'fallback';
    }

    const assistantMessage = await insertAssistantMessage(client, conversation, assistantContent);

    return json({
      assistantMessage,
      responseSource,
    });
  } catch (error) {
    console.error('Silas chat failed', error);
    return json({ message: 'Silas is currently unavailable. Contact a Developer if you believe this is unexpected.' }, { status: 500 });
  }
};

export const config = {
  path: '/api/silas-chat',
  method: ['POST'],
};
