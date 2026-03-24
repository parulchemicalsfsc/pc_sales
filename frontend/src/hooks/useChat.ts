import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppUser {
  email: string;
  name: string | null;
  role: string;
}

export interface Conversation {
  conversation_id: number;
  type: "group" | "direct";
  name: string | null;
  // For DMs, the partner's info is resolved client-side
  partner?: AppUser;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
}

export interface ChatMessage {
  message_id: number;
  conversation_id: number;
  sender_email: string;
  sender_name?: string | null;
  content: string;
  mentions: string[];
  is_deleted: boolean;
  created_at: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChat(currentUserEmail: string | null | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeConvIdRef = useRef<number | null>(null);

  // Keep ref in sync for use inside realtime callbacks
  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  // ── Load all app users (for @mention and DM picker) ────────────────────────
  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_users")
      .select("email, name, role")
      .eq("is_active", true)
      .order("name");
    if (!error && data) setUsers(data as AppUser[]);
  }, []);

  // ── Build a user name lookup map ────────────────────────────────────────────
  const getUserName = useCallback(
    (email: string): string => {
      const u = users.find((u) => u.email === email);
      return u?.name || email.split("@")[0];
    },
    [users]
  );

  // ── Load conversations the current user participates in ─────────────────────
  const loadConversations = useCallback(async () => {
    if (!currentUserEmail) return;
    setLoadingConvs(true);
    try {
      // Step 1: get conversation IDs this user is in
      const { data: participations, error: pErr } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_email", currentUserEmail);

      if (pErr || !participations) return;

      const convIds = participations.map((p: any) => p.conversation_id);
      if (convIds.length === 0) {
        setConversations([]);
        return;
      }

      // Step 2: get conversation details
      const { data: convs, error: cErr } = await supabase
        .from("chat_conversations")
        .select("*")
        .in("conversation_id", convIds);

      if (cErr || !convs) return;

      // Step 3: for each DM, resolve the partner's identity
      const { data: allParticipants } = await supabase
        .from("chat_participants")
        .select("conversation_id, user_email")
        .in("conversation_id", convIds);

      // Step 4: get last message per conversation
      const lastMsgPromises = convIds.map((id: number) =>
        supabase
          .from("chat_messages")
          .select("content, created_at")
          .eq("conversation_id", id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
      );
      const lastMsgResults = await Promise.allSettled(lastMsgPromises);

      // Step 5: get read receipts
      const { data: receipts } = await supabase
        .from("chat_read_receipts")
        .select("conversation_id, last_read_at")
        .eq("user_email", currentUserEmail)
        .in("conversation_id", convIds);

      // Step 6: get unread counts per conversation
      const unreadPromises = convIds.map(async (id: number) => {
        const receipt = receipts?.find((r: any) => r.conversation_id === id);
        const since = receipt?.last_read_at || "1970-01-01";
        const { count } = await supabase
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", id)
          .eq("is_deleted", false)
          .gt("created_at", since)
          .neq("sender_email", currentUserEmail);
        return { id, count: count ?? 0 };
      });
      const unreadResults = await Promise.all(unreadPromises);

      const enriched: Conversation[] = convs.map((c: any) => {
        const idx = convIds.indexOf(c.conversation_id);
        const lastMsgResult = lastMsgResults[idx];
        const lastMsg =
          lastMsgResult.status === "fulfilled" && lastMsgResult.value.data
            ? lastMsgResult.value.data
            : null;
        const unread = unreadResults.find((u) => u.id === c.conversation_id);

        let partner: AppUser | undefined;
        if (c.type === "direct" && allParticipants) {
          const partnerEmail = allParticipants
            .filter(
              (p: any) =>
                p.conversation_id === c.conversation_id &&
                p.user_email !== currentUserEmail
            )
            .map((p: any) => p.user_email)[0];
          if (partnerEmail) {
            const u = users.find((u) => u.email === partnerEmail);
            partner = u || { email: partnerEmail, name: partnerEmail.split("@")[0], role: "" };
          }
        }

        return {
          conversation_id: c.conversation_id,
          type: c.type,
          name: c.type === "group" ? c.name : null,
          partner,
          last_message: lastMsg?.content || undefined,
          last_message_at: lastMsg?.created_at || c.created_at,
          unread_count: unread?.count ?? 0,
        };
      });

      // Sort: group first, then DMs by last_message_at descending
      enriched.sort((a, b) => {
        if (a.type === "group" && b.type !== "group") return -1;
        if (b.type === "group" && a.type !== "group") return 1;
        const aTime = a.last_message_at || "";
        const bTime = b.last_message_at || "";
        return bTime.localeCompare(aTime);
      });

      setConversations(enriched);

      // Auto-open group chat on first load — go through switchConversation
      // so the subscription and messages are set up exactly once, correctly.
      if (!activeConvIdRef.current && enriched.length > 0) {
        const group = enriched.find((c) => c.type === "group");
        const firstId = group?.conversation_id ?? enriched[0].conversation_id;
        // Call directly (not via setActiveConvId) to avoid triggering any effect
        // switchConversation sets activeConvId, loads messages, subscribes.
        // We schedule it outside the setState batch to avoid state conflicts.
        setTimeout(() => switchConversation(firstId), 0);
      }
    } finally {
      setLoadingConvs(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserEmail, users]);

  // ── Load message history for active conversation ────────────────────────────
  const loadMessages = useCallback(
    async (convId: number) => {
      setLoadingMsgs(true);
      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("conversation_id", convId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: true })
          .limit(100);

        if (error) {
          console.error("[useChat] loadMessages error:", error);
          return;
        }

        // Enrich with sender names from the users list
        const enriched = (data || []).map((m: any) => ({
          ...m,
          sender_name: getUserName(m.sender_email),
        }));

        setMessages(enriched);
      } finally {
        setLoadingMsgs(false);
      }
    },
    [getUserName]
  );

  // ── Subscribe to realtime INSERT on chat_messages ───────────────────────────
  const subscribeToConversation = useCallback(
    (convId: number) => {
      // Remove any existing subscription
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel(`chat-conv-${convId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `conversation_id=eq.${convId}`,
          },
          (payload) => {
            const newMsg = payload.new as any;
            // Only append if still viewing this conversation
            if (activeConvIdRef.current === convId) {
              setMessages((prev) => {
                // Prevent duplicates
                if (prev.find((m) => m.message_id === newMsg.message_id)) return prev;
                return [
                  ...prev,
                  { ...newMsg, sender_name: getUserName(newMsg.sender_email) },
                ];
              });
            }
            // Update conversation list (last message + unread)
            setConversations((prev) =>
              prev.map((c) => {
                if (c.conversation_id !== convId) return c;
                const isOwnMessage = newMsg.sender_email === currentUserEmail;
                return {
                  ...c,
                  last_message: newMsg.content,
                  last_message_at: newMsg.created_at,
                  unread_count:
                    activeConvIdRef.current === convId || isOwnMessage
                      ? 0
                      : c.unread_count + 1,
                };
              })
            );
          }
        )
        .subscribe();

      channelRef.current = channel;
    },
    [currentUserEmail, getUserName]
  );

  // ── Switch active conversation ──────────────────────────────────────────────
  const switchConversation = useCallback(
    async (convId: number) => {
      setActiveConvId(convId);
      await loadMessages(convId);
      subscribeToConversation(convId);

      // Mark as read
      if (currentUserEmail) {
        await supabase.from("chat_read_receipts").upsert(
          {
            conversation_id: convId,
            user_email: currentUserEmail,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: "conversation_id,user_email" }
        );
        // Clear unread badge locally
        setConversations((prev) =>
          prev.map((c) =>
            c.conversation_id === convId ? { ...c, unread_count: 0 } : c
          )
        );
      }
    },
    [currentUserEmail, loadMessages, subscribeToConversation]
  );

  // ── Send a message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string, mentions: string[] = []) => {
      if (!activeConvId || !currentUserEmail || !content.trim()) return;
      setSendingMsg(true);
      try {
        const { error } = await supabase.from("chat_messages").insert({
          conversation_id: activeConvId,
          sender_email: currentUserEmail,
          content: content.trim(),
          mentions,
        });
        if (error) console.error("[useChat] sendMessage error:", error);

        // Send notifications to @mentioned users via existing notifications table
        if (mentions.length > 0) {
          const senderName = getUserName(currentUserEmail);
          const notifInserts = mentions
            .filter((m) => m !== currentUserEmail)
            .map((mentionedEmail) => ({
              user_email: mentionedEmail,
              title: `${senderName} mentioned you`,
              message: content.substring(0, 100),
              notification_type: "mention",
              entity_type: "chat",
              action_url: "/chat",
            }));
          if (notifInserts.length > 0) {
            await supabase.from("notifications").insert(notifInserts);
          }
        }
      } finally {
        setSendingMsg(false);
      }
    },
    [activeConvId, currentUserEmail, getUserName]
  );

  // ── Find or create a DM conversation ───────────────────────────────────────
  const startDM = useCallback(
    async (targetEmail: string) => {
      if (!currentUserEmail || targetEmail === currentUserEmail) return;

      // Look for existing DM between the two users
      const { data: myConvs } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_email", currentUserEmail);

      const { data: theirConvs } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_email", targetEmail);

      if (myConvs && theirConvs) {
        const myIds = new Set(myConvs.map((p: any) => p.conversation_id));
        const shared = theirConvs
          .map((p: any) => p.conversation_id)
          .filter((id: number) => myIds.has(id));

        // Check if any shared conversation is a direct type
        if (shared.length > 0) {
          const { data: directConvs } = await supabase
            .from("chat_conversations")
            .select("conversation_id")
            .in("conversation_id", shared)
            .eq("type", "direct");

          if (directConvs && directConvs.length > 0) {
            // DM already exists — just switch to it
            const existingId = directConvs[0].conversation_id;
            await switchConversation(existingId);
            // Make sure it's in the list
            await loadConversations();
            return;
          }
        }
      }

      // Create new DM conversation
      const { data: newConv, error: convErr } = await supabase
        .from("chat_conversations")
        .insert({ type: "direct" })
        .select()
        .single();

      if (convErr || !newConv) {
        console.error("[useChat] startDM create conversation error:", convErr);
        return;
      }

      const newConvId = newConv.conversation_id;

      // Add both participants
      await supabase.from("chat_participants").insert([
        { conversation_id: newConvId, user_email: currentUserEmail },
        { conversation_id: newConvId, user_email: targetEmail },
      ]);

      // Reload conversations and switch to the new one
      await loadConversations();
      await switchConversation(newConvId);
    },
    [currentUserEmail, loadConversations, switchConversation]
  );

  // ── Total unread count (for nav badge) ─────────────────────────────────────
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  // ── Initialise: load users, then conversations ──────────────────────────────
  useEffect(() => {
    if (!currentUserEmail) return;
    loadUsers();
  }, [currentUserEmail, loadUsers]);

  useEffect(() => {
    if (!currentUserEmail || users.length === 0) return;
    loadConversations();
  }, [currentUserEmail, users, loadConversations]);

  // ── Cleanup subscription on unmount only ──────────────────────────────────
  // NOTE: do NOT call loadMessages/subscribeToConversation here.
  // switchConversation is the single owner of both — calling them here
  // too causes a race where the subscription is torn down immediately
  // after being set up, making real-time messages miss.
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return {
    conversations,
    activeConvId,
    messages,
    users,
    loadingConvs,
    loadingMsgs,
    sendingMsg,
    totalUnread,
    switchConversation,
    sendMessage,
    startDM,
    getUserName,
    reloadConversations: loadConversations,
  };
}
