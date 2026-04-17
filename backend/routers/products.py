from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from models import Product, ProductRegion, ProductCategory
from supabase_db import SupabaseClient, get_db
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

router = APIRouter()


@router.get("/", dependencies=[Depends(verify_permission("view_products"))])
def get_products(db: SupabaseClient = Depends(get_db)):
    """Get all active products"""
    try:
        response = db.table("products").select("*").eq("is_active", 1).execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching products: {str(e)}"
        )


@router.get("/all", dependencies=[Depends(verify_permission("manage_products"))])
def get_all_products(db: SupabaseClient = Depends(get_db)):
    """Get all products including inactive ones"""
    try:
        response = db.table("products").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching products: {str(e)}"
        )


@router.get("/config/regions", dependencies=[Depends(verify_permission("view_products"))])
def get_product_regions(db: SupabaseClient = Depends(get_db)):
    """Get dynamic product regions"""
    try:
        res = db.table("product_regions").select("*").order("created_at").execute()
        return res.data or []
    except Exception as e:
        print(f"[WARN] Failed fetching regions (maybe table missing): {e}")
        return [{"name": "Gujarat"}, {"name": "Maharashtra"}, {"name": "Madhya Pradesh"}]


@router.post("/config/regions", dependencies=[Depends(verify_permission("manage_products"))])
def create_product_region(region: ProductRegion, db: SupabaseClient = Depends(get_db)):
    """Create a new product region"""
    try:
        res = db.table("product_regions").insert({"name": region.name}).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/categories", dependencies=[Depends(verify_permission("view_products"))])
def get_product_categories(db: SupabaseClient = Depends(get_db)):
    """Get dynamic product categories"""
    try:
        res = db.table("product_categories").select("*").order("created_at").execute()
        return res.data or []
    except Exception as e:
        print(f"[WARN] Failed fetching categories (maybe table missing): {e}")
        return [{"name": "Sabhasad"}, {"name": "Mantri"}, {"name": "Distributor"}, {"name": "Field Officer"}]


@router.post("/config/categories", dependencies=[Depends(verify_permission("manage_products"))])
def create_product_category(category: ProductCategory, db: SupabaseClient = Depends(get_db)):
    """Create a new product category"""
    try:
        res = db.table("product_categories").insert({"name": category.name}).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/config/regions/{region_name}", dependencies=[Depends(verify_permission("manage_products"))])
def delete_product_region(region_name: str, db: SupabaseClient = Depends(get_db)):
    """Delete a product region"""
    try:
        db.table("product_regions").eq("name", region_name).delete().execute()
        return {"message": "Region deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/config/categories/{category_name}", dependencies=[Depends(verify_permission("manage_products"))])
def delete_product_category(category_name: str, db: SupabaseClient = Depends(get_db)):
    """Delete a product category"""
    try:
        db.table("product_categories").eq("name", category_name).delete().execute()
        return {"message": "Category deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/{product_id}", dependencies=[Depends(verify_permission("view_products"))])
def get_product(product_id: int, db: SupabaseClient = Depends(get_db)):
    """Get a single product by ID"""
    try:
        response = (
            db.table("products").select("*").eq("product_id", product_id).execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Product not found")

        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching product: {str(e)}")


@router.post("/", dependencies=[Depends(verify_permission("manage_products"))])
def create_product(product: Product, db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new product"""
    try:
        product_data = {
            "product_name": product.product_name,
            "packing_type": product.packing_type,
            "capacity_ltr": product.capacity_ltr,
            "category": product.category,
            "standard_rate": product.standard_rate,
            "rate_gujarat": product.rate_gujarat,
            "rate_maharashtra": product.rate_maharashtra,
            "rate_mp": product.rate_mp,
            "custom_rates": product.custom_rates,
            "is_active": product.is_active,
        }

        response = db.table("products").insert(product_data).execute()

        if response.data and len(response.data) > 0:
            if user_email:
                try:
                    logger = get_activity_logger(db)
                    logger.log_create(
                        user_email=user_email,
                        entity_type="product",
                        entity_name=product.product_name,
                        entity_id=response.data[0].get("product_id"),
                        new_state=response.data[0],
                    )
                except Exception:
                    pass
            return {"message": "Product created", "data": response.data[0]}
        else:
            return {"message": "Product created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating product: {str(e)}")


@router.put("/{product_id}", dependencies=[Depends(verify_permission("manage_products"))])
def update_product(
    product_id: int, product: Product, db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update an existing product"""
    try:
        product_data = {
            "product_name": product.product_name,
            "packing_type": product.packing_type,
            "capacity_ltr": product.capacity_ltr,
            "category": product.category,
            "standard_rate": product.standard_rate,
            "rate_gujarat": product.rate_gujarat,
            "rate_maharashtra": product.rate_maharashtra,
            "rate_mp": product.rate_mp,
            "custom_rates": product.custom_rates,
            "is_active": product.is_active,
        }

        # Fetch current state before update for diff logging
        current_res = db.table("products").select("*").eq("product_id", product_id).execute()
        current_product = current_res.data[0] if current_res.data else None

        response = (
            db.table("products")
            .eq("product_id", product_id)
            .update(product_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Product not found")

        if user_email and current_product:
            try:
                logger = get_activity_logger(db)
                logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="product",
                    entity_name=product.product_name,
                    entity_id=product_id,
                    before=current_product,
                    after=product_data,
                )
            except Exception as le:
                print(f"[ERROR] Failed to log update diff: {le}")

        return {"message": "Product updated", "data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating product: {str(e)}")


@router.delete("/{product_id}", dependencies=[Depends(verify_permission("manage_products"))])
def delete_product(product_id: int, db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Delete a product (soft delete by setting is_active to 0)"""
    try:
        # Fetch current record before deleting
        before_resp = db.table("products").select("*").eq("product_id", product_id).execute()
        old_data = before_resp.data[0] if before_resp.data else None

        # Hard delete - permanently remove record
        print(f"[DEBUG] Attempting HARD delete for product_id: {product_id}")
        
        response = (
            db.table("products")
            .eq("product_id", product_id)
            .delete()
            .execute()
        )
        
        print(f"[DEBUG] Soft delete response: {response.data}")

        # Check if data exists in response
        if not response.data:
            print(f"[ERROR] Product {product_id} not found or update failed")
            raise HTTPException(status_code=404, detail="Product not found or could not be updated")

        if user_email and old_data:
            try:
                logger = get_activity_logger(db)
                logger.log_delete(
                    user_email=user_email,
                    entity_type="product",
                    entity_name=f"Product #{product_id}",
                    entity_id=product_id,
                    old_state=old_data,
                )
            except Exception:
                pass

        return {"message": "Product deleted successfully", "id": product_id}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Exception in delete_product: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting product: {str(e)}")
