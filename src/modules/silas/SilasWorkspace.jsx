import { useSilas } from '../../hooks/useSilas.js';
import { SilasWorkspacePanel } from './SilasPanels.jsx';

export function SilasWorkspace({ permissions }) {
  const silas = useSilas({ permissions });

  return (
    <SilasWorkspacePanel
      enabled={silas.canUseSilas}
      settingsLoading={silas.settingsLoading}
      settingsError={silas.settingsError}
      conversations={silas.conversations}
      conversationsLoading={silas.conversationsLoading}
      activeConversationId={silas.activeConversationId}
      messages={silas.messages}
      messagesLoading={silas.messagesLoading}
      draftMessage={silas.draftMessage}
      setDraftMessage={silas.setDraftMessage}
      onSend={silas.sendMessage}
      onSelectConversation={silas.setActiveConversationId}
      onNewConversation={silas.startNewConversation}
      statusMessage={silas.statusMessage}
      chatError={silas.chatError}
      isSending={silas.isSending}
      responseSource={silas.responseSource}
    />
  );
}
