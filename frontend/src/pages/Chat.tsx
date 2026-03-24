import { Box, Typography } from "@mui/material";
import { useAuth } from "../contexts/AuthContext";
import ChatPanel from "../components/chat/ChatPanel";

export default function Chat() {
  const { user } = useAuth();

  if (!user?.email) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">Not signed in.</Typography>
      </Box>
    );
  }

  return <ChatPanel currentUserEmail={user.email} />;
}
