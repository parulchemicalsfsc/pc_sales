from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from models import Product
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
            
            # Advanced Pricing
            "rate_gujarat_sabhasad": product.rate_gujarat_sabhasad,
            "rate_gujarat_mantri": product.rate_gujarat_mantri,
            "rate_gujarat_distributor": product.rate_gujarat_distributor,
            "rate_gujarat_field_officer": product.rate_gujarat_field_officer,
            
            "rate_maharashtra_sabhasad": product.rate_maharashtra_sabhasad,
            "rate_maharashtra_mantri": product.rate_maharashtra_mantri,
            "rate_maharashtra_distributor": product.rate_maharashtra_distributor,
            "rate_maharashtra_field_officer": product.rate_maharashtra_field_officer,

            "rate_mp_sabhasad": product.rate_mp_sabhasad,
            "rate_mp_mantri": product.rate_mp_mantri,
            "rate_mp_distributor": product.rate_mp_distributor,
            "rate_mp_field_officer": product.rate_mp_field_officer,
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
            
            # Advanced Pricing
            "rate_gujarat_sabhasad": product.rate_gujarat_sabhasad,
            "rate_gujarat_mantri": product.rate_gujarat_mantri,
            "rate_gujarat_distributor": product.rate_gujarat_distributor,
            "rate_gujarat_field_officer": product.rate_gujarat_field_officer,
            
            "rate_maharashtra_sabhasad": product.rate_maharashtra_sabhasad,
            "rate_maharashtra_mantri": product.rate_maharashtra_mantri,
            "rate_maharashtra_distributor": product.rate_maharashtra_distributor,
            "rate_maharashtra_field_officer": product.rate_maharashtra_field_officer,

            "rate_mp_sabhasad": product.rate_mp_sabhasad,
            "rate_mp_mantri": product.rate_mp_mantri,
            "rate_mp_distributor": product.rate_mp_distributor,
            "rate_mp_field_officer": product.rate_mp_field_officer,
            "is_active": product.is_active,
        }

        response = (
            db.table("products")
            .eq("product_id", product_id)
            .update(product_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Product not found")

        return {"message": "Product updated", "data": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating product: {str(e)}")
    finally:
        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_update(
                    user_email=user_email,
                    entity_type="product",
                    entity_name=product.product_name,
                    entity_id=product_id,
                )
            except Exception:
                pass


@router.delete("/{product_id}", dependencies=[Depends(verify_permission("manage_products"))])
def delete_product(product_id: int, db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Delete a product (soft delete by setting is_active to 0)"""
    try:
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

        return {"message": "Product deleted successfully", "id": product_id}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Exception in delete_product: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting product: {str(e)}")
    finally:
        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_delete(
                    user_email=user_email,
                    entity_type="product",
                    entity_name=f"Product #{product_id}",
                    entity_id=product_id,
                )
            except Exception:
                pass
