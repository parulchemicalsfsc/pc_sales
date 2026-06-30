from typing import List, Optional

from pydantic import BaseModel

# ======================
# Customers
# ======================


class Customer(BaseModel):
    customer_id: Optional[int] = None
    customer_code: Optional[str] = None
    name: str
    mobile: Optional[str] = None
    village: Optional[str] = None
    taluka: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = "Gujarat"
    adhar_no: Optional[str] = None
    status: str = "Active"


# ======================
# Products
# ======================

class ProductRegion(BaseModel):
    name: str

class ProductCategory(BaseModel):
    name: str


class Product(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    packing_type: Optional[str] = None
    capacity_ltr: Optional[float] = None
    category: Optional[str] = None
    standard_rate: Optional[float] = None
    # Base Prices (Optional, maintained for fallback)
    rate_gujarat: Optional[float] = None
    rate_maharashtra: Optional[float] = None
    rate_mp: Optional[float] = None
    
    # Dynamic Custom Pricing JSON
    custom_rates: Optional[dict] = {}
    
    is_active: int = 1


# ======================
# Sales
# ======================


class Sale(BaseModel):
    sale_id: Optional[int] = None
    invoice_no: Optional[str] = None
    customer_id: int
    sale_date: str
    total_amount: float = 0
    total_liters: float = 0
    payment_status: str = "Pending"
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    order_status: str = "Pending"
    shipment_status: str = "not_shipped"
    shipment_date: Optional[str] = None
    dispatch_date: Optional[str] = None
    delivery_date: Optional[str] = None
    tracking_number: Optional[str] = None
    sale_stage: str = "confirmed"


class SaleItem(BaseModel):
    product_id: int
    quantity: int
    rate: float
    amount: float


class SaleCreate(BaseModel):
    customer_id: Optional[int] = None       # Set for Customer / Field Officer sales
    distributor_id: Optional[int] = None    # Set for Distributor / Mantri sales
    doctor_id: Optional[int] = None         # Set for Doctor sales
    shopkeeper_id: Optional[int] = None     # Set for Shopkeeper sales
    buyer_type: Optional[str] = "customer"  # 'customer' | 'distributor' | 'mantri' | 'doctor' | 'shopkeeper' | 'field_officer'
    invoice_no: Optional[str] = None
    sale_date: str
    items: List[SaleItem]
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    paid_amount: Optional[float] = 0
    payment_method: Optional[str] = "Cash"


# ======================
# Payments
# ======================


class Payment(BaseModel):
    payment_id: Optional[int] = None
    sale_id: int
    payment_date: str
    payment_method: str
    amount: float
    rrn: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


# ======================
# Demos
# ======================


class Demo(BaseModel):
    demo_id: Optional[int] = None
    buyer_type: Optional[str] = "customer"
    customer_id: Optional[int] = None
    distributor_id: Optional[int] = None
    doctor_id: Optional[int] = None
    shopkeeper_id: Optional[int] = None
    demo_date: str
    demo_time: str
    product_id: int
    quantity_provided: int
    follow_up_date: Optional[str] = None
    conversion_status: str = "Scheduled"
    notes: Optional[str] = None
    demo_location: Optional[str] = None


# ======================
# Distributors
# ======================


class Distributor(BaseModel):
    distributor_id: Optional[int] = None
    record_date: Optional[str] = None
    state: Optional[str] = None
    village: Optional[str] = None
    taluka: Optional[str] = None
    district: Optional[str] = None
    name: Optional[str] = None
    mantri_name: Optional[str] = None
    mantri_mobile: Optional[str] = None
    sabhasad_count: Optional[int] = 0
    sabhasad_morning: Optional[int] = 0
    sabhasad_evening: Optional[int] = 0
    contact_in_group: Optional[int] = 0
    status: str = "Active"
    is_redemo: Optional[bool] = False

    # New Fields
    dairy_type: Optional[str] = None
    dairy_time_morning: Optional[str] = None
    dairy_time_evening: Optional[str] = None
    milk_collection_morning: Optional[int] = None
    milk_collection_evening: Optional[int] = None
    nature_of_sabhasad: Optional[str] = None
    support: Optional[str] = None
    animal_delivery_period: Optional[str] = None
    payment_recovery_demo: Optional[int] = None
    payment_recovery_dispatch: Optional[int] = None
    decision_maker_availability_morning: Optional[str] = None
    decision_maker_availability_evening: Optional[str] = None
    high_holder_to_low_holder_villages: Optional[str] = None
    current_status_of_business: Optional[str] = None


class ResolvedDistributor(Distributor):
    redemo_count: int = 0
    latest_redemo_date: Optional[str] = None


# ======================
# Shopkeepers
# ======================


class Shopkeeper(BaseModel):
    shopkeeper_id: Optional[int] = None
    record_date: Optional[str] = None
    state: Optional[str] = None
    village: Optional[str] = None
    taluka: Optional[str] = None
    district: Optional[str] = None
    name: Optional[str] = None
    mantri_name: Optional[str] = None
    mantri_mobile: Optional[str] = None
    sabhasad_count: Optional[int] = 0
    sabhasad_morning: Optional[int] = 0
    sabhasad_evening: Optional[int] = 0
    contact_in_group: Optional[int] = 0
    status: str = "Active"

    # New Fields
    dairy_type: Optional[str] = None
    dairy_time_morning: Optional[str] = None
    dairy_time_evening: Optional[str] = None
    milk_collection_morning: Optional[int] = None
    milk_collection_evening: Optional[int] = None
    nature_of_sabhasad: Optional[str] = None
    support: Optional[str] = None
    animal_delivery_period: Optional[str] = None
    payment_recovery_demo: Optional[int] = None
    payment_recovery_dispatch: Optional[int] = None
    decision_maker_availability_morning: Optional[str] = None
    decision_maker_availability_evening: Optional[str] = None
    high_holder_to_low_holder_villages: Optional[str] = None
    current_status_of_business: Optional[str] = None


# ======================
# Doctors
# ======================


class Doctor(BaseModel):
    doctor_id: Optional[int] = None
    record_date: Optional[str] = None
    state: Optional[str] = None
    village: Optional[str] = None
    taluka: Optional[str] = None
    district: Optional[str] = None
    name: Optional[str] = None
    mantri_name: Optional[str] = None
    mantri_mobile: Optional[str] = None
    sabhasad_count: Optional[int] = 0
    sabhasad_morning: Optional[int] = 0
    sabhasad_evening: Optional[int] = 0
    contact_in_group: Optional[int] = 0
    status: str = "Active"

    # New Fields
    dairy_type: Optional[str] = None
    dairy_time_morning: Optional[str] = None
    dairy_time_evening: Optional[str] = None
    milk_collection_morning: Optional[int] = None
    milk_collection_evening: Optional[int] = None
    nature_of_sabhasad: Optional[str] = None
    support: Optional[str] = None
    animal_delivery_period: Optional[str] = None
    payment_recovery_demo: Optional[int] = None
    payment_recovery_dispatch: Optional[int] = None
    decision_maker_availability_morning: Optional[str] = None
    decision_maker_availability_evening: Optional[str] = None
    high_holder_to_low_holder_villages: Optional[str] = None
    current_status_of_business: Optional[str] = None


# ======================
# Notifications
# ======================


class Notification(BaseModel):
    notification_id: Optional[int] = None
    user_email: Optional[str] = None
    title: str
    message: str
    notification_type: str  # info, success, warning, error
    entity_type: Optional[str] = None  # sale, payment, demo, customer, etc.
    entity_id: Optional[int] = None
    action_url: Optional[str] = None
    is_read: bool = False
    created_at: Optional[str] = None


# ======================
# Reviews
# ======================

class Review(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    role: Optional[str] = None
    content: Optional[str] = None
    rating: Optional[int] = None
    approved: Optional[bool] = False
    date: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    stars: Optional[int] = 5
    text: Optional[str] = None


# ======================
# Admin
# ======================


class UserCreate(BaseModel):
    email: str
    password: str
    role: str
    name: Optional[str] = None


# ======================
# Credit / Debit Notes
# ======================

class NoteCreate(BaseModel):
    note_type: str                      # 'credit' or 'debit'
    sale_id: int
    amount: float                       # Stored as NUMERIC(10,2) in DB
    reason: str                         # Required for audit trail
    issue_date: str                     # ISO date string, e.g. "2026-06-10"
    adjust_inventory: bool = False      # Reserved for future inventory integration
    requires_pickup: bool = False       # Flag for physical return
    pickup_items: Optional[str] = None  # Text description of items to pick up
    debit_invoice_no: Optional[str] = None  # Custom invoice no for auto-created debit sale; auto-generated if blank
    return_items: Optional[List] = None  # List of returned items for credit notes: [{product_id, product_name, original_qty, return_qty, rate, return_amount}]


class Note(BaseModel):
    note_id: Optional[int] = None
    note_type: str
    sale_id: int
    invoice_no: Optional[str] = None
    amount: float
    reason: str
    issue_date: str
    status: str = "active"             # 'active' | 'void'
    adjust_inventory: bool = False
    requires_pickup: bool = False
    pickup_items: Optional[str] = None
    pickup_status: str = "pending_pickup"
    pickup_date: Optional[str] = None
    returned_date: Optional[str] = None
    return_items: Optional[List] = None  # Item-level return breakdown
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TelecallerOrderItem(BaseModel):
    product_id: int
    product_name: Optional[str] = None
    quantity: int
    rate: float
    amount: float


class TelecallerOrderCreate(BaseModel):
    customer_type: str = "mantri"
    customer_id: Optional[int] = None
    customer_name: str
    customer_mobile: Optional[str] = None
    customer_village: Optional[str] = None
    products: List[TelecallerOrderItem]
    notes: Optional[str] = None


class TelecallerOrderApprove(BaseModel):
    notes: Optional[str] = None


class TelecallerOrderReject(BaseModel):
    reason: str


# ======================
# Import History / Audit Trail
# ======================

class ImportHistory(BaseModel):
    import_id: Optional[int] = None
    import_batch_id: str
    module_name: str
    file_name: Optional[str] = None
    imported_by_email: Optional[str] = None
    imported_by_role: Optional[str] = None
    total_records: int = 0
    imported_records: int = 0
    duplicate_records: int = 0
    conflict_records: int = 0
    invalid_records: int = 0
    import_status: str = "SUCCESS"
    created_at: Optional[str] = None

