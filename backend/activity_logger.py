"""
Activity Logger Service
Tracks all user activities and actions in the system
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from supabase_db import SupabaseClient


class ActivityLogger:
    """Service to log user activities"""

    def __init__(self, db: SupabaseClient):
        self.db = db

    def log_activity(
        self,
        user_email: str,
        action_type: str,
        action_description: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        entity_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> bool:
        """
        Log a user activity to the database

        Args:
            user_email: Email of the user performing the action
            action_type: Type of action (CREATE, UPDATE, DELETE, VIEW, IMPORT, EXPORT, LOGIN, LOGOUT)
            action_description: Human-readable description of the action
            entity_type: Type of entity affected (customer, product, sale, payment, etc.)
            entity_id: ID of the affected entity
            entity_name: Name or identifier of the affected entity
            metadata: Additional JSON data about the action
            ip_address: IP address of the user
            user_agent: Browser user agent string

        Returns:
            bool: True if logged successfully, False otherwise
        """
        try:
            activity_data = {
                "user_email": user_email,
                "action_type": action_type,
                "action_description": action_description,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "entity_name": entity_name,
                "metadata": metadata,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            # Remove None values to keep the log clean
            activity_data = {k: v for k, v in activity_data.items() if v is not None}

            self.db.table("activity_logs").insert(activity_data).execute()
            return True
        except Exception as e:
            print(f"Error logging activity: {str(e)}")
            return False

    def _compute_diff(
        self,
        before: Dict[str, Any],
        after: Dict[str, Any],
        skip_fields: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Compute a list of changed fields between two snapshots.

        Returns a list of dicts: [{field, from, to}]
        Ignores fields in skip_fields and internal DB fields.
        """
        skip = set(skip_fields or [])
        skip.update({"created_at", "updated_at", "id"})

        changes = []
        all_keys = set(before.keys()) | set(after.keys())
        for key in sorted(all_keys):
            if key in skip:
                continue
            old_val = before.get(key)
            new_val = after.get(key)

            if old_val == new_val:
                continue

            # Skip when both are falsy (None vs "")
            if not old_val and not new_val:
                continue

            changes.append({
                "field": key,
                "from": old_val,
                "to": new_val,
            })

        return changes

    def log_create(
        self,
        user_email: str,
        entity_type: str,
        entity_name: str,
        entity_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        new_state: Optional[Dict[str, Any]] = None,
    ):
        """Log a CREATE action"""
        changes = []
        if new_state:
            skip = {"created_at", "updated_at", "id"}
            for k, v in new_state.items():
                if k not in skip and v is not None and str(v).strip() != "":
                    changes.append({"field": k, "from": None, "to": v})
            
            if changes:
                metadata = metadata or {}
                metadata["changes"] = changes

        self.log_activity(
            user_email=user_email,
            action_type="CREATE",
            action_description=f"Created new {entity_type}: {entity_name}",
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            metadata=metadata,
        )

    def log_update(
        self,
        user_email: str,
        entity_type: str,
        entity_name: str,
        entity_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Log an UPDATE action (no diff)"""
        self.log_activity(
            user_email=user_email,
            action_type="UPDATE",
            action_description=f"Updated {entity_type}: {entity_name}",
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            metadata=metadata,
        )

    def log_update_with_diff(
        self,
        user_email: str,
        entity_type: str,
        entity_name: str,
        before: Dict[str, Any],
        after: Dict[str, Any],
        entity_id: Optional[int] = None,
        skip_fields: Optional[List[str]] = None,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ):
        """
        Log an UPDATE action including a before/after diff in metadata.

        Changes are stored as metadata.changes = [{field, from, to}, ...]
        so the frontend can render them as e.g. "price: 340 → 380".
        """
        changes = self._compute_diff(before, after, skip_fields=skip_fields)

        meta: Dict[str, Any] = extra_metadata.copy() if extra_metadata else {}
        if changes:
            meta["changes"] = changes

        self.log_activity(
            user_email=user_email,
            action_type="UPDATE",
            action_description=f"Updated {entity_type}: {entity_name}",
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            metadata=meta if meta else None,
        )

    def log_delete(
        self,
        user_email: str,
        entity_type: str,
        entity_name: str,
        entity_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        old_state: Optional[Dict[str, Any]] = None,
    ):
        """Log a DELETE action"""
        changes = []
        if old_state:
            skip = {"created_at", "updated_at", "id"}
            for k, v in old_state.items():
                if k not in skip and v is not None and str(v).strip() != "":
                    changes.append({"field": k, "from": v, "to": None})
            
            if changes:
                metadata = metadata or {}
                metadata["changes"] = changes

        self.log_activity(
            user_email=user_email,
            action_type="DELETE",
            action_description=f"Deleted {entity_type}: {entity_name}",
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            metadata=metadata,
        )

    def log_import(
        self,
        user_email: str,
        file_name: str,
        records_count: int,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Log an IMPORT action"""
        self.log_activity(
            user_email=user_email,
            action_type="IMPORT",
            action_description=f"Imported {records_count} records from {file_name}",
            entity_type="import",
            entity_name=file_name,
            metadata=metadata or {"records_imported": records_count},
        )

    def log_export(
        self,
        user_email: str,
        export_type: str,
        records_count: int,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Log an EXPORT action"""
        self.log_activity(
            user_email=user_email,
            action_type="EXPORT",
            action_description=f"Exported {records_count} {export_type} records",
            entity_type="export",
            entity_name=export_type,
            metadata=metadata or {"records_exported": records_count},
        )

    def log_login(self, user_email: str, ip_address: Optional[str] = None):
        """Log a LOGIN action"""
        self.log_activity(
            user_email=user_email,
            action_type="LOGIN",
            action_description="User logged in",
            entity_type="auth",
            ip_address=ip_address,
        )

    def log_logout(self, user_email: str):
        """Log a LOGOUT action"""
        self.log_activity(
            user_email=user_email,
            action_type="LOGOUT",
            action_description="User logged out",
            entity_type="auth",
        )

    def log_view(
        self,
        user_email: str,
        page_name: str,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Log a VIEW action"""
        self.log_activity(
            user_email=user_email,
            action_type="VIEW",
            action_description=f"Viewed {page_name}",
            entity_type="page",
            entity_name=page_name,
            metadata=metadata,
        )


def get_activity_logger(db: SupabaseClient) -> ActivityLogger:
    """Get an ActivityLogger instance"""
    return ActivityLogger(db)
