import React, { useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { useChat } from "../../hooks/useChat";
import ConversationList from "./ConversationList";
import MessageThread from "./MessageThread";
import MessageInput from "./MessageInput";
import UserPickerModal from "./UserPickerModal";

interface ChatPanelProps {
  currentUserEmail: string;
}

export default function ChatPanel({ currentUserEmail }: ChatPanelProps) {
  const theme = useTheme();
  const [dmPickerOpen, setDmPickerOpen] = useState(false);

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
    startDM,
  } = useChat(currentUserEmail);

  const activeConv = conversations.find((c) => c.conversation_id === activeConvId) ?? null;

  return (
    <Box
      sx={{
        display: "flex",
        height: "calc(100vh - 120px)", // fill page below AppBar + padding
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: theme.shadows[2],
      }}
    >
      {/* Left: Conversation Sidebar */}
      <ConversationList
        conversations={conversations}
        activeConvId={activeConvId}
        onSelect={switchConversation}
        onNewDM={() => setDmPickerOpen(true)}
        loading={loadingConvs}
      />

      {/* Right: Thread + Input */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <MessageThread
          conversation={activeConv}
          messages={messages}
          loading={loadingMsgs}
          currentUserEmail={currentUserEmail}
          users={users}
        />
        {activeConv && (
          <MessageInput
            onSend={sendMessage}
            disabled={sendingMsg}
            users={users}
            currentUserEmail={currentUserEmail}
          />
        )}
      </Box>

      {/* DM Picker Modal */}
      <UserPickerModal
        open={dmPickerOpen}
        onClose={() => setDmPickerOpen(false)}
        onSelect={startDM}
        users={users}
        currentUserEmail={currentUserEmail}
      />
    </Box>
  );
}
