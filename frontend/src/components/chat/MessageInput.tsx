import React, {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
} from "react";
import {
  Box,
  TextField,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Tooltip,
} from "@mui/material";
import { Send as SendIcon, EmojiEmotions as EmojiIcon } from "@mui/icons-material";
import type { AppUser } from "../../hooks/useChat";

interface MessageInputProps {
  onSend: (content: string, mentions: string[]) => Promise<void>;
  disabled?: boolean;
  users: AppUser[];
  currentUserEmail: string;
}

export default function MessageInput({
  onSend,
  disabled,
  users,
  currentUserEmail,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [collectedMentions, setCollectedMentions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtered user list for @mention dropdown
  const mentionSuggestions = mentionQuery !== null
    ? users
        .filter(
          (u) =>
            u.email !== currentUserEmail &&
            (u.name?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
             u.email.toLowerCase().includes(mentionQuery.toLowerCase()))
        )
        .slice(0, 6)
    : [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);

    // Detect @ trigger
    const cursor = e.target.selectionStart || 0;
    const beforeCursor = val.slice(0, cursor);
    const atMatch = beforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }
  };

  const insertMention = (user: AppUser) => {
    const name = user.name || user.email.split("@")[0];
    const before = text.slice(0, mentionStart);
    const cursor = inputRef.current?.selectionStart || text.length;
    const after = text.slice(cursor);
    const newText = `${before}@${name} ${after}`;
    setText(newText);
    setMentionQuery(null);
    setMentionStart(-1);
    // Track this mention
    setCollectedMentions((prev) =>
      prev.includes(user.email) ? prev : [...prev, user.email]
    );
    // Re-focus input
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSend = async () => {
    if (!text.trim() || sending || disabled) return;
    setSending(true);
    try {
      // Compute final mentions: only those whose @Name appears in the final text
      const finalMentions = collectedMentions.filter((email) => {
        const user = users.find((u) => u.email === email);
        const name = user?.name || email.split("@")[0];
        return text.includes(`@${name}`);
      });
      await onSend(text.trim(), finalMentions);
      setText("");
      setCollectedMentions([]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mentionSuggestions.length > 0) {
        insertMention(mentionSuggestions[0]);
      } else {
        handleSend();
      }
    }
    if (e.key === "Escape") {
      setMentionQuery(null);
    }
  };

  return (
    <Box sx={{ position: "relative" }}>
      {/* @Mention Dropdown */}
      {mentionQuery !== null && mentionSuggestions.length > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            mb: 0.5,
            maxHeight: 240,
            overflowY: "auto",
            borderRadius: 2,
            zIndex: 1000,
          }}
        >
          <List dense disablePadding>
            {mentionSuggestions.map((user) => (
              <ListItem
                key={user.email}
                onClick={() => insertMention(user)}
                sx={{
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                  px: 2,
                  py: 0.75,
                }}
              >
                <ListItemAvatar sx={{ minWidth: 36 }}>
                  <Avatar sx={{ width: 28, height: 28, fontSize: "0.75rem", bgcolor: "primary.main" }}>
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={500}>
                      {user.name || user.email.split("@")[0]}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {user.email}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Input Row */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          alignItems: "flex-end",
          p: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type a message… (@ to mention)"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          variant="outlined"
          size="small"
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 3,
              fontSize: "0.95rem",
            },
          }}
        />
        <Tooltip title="Send (Enter)">
          <span>
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={!text.trim() || sending || disabled}
              sx={{
                bgcolor: "primary.main",
                color: "#fff",
                width: 40,
                height: 40,
                "&:hover": { bgcolor: "primary.dark" },
                "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
                flexShrink: 0,
              }}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
