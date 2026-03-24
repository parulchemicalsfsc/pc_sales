import React from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Badge,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import { Add as AddIcon, Group as GroupIcon } from "@mui/icons-material";
import type { Conversation } from "../../hooks/useChat";

interface ConversationListProps {
  conversations: Conversation[];
  activeConvId: number | null;
  onSelect: (id: number) => void;
  onNewDM: () => void;
  loading: boolean;
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ConversationList({
  conversations,
  activeConvId,
  onSelect,
  onNewDM,
  loading,
}: ConversationListProps) {
  const group = conversations.find((c) => c.type === "group");
  const dms = conversations.filter((c) => c.type === "direct");

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography fontWeight={700} variant="subtitle1">
          Messages
        </Typography>
        <Tooltip title="New Direct Message">
          <IconButton size="small" onClick={onNewDM} color="primary">
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ overflowY: "auto", flex: 1 }}>
          {/* Group Chat */}
          {group && (
            <>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 2, pt: 1.5, pb: 0.5, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Team
              </Typography>
              <List disablePadding>
                <ConvItem
                  conv={group}
                  active={activeConvId === group.conversation_id}
                  onSelect={onSelect}
                />
              </List>
              <Divider sx={{ my: 1 }} />
            </>
          )}

          {/* Direct Messages */}
          <Box
            sx={{
              px: 2,
              pt: 0.5,
              pb: 0.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Direct Messages
            </Typography>
          </Box>
          <List disablePadding>
            {dms.length === 0 ? (
              <ListItem sx={{ px: 2 }}>
                <Typography variant="caption" color="text.disabled">
                  No DMs yet — click + to start one
                </Typography>
              </ListItem>
            ) : (
              dms.map((conv) => (
                <ConvItem
                  key={conv.conversation_id}
                  conv={conv}
                  active={activeConvId === conv.conversation_id}
                  onSelect={onSelect}
                />
              ))
            )}
          </List>
        </Box>
      )}
    </Box>
  );
}

// ─── Single Conversation Row ───────────────────────────────────────────────────

function ConvItem({
  conv,
  active,
  onSelect,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  const isGroup = conv.type === "group";
  const title = isGroup
    ? conv.name || "Team Chat"
    : conv.partner?.name || conv.partner?.email?.split("@")[0] || "Unknown";

  return (
    <ListItem disablePadding>
      <ListItemButton
        selected={active}
        onClick={() => onSelect(conv.conversation_id)}
        sx={{
          px: 2,
          py: 1,
          borderRadius: 0,
          "&.Mui-selected": {
            bgcolor: "action.selected",
          },
          "&.Mui-selected:hover": {
            bgcolor: "action.selected",
          },
        }}
      >
        <ListItemAvatar sx={{ minWidth: 44 }}>
          <Badge
            badgeContent={conv.unread_count || undefined}
            color="error"
            max={99}
          >
            <Avatar
              sx={{
                width: 36,
                height: 36,
                fontSize: "0.85rem",
                bgcolor: isGroup ? "primary.main" : "secondary.main",
              }}
            >
              {isGroup ? <GroupIcon fontSize="small" /> : title.charAt(0).toUpperCase()}
            </Avatar>
          </Badge>
        </ListItemAvatar>
        <ListItemText
          primary={
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Typography
                variant="body2"
                fontWeight={conv.unread_count > 0 ? 700 : 500}
                noWrap
                sx={{ maxWidth: 140 }}
              >
                {title}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5, flexShrink: 0 }}>
                {timeAgo(conv.last_message_at)}
              </Typography>
            </Box>
          }
          secondary={
            <Typography
              variant="caption"
              color={conv.unread_count > 0 ? "text.primary" : "text.secondary"}
              fontWeight={conv.unread_count > 0 ? 600 : 400}
              noWrap
              component="span"
            >
              {conv.last_message || "No messages yet"}
            </Typography>
          }
        />
      </ListItemButton>
    </ListItem>
  );
}
