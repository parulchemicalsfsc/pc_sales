import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemButton,
  Avatar,
  Typography,
  InputAdornment,
  Box,
  CircularProgress,
} from "@mui/material";
import { Search as SearchIcon } from "@mui/icons-material";
import type { AppUser } from "../../hooks/useChat";

interface UserPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (email: string) => Promise<void>;
  users: AppUser[];
  currentUserEmail: string;
}

export default function UserPickerModal({
  open,
  onClose,
  onSelect,
  users,
  currentUserEmail,
}: UserPickerModalProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const filtered = users.filter(
    (u) =>
      u.email !== currentUserEmail &&
      (u.name?.toLowerCase().includes(query.toLowerCase()) ||
        u.email.toLowerCase().includes(query.toLowerCase()))
  );

  const handleSelect = async (email: string) => {
    setSelectedEmail(email);
    setLoading(true);
    try {
      await onSelect(email);
      onClose();
    } finally {
      setLoading(false);
      setSelectedEmail(null);
      setQuery("");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
        New Direct Message
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <TextField
          fullWidth
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          variant="outlined"
          autoFocus
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <List dense sx={{ maxHeight: 320, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 3, color: "text.secondary" }}>
              <Typography variant="body2">No users found</Typography>
            </Box>
          ) : (
            filtered.map((user) => (
              <ListItem key={user.email} disablePadding>
                <ListItemButton
                  onClick={() => handleSelect(user.email)}
                  disabled={loading}
                  sx={{ borderRadius: 2 }}
                >
                  <ListItemAvatar>
                    <Avatar
                      sx={{ bgcolor: "primary.main", width: 36, height: 36, fontSize: "0.85rem" }}
                    >
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
                  {loading && selectedEmail === user.email && (
                    <CircularProgress size={18} sx={{ ml: 1 }} />
                  )}
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
}
