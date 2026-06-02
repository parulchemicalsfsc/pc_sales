import { Box, Typography } from "@mui/material";
import { useAuth } from "../contexts/AuthContext";
import ChatPanel from "../components/chat/ChatPanel";

import { useTranslation } from "../hooks/useTranslation";

export default function Chat() {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user?.email) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">{t("common.notSignedIn", "Not signed in.")}</Typography>
      </Box>
    );
  }

  return <ChatPanel currentUserEmail={user.email} />;
}
