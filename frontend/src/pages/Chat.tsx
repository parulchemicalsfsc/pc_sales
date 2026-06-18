import React, { useState } from "react";
import { Box, Typography, Tabs, Tab } from "@mui/material";
import { useAuth } from "../contexts/AuthContext";
import ChatPanel from "../components/chat/ChatPanel";
import ArchiveSearch from "../components/chat/ArchiveSearch";

import { useTranslation } from "../hooks/useTranslation";

export default function Chat() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tabIndex, setTabIndex] = useState(0);

  if (!user?.email) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">{t("common.notSignedIn", "Not signed in.")}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper", px: 2 }}>
        <Tabs value={tabIndex} onChange={(_, newVal) => setTabIndex(newVal)} aria-label="chat tabs">
          <Tab label="Live Chat" />
          <Tab label="Archive" />
        </Tabs>
      </Box>
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {tabIndex === 0 && <ChatPanel currentUserEmail={user.email} />}
        {tabIndex === 1 && <ArchiveSearch currentUserEmail={user.email} />}
      </Box>
    </Box>
  );
}

