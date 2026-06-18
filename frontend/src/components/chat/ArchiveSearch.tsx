import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Autocomplete,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { chatAPI } from "../../services/api";
import { useChat } from "../../hooks/useChat";
import MessageBubble from "./MessageBubble";
import { useAuth } from "../../contexts/AuthContext";
import { PERMISSIONS } from "../../config/permissions";

interface ArchiveSearchProps {
  currentUserEmail: string;
}

export default function ArchiveSearch({ currentUserEmail }: ArchiveSearchProps) {
  const { hasPermission } = useAuth();
  const { users } = useChat(currentUserEmail);

  const [query, setQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<typeof users>([]);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [mentionsMe, setMentionsMe] = useState(false);

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const filters: any = {};
      if (query.trim()) filters.query = query.trim();
      if (selectedUsers.length > 0) {
        filters.users = selectedUsers.map((u) => u.email).join(",");
      }
      if (dateFrom) filters.date_from = dateFrom.toISOString();
      if (dateTo) filters.date_to = dateTo.toISOString();
      if (mentionsMe) filters.mentions_me = true;

      const res = await chatAPI.searchMessages(filters);
      setResults(res.data || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const canDeleteAsAdmin = hasPermission(PERMISSIONS.DELETE_MESSAGE);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Search Filters */}
      <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Archive Search
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <TextField
            label="Search text"
            variant="outlined"
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            sx={{ minWidth: 200, flex: 1 }}
          />

          <Autocomplete
            multiple
            size="small"
            options={users}
            getOptionLabel={(option) => option.name || option.email.split("@")[0]}
            value={selectedUsers}
            onChange={(_, newValue) => setSelectedUsers(newValue)}
            sx={{ minWidth: 250, flex: 1 }}
            renderInput={(params) => <TextField {...params} label="From Users" />}
          />
        </Stack>
        
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <DatePicker
            label="From Date"
            value={dateFrom}
            onChange={(newValue) => setDateFrom(newValue)}
            slotProps={{ textField: { size: "small" } }}
          />
          <DatePicker
            label="To Date"
            value={dateTo}
            onChange={(newValue) => setDateTo(newValue)}
            slotProps={{ textField: { size: "small" } }}
          />
          <FormControlLabel
            control={<Checkbox checked={mentionsMe} onChange={(e) => setMentionsMe(e.target.checked)} />}
            label="Mentions Me"
          />
          <Button variant="contained" onClick={handleSearch} disabled={loading}>
            {loading ? <CircularProgress size={24} /> : "Search"}
          </Button>
        </Stack>
      </Box>

      {/* Results */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2, bgcolor: "background.default" }}>
        {!searched ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <Typography color="text.secondary">Use the filters above to search for messages.</Typography>
          </Box>
        ) : loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : results.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <Typography color="text.secondary">No messages found matching criteria.</Typography>
          </Box>
        ) : (
          <Box sx={{ maxWidth: 800, mx: "auto" }}>
            {results.map((msg) => (
              <Box key={msg.message_id} sx={{ mb: 2 }}>
                <MessageBubble
                  message={msg}
                  isOwn={msg.sender_email === currentUserEmail}
                  users={users}
                  canDeleteAsAdmin={canDeleteAsAdmin}
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
    </LocalizationProvider>
  );
}
