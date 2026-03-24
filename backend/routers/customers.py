from typing import Optional

import requests
from activity_logger import get_activity_logger
from fastapi import APIRouter, Depends, Header, HTTPException
from models import Customer
from supabase_db import SupabaseClient, get_db
from rbac_utils import verify_permission

router = APIRouter()


@router.get("/", dependencies=[Depends(verify_permission("view_customers"))])
def get_customers(db: SupabaseClient = Depends(get_db)):
    """Get all customers"""
    try:
        response = (
            db.table("customers").select("*").order("created_at", desc=True).execute()
        )
        return {"data": response.data, "total": len(response.data)}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching customers: {str(e)}"
        )
@router.get("/{customer_id}/summary", dependencies=[Depends(verify_permission("view_customers"))])
def get_customer_summary(customer_id: int, db: SupabaseClient = Depends(get_db)):
    """Get summarized sales, payments, and join date for a customer"""
    try:
        cust_res = db.table("customers").select("created_at").eq("customer_id", customer_id).execute()
        if not cust_res.data or len(cust_res.data) == 0:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        joined_date = cust_res.data[0].get("created_at")
        
        sales_res = db.table("sales").select("total_amount, sale_id").eq("customer_id", customer_id).execute()
        sales_data = sales_res.data or []
        sales_count = len(sales_data)
        total_sales = sum(float(s.get("total_amount") or 0) for s in sales_data)
        
        total_paid = 0.0
        if sales_data:
            sale_ids = [s["sale_id"] for s in sales_data]
            payments_res = db.table("payments").select("amount").in_("sale_id", sale_ids).execute()
            payments_data = payments_res.data or []
            total_paid = sum(float(p.get("amount") or 0) for p in payments_data)
            
        total_pending = max(0.0, total_sales - total_paid)

        return {
            "joined_date": joined_date,
            "sales_count": sales_count,
            "total_sales": total_sales,
            "total_paid": total_paid,
            "total_pending": total_pending
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching customer summary: {str(e)}"
        )


@router.get("/{customer_id}", dependencies=[Depends(verify_permission("view_customers"))])
def get_customer(customer_id: int, db: SupabaseClient = Depends(get_db)):
    """Get a single customer by ID"""
    try:
        response = (
            db.table("customers").select("*").eq("customer_id", customer_id).execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Customer not found")

        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching customer: {str(e)}"
        )


@router.post("/", dependencies=[Depends(verify_permission("create_customer"))])
def create_customer(
    customer: Customer,
    db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new customer"""
    try:
        customer_data = {
            "name": customer.name,
            "mobile": customer.mobile,
            "village": customer.village,
            "taluka": customer.taluka,
            "district": customer.district,
            "adhar_no": customer.adhar_no,
            "status": customer.status,
        }

        # Add customer_code if provided
        if customer.customer_code:
            customer_data["customer_code"] = customer.customer_code

        response = db.table("customers").insert(customer_data).execute()

        if response.data and len(response.data) > 0:
            created_customer = response.data[0]

            # Log activity
            if user_email:
                logger = get_activity_logger(db)
                logger.log_create(
                    user_email=user_email,
                    entity_type="customer",
                    entity_name=customer.name,
                    entity_id=created_customer.get("customer_id"),
                    metadata={
                        "customer_code": customer.customer_code,
                        "mobile": customer.mobile,
                        "village": customer.village,
                    },
                )

            return {"message": "Customer created", "data": created_customer}
        else:
            return {"message": "Customer created"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error creating customer: {str(e)}"
        )


@router.put("/{customer_id}", dependencies=[Depends(verify_permission("edit_customer"))])
def update_customer(
    customer_id: int,
    customer: Customer,
    db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update an existing customer"""
    try:
        customer_data = {
            "name": customer.name,
            "mobile": customer.mobile,
            "village": customer.village,
            "taluka": customer.taluka,
            "district": customer.district,
            "adhar_no": customer.adhar_no,
            "status": customer.status,
        }

        # Add customer_code if provided
        if customer.customer_code:
            customer_data["customer_code"] = customer.customer_code

        response = (
            db.table("customers")
            .eq("customer_id", customer_id)
            .update(customer_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Customer not found")

        updated_customer = response.data[0]

        # Log activity
        if user_email:
            logger = get_activity_logger(db)
            logger.log_update(
                user_email=user_email,
                entity_type="customer",
                entity_name=customer.name,
                entity_id=customer_id,
                metadata={
                    "customer_code": customer.customer_code,
                    "mobile": customer.mobile,
                    "village": customer.village,
                },
            )

        return {"message": "Customer updated", "data": updated_customer}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error updating customer: {str(e)}"
        )


@router.delete("/{customer_id}", dependencies=[Depends(verify_permission("delete_customer"))])
def delete_customer(
    customer_id: int,
    db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Delete a customer"""
    try:
        # First check if customer exists and get customer name
        check_response = (
            db.table("customers")
            .select("customer_id, name")
            .eq("customer_id", customer_id)
            .execute()
        )

        if not check_response.data or len(check_response.data) == 0:
            raise HTTPException(status_code=404, detail="Customer not found")

        customer_name = check_response.data[0].get("name", "Unknown")

        # Check for related sales
        sales_check = (
            db.table("sales")
            .select("sale_id")
            .eq("customer_id", customer_id)
            .limit(1)
            .execute()
        )

        if sales_check.data and len(sales_check.data) > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete customer with existing sales records. Please delete related sales first.",
            )

        # Check for related demos
        demos_check = (
            db.table("demos")
            .select("demo_id")
            .eq("customer_id", customer_id)
            .limit(1)
            .execute()
        )

        if demos_check.data and len(demos_check.data) > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete customer with existing demo records. Please delete related demos first.",
            )

        response = (
            db.table("customers").eq("customer_id", customer_id).delete().execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Customer not found")

        # Log activity
        if user_email:
            logger = get_activity_logger(db)
            logger.log_delete(
                user_email=user_email,
                entity_type="customer",
                entity_name=customer_name,
                entity_id=customer_id,
            )

        return {"message": "Customer deleted successfully"}
    except requests.HTTPError as e:
        detail = str(e)
        raise HTTPException(status_code=400, detail=f"Supabase error: {detail}")
    except HTTPException:
        raise
    except Exception as e:
        # Log the actual error for debugging
        print(f"Error deleting customer {customer_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting customer: {str(e)}"
        )
