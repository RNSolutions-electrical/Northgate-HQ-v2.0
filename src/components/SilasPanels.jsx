import { MessageSquare, Sparkles, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { StatePanel } from './ui/StatePanel.jsx';
import { WorkspaceHeader } from './ui/WorkspaceHeader.jsx';
import { SILAS_DISABLED_HELPER_COPY, SILAS_EMPTY_HELPER_COPY } from '../hooks/useSilas.js';

function formatTimestamp(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '';
  }
}

function SilasMessageList({
  messages,
  isLoading,
  isSending,
  activeConversationId,
}) {
  const scrollContainerRef = useRef(null);
  const scrollAnchorRef = useRef(null);
  const isPinnedToBottomRef = useRef(true);
  const previousConversationIdRef = useRef(activeConversationId);

  function updatePinnedState() {
    const node = scrollContainerRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    isPinnedToBottomRef.current = distanceFromBottom <= 80;
  }

  function scrollToLatest() {
    scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
  }

  useLayoutEffect(() => {
    const conversationChanged = previousConversationIdRef.current !== activeConversationId;
    const shouldAutoScroll = conversationChanged || isSending || isPinnedToBottomRef.current;

    if (shouldAutoScroll) {
      scrollToLatest();
    }

    previousConversationIdRef.current = activeConversationId;
  }, [activeConversationId, isSending, messages.length]);

  useEffect(() => {
    updatePinnedState();
  }, [messages.length]);

  if (isLoading) {
    return <p className="muted">Loading Silas conversation...</p>;
  }

  if (!messages.length) {
    return (
      <div className="silas-empty-state">
        <p>{SILAS_EMPTY_HELPER_COPY}</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollContainerRef}
        className="silas-message-list"
        onScroll={updatePinnedState}
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`silas-message silas-message--${message.role}`}
          >
            <div className="silas-message__meta">
              <strong>{message.role === 'assistant' ? 'Silas' : 'You'}</strong>
              <span>{formatTimestamp(message.createdAt)}</span>
            </div>
            <p>{message.content}</p>
            {message.suggestedAction ? (
              <div className="silas-action-placeholder">
                Action approvals are not enabled yet in Phase 1.
              </div>
            ) : null}
          </article>
        ))}
        <div ref={scrollAnchorRef} aria-hidden="true" className="silas-scroll-anchor" />
      </div>
      {isSending ? <p className="muted">Silas is responding...</p> : null}
    </>
  );
}

function SilasConversationSidebar({
  conversations,
  conversationsLoading,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}) {
  return (
    <aside className="silas-sidebar" aria-label="Silas conversations">
      <div className="silas-sidebar__header">
        <div>
          <p className="eyebrow">Conversations</p>
          <h3>Silas</h3>
        </div>
        <button type="button" className="secondary-button" onClick={onNewConversation}>
          New Chat
        </button>
      </div>
      {conversationsLoading ? <p className="muted">Loading conversations...</p> : null}
      <div className="silas-conversation-list">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className={`silas-conversation-list__item${conversation.id === activeConversationId ? ' silas-conversation-list__item--active' : ''}`}
            onClick={() => onSelectConversation(conversation.id)}
          >
            <strong>{conversation.title}</strong>
            <span>{formatTimestamp(conversation.updatedAt)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function SilasComposer({
  draftMessage,
  setDraftMessage,
  onSend,
  disabled,
  isSending,
}) {
  const textareaRef = useRef(null);
  const previousSendingRef = useRef(isSending);

  useEffect(() => {
    if (previousSendingRef.current && !isSending && !disabled) {
      try {
        textareaRef.current?.focus({ preventScroll: true });
      } catch {
        textareaRef.current?.focus();
      }
    }

    previousSendingRef.current = isSending;
  }, [disabled, isSending]);

  return (
    <form
      className="silas-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea
        ref={textareaRef}
        className="silas-composer__input"
        value={draftMessage}
        onChange={(event) => setDraftMessage(event.target.value)}
        placeholder="Ask Silas a question..."
        rows={4}
        disabled={disabled || isSending}
      />
      <div className="silas-composer__actions">
        <button
          type="submit"
          className="primary-button"
          disabled={disabled || isSending || !draftMessage.trim()}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export function SilasWorkspacePanel({
  enabled,
  settingsLoading,
  settingsError,
  conversations,
  conversationsLoading,
  activeConversationId,
  messages,
  messagesLoading,
  draftMessage,
  setDraftMessage,
  onSend,
  onSelectConversation,
  onNewConversation,
  statusMessage,
  chatError,
  isSending,
  responseSource,
}) {
  return (
    <article className="card card--wide silas-workspace">
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Silas"
        description={enabled ? SILAS_EMPTY_HELPER_COPY : SILAS_DISABLED_HELPER_COPY}
        status={<Sparkles className="card__icon" aria-hidden="true" />}
      />

      {settingsError ? <div className="alert">Silas settings failed to load.</div> : null}
      {chatError ? <div className="alert">{chatError}</div> : null}
      {statusMessage ? <p className="build-note">{statusMessage}</p> : null}
      {settingsLoading ? <p className="muted">Loading Silas settings...</p> : null}

      {!enabled && !settingsLoading ? (
        <StatePanel
          eyebrow="Unavailable"
          title="Silas is disabled"
          description={SILAS_DISABLED_HELPER_COPY}
          tone="warning"
        />
      ) : !settingsLoading ? (
        <div className="silas-shell">
          <SilasConversationSidebar
            conversations={conversations}
            conversationsLoading={conversationsLoading}
            activeConversationId={activeConversationId}
            onSelectConversation={onSelectConversation}
            onNewConversation={onNewConversation}
          />
          <section className="silas-chat-card">
            <SilasMessageList
              messages={messages}
              isLoading={messagesLoading}
              isSending={isSending}
              activeConversationId={activeConversationId}
            />
            <SilasComposer
              draftMessage={draftMessage}
              setDraftMessage={setDraftMessage}
              onSend={onSend}
              disabled={!enabled}
              isSending={isSending}
            />
          </section>
        </div>
      ) : null}
    </article>
  );
}

export function SilasBubble({
  enabled,
  isOpen,
  onOpen,
  onClose,
  conversations,
  activeConversationId,
  messages,
  messagesLoading,
  draftMessage,
  setDraftMessage,
  onSend,
  onSelectConversation,
  statusMessage,
  chatError,
  isSending,
}) {
  if (!enabled) return null;

  return (
    <div className={`silas-bubble${isOpen ? ' silas-bubble--open' : ''}`}>
      {isOpen ? (
        <section className="silas-bubble__panel" aria-label="Silas quick chat">
          <div className="silas-bubble__header">
            <div>
              <p className="eyebrow">Silas</p>
              <h3>Quick Chat</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              aria-label="Close Silas quick chat"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          {chatError ? <div className="alert">{chatError}</div> : null}
          {statusMessage ? <p className="build-note">{statusMessage}</p> : null}
          {conversations.length ? (
            <div className="silas-bubble__conversation-strip">
              {conversations.slice(0, 5).map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`silas-chip${conversation.id === activeConversationId ? ' silas-chip--active' : ''}`}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  {conversation.title}
                </button>
              ))}
            </div>
          ) : null}
          <SilasMessageList
            messages={messages}
            isLoading={messagesLoading}
            isSending={isSending}
            activeConversationId={activeConversationId}
          />
          <SilasComposer
            draftMessage={draftMessage}
            setDraftMessage={setDraftMessage}
            onSend={onSend}
            disabled={!enabled}
            isSending={isSending}
          />
        </section>
      ) : null}
      <button
        type="button"
        className="silas-bubble__trigger"
        onClick={isOpen ? onClose : onOpen}
        aria-label={isOpen ? 'Close Silas quick chat' : 'Open Silas quick chat'}
      >
        <MessageSquare aria-hidden="true" />
        <span>Silas</span>
      </button>
    </div>
  );
}
