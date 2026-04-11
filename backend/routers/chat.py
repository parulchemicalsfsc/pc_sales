"""
Chat Router
-----------
Secure backend endpoints for chat message operations that require
server-side enforcement (time-gating, permission checks, audit logs).

Endpoints:
  PUT    /api/chat/messages/{message_id}   → edit a message (owner only, ≤5 min old)
  DELETE /api/chat/messages/{message_id}   → soft-delete a message (owner OR delete_message perm, ≤24 h old)
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from activity_logger import get_activity_logger
from fastapi import APIRouter, Depends, Header, HTTPException
from supabase_db import SupabaseClient, get_db
from rbac_utils import get_user_permissions

router = APIRouter()

# ─── Constants ────────────────────────────────────────────────────────────────

EDIT_WINDOW_MINUTES = 5        # message can be edited if < 5 min old
DELETE_WINDOW_HOURS = 24       # message can be deleted if < 24 h old


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_message_or_404(message_id: int, db: SupabaseClient) -> dict:
    """Fetch a chat message; raise 404 if not found."""
    res = (
        db.table("chat_messages")
        .select("*")
        .eq("message_id", message_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Message not found.")
    return res.data[0]


def _age_seconds(created_at_iso: str) -> float:
    """Return how many seconds old the message is."""
    created = datetime.fromisoformat(
        created_at_iso.replace("Z", "+00:00")
    )
    return (datetime.now(timezone.utc) - created).total_seconds()


# ─── Edit message ─────────────────────────────────────────────────────────────

@router.put("/messages/{message_id}")
def edit_message(
    message_id: int,
    body: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Edit the content of a chat message.
    Rules:
    - Only the original sender may edit.
    - Message must be ≤ 5 minutes old at the time of the request.
    - Original content is preserved in the activity log metadata.
    """
    if not user_email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    new_content = (body.get("content") or "").strip()
    if not new_content:
        raise HTTPException(status_code=400, detail="Content cannot be empty.")

    msg = _get_message_or_404(message_id, db)

    # Ownership check
    if msg["sender_email"] != user_email:
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own messages.",
        )

    # Already deleted?
    if msg.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Cannot edit a deleted message.")

    # Time-gate: 5-minute window
    age = _age_seconds(msg["created_at"])
    if age > EDIT_WINDOW_MINUTES * 60:
        raise HTTPException(
            status_code=403,
            detail=f"Messages can only be edited within {EDIT_WINDOW_MINUTES} minutes of sending.",
        )

    old_content = msg["content"]

    # Perform the update
    update_res = (
        db.table("chat_messages")
        .eq("message_id", message_id)
        .update({"content": new_content, "is_edited": True})
        .execute()
    )
    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to update message.")

    # ── Activity log ──────────────────────────────────────────────────────────
    logger = get_activity_logger(db)
    logger.log_activity(
        user_email=user_email,
        action_type="UPDATE",
        action_description=f"Edited chat message #{message_id}",
        entity_type="chat_message",
        entity_id=message_id,
        metadata={
            "conversation_id": msg.get("conversation_id"),
            "old_content": old_content,
            "new_content": new_content,
            "edited_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    return {
        "message": "Message edited successfully.",
        "data": update_res.data[0],
    }


# ─── Delete message ───────────────────────────────────────────────────────────

@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Soft-delete a chat message (sets is_deleted=True).
    Rules:
    - Owner of the message OR a user with the 'delete_message' permission may delete.
    - Message must be ≤ 24 hours old at the time of the request.
    - Deleted content is preserved in the activity log metadata.
    """
    if not user_email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    msg = _get_message_or_404(message_id, db)

    # Permission: owner OR holds delete_message permission
    is_owner = msg["sender_email"] == user_email
    user_perms = get_user_permissions(user_email, db)
    has_delete_perm = "delete_message" in user_perms

    if not is_owner and not has_delete_perm:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to delete this message.",
        )

    # Already deleted?
    if msg.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Message is already deleted.")

    # Time-gate: 24-hour window
    age = _age_seconds(msg["created_at"])
    if age > DELETE_WINDOW_HOURS * 3600:
        raise HTTPException(
            status_code=403,
            detail=f"Messages can only be deleted within {DELETE_WINDOW_HOURS} hours of sending.",
        )

    # Soft-delete
    update_res = (
        db.table("chat_messages")
        .eq("message_id", message_id)
        .update({"is_deleted": True})
        .execute()
    )
    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to delete message.")

    # ── Activity log ──────────────────────────────────────────────────────────
    logger = get_activity_logger(db)
    deleted_by_moderator = has_delete_perm and not is_owner
    logger.log_activity(
        user_email=user_email,
        action_type="DELETE",
        action_description=(
            f"Deleted chat message #{message_id} "
            f"(original sender: {msg['sender_email']})"
            + (" [moderator action]" if deleted_by_moderator else "")
        ),
        entity_type="chat_message",
        entity_id=message_id,
        metadata={
            "conversation_id": msg.get("conversation_id"),
            "original_sender": msg["sender_email"],
            "deleted_content": msg["content"],
            "deleted_by": user_email,
            "deleted_by_moderator": deleted_by_moderator,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    return {"message": "Message deleted successfully.", "message_id": message_id}
