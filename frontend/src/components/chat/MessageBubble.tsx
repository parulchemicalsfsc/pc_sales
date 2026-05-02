import React, { useMemo, useState } from "react";
import {
  Box,
  Avatar,
  Typography,
  Chip,
  useTheme,
  IconButton,
  Tooltip,
  TextField,
  Stack,
  Button,
  Snackbar,
  Alert,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { ChatMessage, AppUser } from "../../hooks/useChat";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Client-side UI guard: hide edit button after this many minutes */
const EDIT_WINDOW_MS = 5 * 60 * 1000;
/** Client-side UI guard: hide delete button after this many hours */
const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Highlight @Name mentions in the message text */
function renderContent(content: string, mentions: string[], users: AppUser[]) {
  const mentionNames = mentions.map((email) => {
    const u = users.find((u) => u.email === email);
    return u?.name || email.split("@")[0];
  });

  if (mentionNames.length === 0) return <span>{content}</span>;

  const pattern = new RegExp(
    `(@(?:${mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
    "g"
  );
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
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

// ─── DateDivider ─────────────────────────────────────────────────────────────

interface DateDividerProps { date: string; }
export function DateDivider({ date }: DateDividerProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, my: 2, px: 2 }}>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
        {formatDate(date)}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    </Box>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  users: AppUser[];
  canDeleteAsAdmin?: boolean; // true when caller has delete_message permission
  onEdit?: (messageId: number, newContent: string) => Promise<{ success: boolean; error?: string }>;
  onDelete?: (messageId: number) => Promise<{ success: boolean; error?: string }>;
}

export default function MessageBubble({
  message,
  isOwn,
  users,
  canDeleteAsAdmin = false,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const theme = useTheme();

  // ── Hover / edit state ──────────────────────────────────────────────────────
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMsg, setDeletingMsg] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: "error" | "success" }>({
    open: false,
    msg: "",
    severity: "success",
  });

  // ── Time-based UI gate checks ───────────────────────────────────────────────
  const now = Date.now();
  const createdMs = new Date(message.created_at).getTime();
  const ageMs = now - createdMs;

  const canEdit = isOwn && !message.is_deleted && ageMs <= EDIT_WINDOW_MS && !!onEdit;
  const canDelete = (isOwn || canDeleteAsAdmin) && !message.is_deleted && ageMs <= DELETE_WINDOW_MS && !!onDelete;
  const showActions = (canEdit || canDelete) && !editing;

  // ── Avatar colour ────────────────────────────────────────────────────────────
  const avatarColor = useMemo(() => {
    const colors = ["#7B61FF", "#00B37E", "#E7515A", "#FF9800", "#2196F3", "#9C27B0", "#F06292", "#26C6DA", "#8D6E63"];
    let hash = 0;
    for (const ch of message.sender_email) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
    return colors[hash % colors.length];
  }, [message.sender_email]);

  const initials = (message.sender_name || message.sender_email).charAt(0).toUpperCase();

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleEditSubmit = async () => {
    if (!onEdit || !editValue.trim() || editValue.trim() === message.content) {
      setEditing(false);
      return;
    }
    setSavingEdit(true);
    const result = await onEdit(message.message_id, editValue.trim());
    setSavingEdit(false);
    if (result.success) {
      setEditing(false);
    } else {
      setSnack({ open: true, msg: result.error || "Edit failed.", severity: "error" });
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeletingMsg(true);
    const result = await onDelete(message.message_id);
    setDeletingMsg(false);
    if (!result.success) {
      setSnack({ open: true, msg: result.error || "Delete failed.", severity: "error" });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <Box
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          display: "flex",
          flexDirection: isOwn ? "row-reverse" : "row",
          alignItems: "flex-end",
          gap: 1,
          px: 2,
          mb: 0.5,
          position: "relative",
        }}
      >
        {/* Avatar — only for others */}
        {!isOwn && (
          <Avatar sx={{ width: 32, height: 32, fontSize: "0.8rem", bgcolor: avatarColor, flexShrink: 0 }}>
            {initials}
          </Avatar>
        )}

        {/* Bubble column */}
        <Box sx={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
          {/* Sender name (only for others) */}
          {!isOwn && !message.is_deleted && (
            <Typography variant="caption" sx={{ color: avatarColor, fontWeight: 600, mb: 0.3, ml: 0.5 }}>
              {message.sender_name || message.sender_email.split("@")[0]}
            </Typography>
          )}

          {/* Message bubble */}
          {message.is_deleted ? (
            // ── Deleted placeholder ─────────────────────────────────────────
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                border: "1px dashed",
                borderColor: "divider",
                color: "text.disabled",
                fontStyle: "italic",
              }}
            >
              <Typography variant="body2" sx={{ lineHeight: 1.5, color: "text.disabled" }}>
                This message was deleted
              </Typography>
            </Box>
          ) : editing ? (
            // ── Inline edit ──────────────────────────────────────────────────
            <Box sx={{ width: "100%", minWidth: 220 }}>
              <TextField
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                multiline
                fullWidth
                size="small"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                  if (e.key === "Escape") { setEditing(false); setEditValue(message.content); }
                }}
                sx={{ mb: 0.5 }}
              />
              <Stack direction="row" gap={0.5} justifyContent={isOwn ? "flex-end" : "flex-start"}>
                <Button size="small" variant="contained" onClick={handleEditSubmit} disabled={savingEdit}>
                  Save
                </Button>
                <Button
                  size="small"
                  onClick={() => { setEditing(false); setEditValue(message.content); }}
                  disabled={savingEdit}
                >
                  Cancel
                </Button>
              </Stack>
            </Box>
          ) : (
            // ── Normal bubble ────────────────────────────────────────────────
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
          )}

          {/* Timestamp row */}
          {!editing && (
            <Stack
              direction="row"
              alignItems="center"
              gap={0.5}
              sx={{ mt: 0.3, mx: 0.5 }}
            >
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.7rem" }}>
                {formatTime(message.created_at)}
              </Typography>
              {message.is_edited && !message.is_deleted && (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem", fontStyle: "italic" }}>
                  (Edited)
                </Typography>
              )}
            </Stack>
          )}

          {/* Inline action buttons — shown on hover, just below the bubble */}
          {showActions && hovered && !deletingMsg && (
            <Stack
              direction="row"
              gap={0.25}
              alignItems="center"
              justifyContent={isOwn ? "flex-end" : "flex-start"}
              sx={{ mt: 0.25, mx: 0.5 }}
            >
              {canEdit && (
                <Tooltip title="Edit (within 5 min)" placement="bottom">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => { setEditing(true); setEditValue(message.content); }}
                      sx={{ p: 0.25, opacity: 0.6, "&:hover": { opacity: 1 } }}
                    >
                      <EditIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip title={canDeleteAsAdmin && !isOwn ? "Delete (moderator)" : "Delete (within 24 h)"} placement="bottom">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={handleDelete}
                      sx={{ p: 0.25, opacity: 0.6, "&:hover": { opacity: 1 } }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Error / feedback snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
}

export { formatDate };
