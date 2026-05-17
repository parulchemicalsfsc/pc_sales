from supabase_db import get_db

db = next(get_db())

new_permissions = [
    {
        "permission_key": "view_reviews",
        "display_name": "View Reviews",
        "description": "Allows viewing the reviews page",
        "module": "reviews"
    },
    {
        "permission_key": "delete_reviews",
        "display_name": "Delete Reviews",
        "description": "Allows deleting reviews",
        "module": "reviews"
    }
]

for perm in new_permissions:
    try:
        db.table("permissions").insert(perm).execute()
        print(f"Inserted permission: {perm['permission_key']}")
    except Exception as e:
        print(f"Error or already exists for {perm['permission_key']}: {e}")
