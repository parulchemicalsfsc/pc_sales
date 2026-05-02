import React from "react";
import { Box } from "@mui/material";
import { useChat } from "../../hooks/useChat";
import { useAuth } from "../../contexts/AuthContext";
import { PERMISSIONS } from "../../config/permissions";

import MessageThread from "./MessageThread";
import MessageInput from "./MessageInput";


interface ChatPanelProps {
  currentUserEmail: string;
}

export default function ChatPanel({ currentUserEmail }: ChatPanelProps) {
  const { hasPermission } = useAuth();

  React.useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const {
    conversations,
    activeConvId,
    messages,
    users,
    loadingConvs,
    loadingMsgs,
    sendingMsg,
    switchConversation,
    sendMessage,
    editMessage,
    deleteMessage,
  } = useChat(currentUserEmail);

  const activeConv = conversations.find((c) => c.conversation_id === activeConvId) ?? null;

  /** True when the logged-in user holds the moderator delete permission */
  const canDeleteAsAdmin = hasPermission(PERMISSIONS.DELETE_MESSAGE);

  return (
    <Box
      sx={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <MessageThread
          conversation={activeConv}
          messages={messages}
          loading={loadingMsgs || loadingConvs}
          currentUserEmail={currentUserEmail}
          users={users}
          canDeleteAsAdmin={canDeleteAsAdmin}
          onEdit={editMessage}
          onDelete={deleteMessage}
          loadingConvs={loadingConvs}
        />
        {activeConv && (
          <MessageInput
            onSend={sendMessage}
            disabled={sendingMsg}
            users={users}
            currentUserEmail={currentUserEmail}
            allowMentions={activeConv.type === "group"}
          />
        )}
      </Box>
    </Box>
  );
}
