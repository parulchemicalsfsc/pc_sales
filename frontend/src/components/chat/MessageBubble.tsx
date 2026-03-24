import React, { useMemo } from "react";
import { Box, Avatar, Typography, Chip, useTheme } from "@mui/material";
import type { ChatMessage, AppUser } from "../../hooks/useChat";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  users: AppUser[];
}

/** Highlight @Name mentions in the message text */
function renderContent(content: string, mentions: string[], users: AppUser[]) {
  // Build a map: name fragment → email for mentioned users
  const mentionNames = mentions.map((email) => {
    const u = users.find((u) => u.email === email);
    return u?.name || email.split("@")[0];
  });

  if (mentionNames.length === 0) return <span>{content}</span>;

  // Split on @Name patterns
  const pattern = new RegExp(`(@(?:${mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  const parts = content.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const isMention = mentionNames.some((n) => part === `@${n}`);
        return isMention ? (
          <Box
            key={i}
            component="span"
            sx={{
              fontWeight: 600,
              bgcolor: "primary.main",
              color: "#fff",
              px: 0.5,
              py: 0.1,
              borderRadius: 0.5,
              fontSize: "inherit",
            }}
          >
            {part}
          </Box>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface DateDividerProps {
  date: string;
}
export function DateDivider({ date }: DateDividerProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        my: 2,
        px: 2,
      }}
    >
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
        {formatDate(date)}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    </Box>
  );
}

export default function MessageBubble({ message, isOwn, users }: MessageBubbleProps) {
  const theme = useTheme();
  const initials = (message.sender_name || message.sender_email)
    .charAt(0)
    .toUpperCase();

  // Color avatar consistently per sender
  const avatarColor = useMemo(() => {
    const colors = [
      "#7B61FF", "#00B37E", "#E7515A", "#FF9800", "#2196F3",
      "#9C27B0", "#F06292", "#26C6DA", "#8D6E63",
    ];
    let hash = 0;
    for (const ch of message.sender_email) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
    return colors[hash % colors.length];
  }, [message.sender_email]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isOwn ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: 1,
        px: 2,
        mb: 0.5,
      }}
    >
      {/* Avatar */}
      {!isOwn && (
        <Avatar
          sx={{
            width: 32,
            height: 32,
            fontSize: "0.8rem",
            bgcolor: avatarColor,
            flexShrink: 0,
          }}
        >
          {initials}
        </Avatar>
      )}

      {/* Bubble */}
      <Box sx={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
        {/* Sender name (only for others in group) */}
        {!isOwn && (
          <Typography
            variant="caption"
            sx={{
              color: avatarColor,
              fontWeight: 600,
              mb: 0.3,
              ml: 0.5,
            }}
          >
            {message.sender_name || message.sender_email.split("@")[0]}
          </Typography>
        )}

        <Box
          sx={{
            bgcolor: isOwn
              ? "primary.main"
              : theme.palette.mode === "dark"
              ? "rgba(255,255,255,0.07)"
              : "rgba(0,0,0,0.05)",
            color: isOwn ? "#fff" : "text.primary",
            px: 1.5,
            py: 1,
            borderRadius: isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            wordBreak: "break-word",
            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          }}
        >
          <Typography variant="body2" component="div" sx={{ lineHeight: 1.5 }}>
            {renderContent(message.content, message.mentions, users)}
          </Typography>
        </Box>

        {/* Timestamp */}
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ mt: 0.3, mx: 0.5, fontSize: "0.7rem" }}
        >
          {formatTime(message.created_at)}
        </Typography>
      </Box>
    </Box>
  );
}

export { formatDate };
