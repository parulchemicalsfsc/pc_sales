import React, { useEffect, useRef } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Avatar,
} from "@mui/material";
import type { ChatMessage, AppUser, Conversation } from "../../hooks/useChat";
import MessageBubble, { DateDivider } from "./MessageBubble";

interface MessageThreadProps {
  conversation: Conversation | null;
  messages: ChatMessage[];
  loading: boolean;
  currentUserEmail: string;
  users: AppUser[];
  canDeleteAsAdmin?: boolean;
  onEdit?: (messageId: number, newContent: string) => Promise<{ success: boolean; error?: string }>;
  onDelete?: (messageId: number) => Promise<{ success: boolean; error?: string }>;
  loadingConvs?: boolean;
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function MessageThread({
  conversation,
  messages,
  loading,
  currentUserEmail,
  users,
  canDeleteAsAdmin = false,
  onEdit,
  onDelete,
  loadingConvs = false,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // While conversations are still being fetched from Supabase, show a spinner
  // instead of the "Select a conversation" placeholder — avoids a confusing flash
  if (loadingConvs || (!conversation && loading)) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 2,
          color: "text.secondary",
        }}
      >
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary">
          Loading chats…
        </Typography>
      </Box>
    );
  }

  if (!conversation) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 2,
          color: "text.secondary",
        }}
      >
        <Typography variant="h6">Select a conversation</Typography>
        <Typography variant="body2">
          Choose from the left or start a new message
        </Typography>
      </Box>
    );
  }

  const convTitle =
    conversation.type === "group"
      ? conversation.name || "Team Chat"
      : conversation.partner?.name ||
        conversation.partner?.email?.split("@")[0] ||
        "Direct Message";

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Thread Header */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          bgcolor: "background.paper",
          flexShrink: 0,
        }}
      >
        {conversation.type === "group" ? (
          <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36, fontSize: "1rem" }}>
            #
          </Avatar>
        ) : (
          <Avatar sx={{ bgcolor: "secondary.main", width: 36, height: 36, fontSize: "0.9rem" }}>
            {convTitle.charAt(0).toUpperCase()}
          </Avatar>
        )}
        <Box>
          <Typography fontWeight={600} variant="subtitle1" lineHeight={1.2}>
            {convTitle}
          </Typography>
          {conversation.type === "group" && (
            <Typography variant="caption" color="text.secondary">
              {users.length} members
            </Typography>
          )}
          {conversation.type === "direct" && conversation.partner && (
            <Typography variant="caption" color="text.secondary">
              {conversation.partner.email}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          py: 1,
          display: "flex",
          flexDirection: "column",
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            borderRadius: 3,
            bgcolor: "divider",
          },
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : messages.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "text.secondary",
              gap: 1,
            }}
          >
            <Typography variant="body2">No messages yet</Typography>
            <Typography variant="caption">
              {conversation.type === "group"
                ? "Say hi to the team! 👋"
                : `Start a conversation with ${convTitle}`}
            </Typography>
          </Box>
        ) : (
          messages.map((msg, idx) => {
            const prevMsg = messages[idx - 1];
            const showDate = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
            return (
              <React.Fragment key={msg.message_id}>
                {showDate && <DateDivider date={msg.created_at} />}
                <MessageBubble
                  message={msg}
                  isOwn={msg.sender_email === currentUserEmail}
                  users={users}
                  canDeleteAsAdmin={canDeleteAsAdmin}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </React.Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </Box>
    </Box>
  );
}
