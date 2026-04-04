# Reports Generation Module for Sales Management System
import io
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import matplotlib
import matplotlib.pyplot as plt
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

matplotlib.use("Agg")  # Use non-interactive backend


class ReportGenerator:
    """Generate beautiful reports in PDF and Excel formats"""

    def __init__(self, company_name: str = "Sales Management System"):
        self.company_name = company_name
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Setup custom paragraph styles"""
        # Title style
        self.styles.add(
            ParagraphStyle(
                name="CustomTitle",
                parent=self.styles["Heading1"],
                fontSize=24,
                textColor=colors.HexColor("#1e40af"),
                spaceAfter=30,
                alignment=TA_CENTER,
                fontName="Helvetica-Bold",
            )
        )

        # Subtitle style
        self.styles.add(
            ParagraphStyle(
                name="CustomSubtitle",
                parent=self.styles["Heading2"],
                fontSize=14,
                textColor=colors.HexColor("#374151"),
                spaceAfter=12,
                alignment=TA_LEFT,
                fontName="Helvetica-Bold",
            )
        )

        # Info style
        self.styles.add(
            ParagraphStyle(
                name="CustomInfo",
                parent=self.styles["Normal"],
                fontSize=10,
                textColor=colors.HexColor("#6b7280"),
                alignment=TA_RIGHT,
            )
        )

    def _get_ist_time_str(self, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
        """Get current time in IST (UTC+5:30)"""
        # UTC is 5 hours 30 minutes behind IST
        ist_time = datetime.utcnow() + timedelta(hours=5, minutes=30)
        return ist_time.strftime(fmt)

    def _add_header(self, elements: List, title: str, date_range: Optional[str] = None):
        """Add report header"""
        # Company name
        elements.append(Paragraph(self.company_name, self.styles["CustomTitle"]))
        elements.append(Spacer(1, 0.2 * inch))

        # Report title
        elements.append(Paragraph(title, self.styles["CustomSubtitle"]))

        # Date info
        date_text = f"Generated on: {self._get_ist_time_str('%B %d, %Y at %I:%M %p')}"
        if date_range:
            date_text += f"<br/>{date_range}"
        elements.append(Paragraph(date_text, self.styles["CustomInfo"]))
        elements.append(Spacer(1, 0.3 * inch))

    def _create_summary_table(self, data: List[tuple], headers: List[str]) -> Table:
        """Create a styled summary table"""
        table_data = [headers] + data

        table = Table(table_data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    # Header styling
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    # Body styling
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("TEXTCOLOR", (0, 1), (-1, -1), colors.black),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 10),
                    ("ALIGN", (0, 1), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.lightgrey],
                    ),
                ]
            )
        )
        return table

    def generate_sales_report_pdf(
        self,
        sales_data: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Generate Sales Report PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch)
        elements = []

        # Header
        date_range = None
        if start_date and end_date:
            date_range = f"Period: {start_date} to {end_date}"
        self._add_header(elements, "Sales Report", date_range)

        # Summary section
        total_sales = len(sales_data)
        total_revenue = sum(sale.get("total_amount", 0) for sale in sales_data)
        total_liters = sum(sale.get("total_liters", 0) for sale in sales_data)

        summary_data = [
            ["Total Sales", str(total_sales)],
            ["Total Revenue", f"₹{total_revenue:,.2f}"],
            ["Total Liters", f"{total_liters:,.2f} L"],
            [
                "Average Sale",
                f"₹{total_revenue / total_sales if total_sales > 0 else 0:,.2f}",
            ],
        ]

        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        summary_table = self._create_summary_table(summary_data, ["Metric", "Value"])
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Detailed sales table
        elements.append(Paragraph("Detailed Sales", self.styles["CustomSubtitle"]))
        elements.append(Spacer(1, 0.1 * inch))

        if sales_data:
            table_data = []
            for sale in sales_data[:50]:  # Limit to 50 for PDF
                table_data.append(
                    [
                        sale.get("invoice_no", "N/A"),
                        sale.get("customer_name", "N/A")[:20],
                        sale.get("sale_date", "N/A"),
                        f"₹{sale.get('total_amount', 0):,.2f}",
                        sale.get("payment_status", "N/A"),
                    ]
                )

            sales_table = self._create_summary_table(
                table_data,
                ["Invoice", "Customer", "Date", "Amount", "Status"],
            )
            elements.append(sales_table)

            if len(sales_data) > 50:
                elements.append(Spacer(1, 0.2 * inch))
                elements.append(
                    Paragraph(
                        f"Note: Showing first 50 of {len(sales_data)} sales. Download Excel for complete data.",
                        self.styles["Normal"],
                    )
                )
        else:
            elements.append(
                Paragraph("No sales data available.", self.styles["Normal"])
            )

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_sales_report_excel(
        self,
        sales_data: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Generate Sales Report Excel"""
        buffer = io.BytesIO()

        # Create Excel writer
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Summary sheet
            total_sales = len(sales_data)
            total_revenue = sum(sale.get("total_amount", 0) for sale in sales_data)
            total_liters = sum(sale.get("total_liters", 0) for sale in sales_data)

            summary_df = pd.DataFrame(
                {
                    "Metric": [
                        "Report Generated",
                        "Period",
                        "Total Sales",
                        "Total Revenue (₹)",
                        "Total Liters",
                        "Average Sale (₹)",
                    ],
                    "Value": [
                        self._get_ist_time_str(),
                        f"{start_date or 'All'} to {end_date or 'All'}",
                        total_sales,
                        f"{total_revenue:,.2f}",
                        f"{total_liters:,.2f}",
                        f"{total_revenue / total_sales if total_sales > 0 else 0:,.2f}",
                    ],
                }
            )
            summary_df.to_excel(writer, sheet_name="Summary", index=False)

            # Detailed sales sheet
            if sales_data:
                sales_df = pd.DataFrame(sales_data)
                # Select and reorder columns
                columns = [
                    "invoice_no",
                    "customer_name",
                    "sale_date",
                    "total_amount",
                    "total_liters",
                    "payment_status",
                    "notes",
                ]
                sales_df = sales_df[[col for col in columns if col in sales_df.columns]]
                sales_df.to_excel(writer, sheet_name="Sales Details", index=False)

        buffer.seek(0)
        return buffer.getvalue()

    def generate_customer_report_pdf(self, customers_data: List[Dict]) -> bytes:
        """Generate Customer Report PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch)
        elements = []

        # Header
        self._add_header(elements, "Customer Report")

        # Summary
        total_customers = len(customers_data)
        active_customers = sum(1 for c in customers_data if c.get("status") == "Active")

        summary_data = [
            ["Total Customers", str(total_customers)],
            ["Active Customers", str(active_customers)],
            ["Inactive Customers", str(total_customers - active_customers)],
        ]

        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        summary_table = self._create_summary_table(summary_data, ["Metric", "Value"])
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Customer list
        elements.append(Paragraph("Customer Details", self.styles["CustomSubtitle"]))
        elements.append(Spacer(1, 0.1 * inch))

        if customers_data:
            table_data = []
            for customer in customers_data[:50]:
                table_data.append(
                    [
                        customer.get("customer_code", "N/A"),
                        customer.get("name", "N/A")[:25],
                        customer.get("mobile", "N/A"),
                        customer.get("village", "N/A")[:15],
                        customer.get("status", "N/A"),
                    ]
                )

            customer_table = self._create_summary_table(
                table_data,
                ["Code", "Name", "Mobile", "Village", "Status"],
            )
            elements.append(customer_table)

            if len(customers_data) > 50:
                elements.append(Spacer(1, 0.2 * inch))
                elements.append(
                    Paragraph(
                        f"Note: Showing first 50 of {len(customers_data)} customers. Download Excel for complete data.",
                        self.styles["Normal"],
                    )
                )

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_customer_report_excel(self, customers_data: List[Dict]) -> bytes:
        """Generate Customer Report Excel"""
        buffer = io.BytesIO()

        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Summary sheet
            total_customers = len(customers_data)
            active_customers = sum(
                1 for c in customers_data if c.get("status") == "Active"
            )

            summary_df = pd.DataFrame(
                {
                    "Metric": [
                        "Report Generated",
                        "Total Customers",
                        "Active Customers",
                        "Inactive Customers",
                    ],
                    "Value": [
                        self._get_ist_time_str(),
                        total_customers,
                        active_customers,
                        total_customers - active_customers,
                    ],
                }
            )
            summary_df.to_excel(writer, sheet_name="Summary", index=False)

            # Customer details
            if customers_data:
                customers_df = pd.DataFrame(customers_data)
                customers_df.to_excel(
                    writer, sheet_name="Customer Details", index=False
                )

        buffer.seek(0)
        return buffer.getvalue()

    def generate_payment_report_pdf(
        self,
        payments_data: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Generate Payment Report PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch)
        elements = []

        # Header
        date_range = None
        if start_date and end_date:
            date_range = f"Period: {start_date} to {end_date}"
        self._add_header(elements, "Payment Report", date_range)

        # Summary
        total_payments = len(payments_data)
        total_amount = sum((p.get("amount") or 0) for p in payments_data)

        # Payment method breakdown
        payment_methods = {}
        for payment in payments_data:
            method = payment.get("payment_method") or "Unknown"
            amount = payment.get("amount") or 0
            payment_methods[method] = payment_methods.get(method, 0) + amount

        summary_data = [
            ["Total Payments", str(total_payments)],
            ["Total Amount", f"₹{total_amount:,.2f}"],
            [
                "Average Payment",
                f"₹{total_amount / total_payments if total_payments > 0 else 0:,.2f}",
            ],
        ]

        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        summary_table = self._create_summary_table(summary_data, ["Metric", "Value"])
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Payment method breakdown
        if payment_methods:
            elements.append(
                Paragraph("Payment Methods Breakdown", self.styles["CustomSubtitle"])
            )
            elements.append(Spacer(1, 0.1 * inch))

            method_data = [
                [method, f"₹{amount:,.2f}"]
                for method, amount in payment_methods.items()
            ]
            method_table = self._create_summary_table(
                method_data, ["Payment Method", "Total Amount"]
            )
            elements.append(method_table)
            elements.append(Spacer(1, 0.3 * inch))

        # Payment details
        elements.append(Paragraph("Payment Details", self.styles["CustomSubtitle"]))
        elements.append(Spacer(1, 0.1 * inch))

        if payments_data:
            table_data = []
            for payment in payments_data[:50]:
                table_data.append(
                    [
                        payment.get("payment_date", "N/A"),
                        payment.get("invoice_no", "N/A"),
                        payment.get("payment_method") or "Unknown",
                        f"₹{(payment.get('amount') or 0):,.2f}",
                        (payment.get("reference") or "N/A")[:15],
                    ]
                )

            payment_table = self._create_summary_table(
                table_data,
                ["Date", "Invoice", "Method", "Amount", "Reference"],
            )
            elements.append(payment_table)

            if len(payments_data) > 50:
                elements.append(Spacer(1, 0.2 * inch))
                elements.append(
                    Paragraph(
                        f"Note: Showing first 50 of {len(payments_data)} payments.",
                        self.styles["Normal"],
                    )
                )

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_payment_report_excel(
        self,
        payments_data: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Generate Payment Report Excel"""
        buffer = io.BytesIO()

        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Summary sheet
            total_payments = len(payments_data)
            total_amount = sum(p.get("amount", 0) for p in payments_data)

            summary_df = pd.DataFrame(
                {
                    "Metric": [
                        "Report Generated",
                        "Period",
                        "Total Payments",
                        "Total Amount (₹)",
                        "Average Payment (₹)",
                    ],
                    "Value": [
                        self._get_ist_time_str(),
                        f"{start_date or 'All'} to {end_date or 'All'}",
                        total_payments,
                        f"{total_amount:,.2f}",
                        f"{total_amount / total_payments if total_payments > 0 else 0:,.2f}",
                    ],
                }
            )
            summary_df.to_excel(writer, sheet_name="Summary", index=False)

            # Payment details
            if payments_data:
                payments_df = pd.DataFrame(payments_data)
                payments_df.to_excel(writer, sheet_name="Payment Details", index=False)

        buffer.seek(0)
        return buffer.getvalue()

    def generate_product_performance_pdf(self, products_data: List[Dict]) -> bytes:
        """Generate Product Performance Report PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch)
        elements = []

        # Header
        self._add_header(elements, "Product Performance Report")

        # Summary
        total_products = len(products_data)
        total_quantity = sum(p.get("total_quantity", 0) for p in products_data)
        total_revenue = sum(p.get("total_revenue", 0) for p in products_data)

        summary_data = [
            ["Total Products", str(total_products)],
            ["Total Units Sold", str(total_quantity)],
            ["Total Revenue", f"₹{total_revenue:,.2f}"],
        ]

        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        summary_table = self._create_summary_table(summary_data, ["Metric", "Value"])
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Product performance table
        elements.append(
            Paragraph("Product Performance Details", self.styles["CustomSubtitle"])
        )
        elements.append(Spacer(1, 0.1 * inch))

        if products_data:
            table_data = []
            for product in products_data:
                table_data.append(
                    [
                        product.get("product_name", "N/A")[:25],
                        str(product.get("sales_count", 0)),
                        str(product.get("total_quantity", 0)),
                        f"₹{product.get('total_revenue', 0):,.2f}",
                    ]
                )

            product_table = self._create_summary_table(
                table_data,
                ["Product", "Sales Count", "Quantity Sold", "Revenue"],
            )
            elements.append(product_table)

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_product_performance_excel(self, products_data: List[Dict]) -> bytes:
        """Generate Product Performance Report Excel"""
        buffer = io.BytesIO()

        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Summary sheet
            total_products = len(products_data)
            total_quantity = sum(p.get("total_quantity", 0) for p in products_data)
            total_revenue = sum(p.get("total_revenue", 0) for p in products_data)

            summary_df = pd.DataFrame(
                {
                    "Metric": [
                        "Report Generated",
                        "Total Products",
                        "Total Units Sold",
                        "Total Revenue (₹)",
                    ],
                    "Value": [
                        self._get_ist_time_str(),
                        total_products,
                        total_quantity,
                        f"{total_revenue:,.2f}",
                    ],
                }
            )
            summary_df.to_excel(writer, sheet_name="Summary", index=False)

            # Product details
            if products_data:
                products_df = pd.DataFrame(products_data)
                products_df.to_excel(
                    writer, sheet_name="Product Performance", index=False
                )

        buffer.seek(0)
        return buffer.getvalue()

    def generate_inventory_report_pdf(self, inventory_data: List[Dict]) -> bytes:
        """Generate Inventory Report PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch)
        elements = []

        # Header
        self._add_header(elements, "Inventory Report")

        # Summary
        total_products = len(inventory_data)
        active_products = sum(1 for p in inventory_data if p.get("is_active", 1) == 1)

        summary_data = [
            ["Total Products", str(total_products)],
            ["Active Products", str(active_products)],
            ["Inactive Products", str(total_products - active_products)],
        ]

        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        summary_table = self._create_summary_table(summary_data, ["Metric", "Value"])
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Product inventory table
        elements.append(Paragraph("Product Details", self.styles["CustomSubtitle"]))
        elements.append(Spacer(1, 0.1 * inch))

        if inventory_data:
            table_data = []
            for product in inventory_data:
                table_data.append(
                    [
                        product.get("product_name", "N/A")[:30],
                        product.get("packing_type", "N/A"),
                        f"{product.get('capacity_ltr', 0)} L",
                        f"₹{product.get('standard_rate', 0):,.2f}",
                        "Active" if product.get("is_active", 1) == 1 else "Inactive",
                    ]
                )

            inventory_table = self._create_summary_table(
                table_data,
                ["Product", "Packing", "Capacity", "Rate", "Status"],
            )
            elements.append(inventory_table)

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_inventory_report_excel(self, inventory_data: List[Dict]) -> bytes:
        """Generate Inventory Report Excel"""
        buffer = io.BytesIO()

        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Summary sheet
            total_products = len(inventory_data)
            active_products = sum(
                1 for p in inventory_data if p.get("is_active", 1) == 1
            )

            summary_df = pd.DataFrame(
                {
                    "Metric": [
                        "Report Generated",
                        "Total Products",
                        "Active Products",
                        "Inactive Products",
                    ],
                    "Value": [
                        self._get_ist_time_str(),
                        total_products,
                        active_products,
                        total_products - active_products,
                    ],
                }
            )
            summary_df.to_excel(writer, sheet_name="Summary", index=False)

            # Product details
            if inventory_data:
                inventory_df = pd.DataFrame(inventory_data)
                inventory_df.to_excel(writer, sheet_name="Inventory", index=False)

        buffer.seek(0)
        return buffer.getvalue()

    def generate_invoice_pdf(
        self,
        sale_data: Dict,
        customer_data: Dict,
        items_data: List[Dict],
    ) -> bytes:
        """Generate a beautiful, professional invoice PDF for a sale"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=0.6 * inch,
            leftMargin=0.6 * inch,
            topMargin=0.6 * inch,
            bottomMargin=0.6 * inch,
        )
        elements = []

        # ============== HEADER SECTION ==============
        # Company Name with larger, bolder style
        company_style = ParagraphStyle(
            name="CompanyHeader",
            fontSize=26,
            textColor=colors.HexColor("#1e3a8a"),
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            spaceAfter=8,
            spaceBefore=10,
        )
        elements.append(Paragraph(self.company_name, company_style))
        elements.append(Spacer(1, 0.2 * inch))

        # Invoice Title with background - centered
        invoice_title_style = ParagraphStyle(
            name="InvoiceTitle",
            fontSize=18,
            textColor=colors.HexColor("#1e3a8a"),
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
        )
        
        invoice_title_data = [[Paragraph("TAX INVOICE", invoice_title_style)]]
        invoice_title_table = Table(invoice_title_data, colWidths=[6.8 * inch])
        invoice_title_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eff6ff")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#3b82f6")),
            ])
        )
        elements.append(invoice_title_table)
        elements.append(Spacer(1, 0.25 * inch))

        # ============== INVOICE & CUSTOMER INFO SECTION ==============
        invoice_no = sale_data.get("invoice_no", "N/A")
        sale_date = sale_data.get("sale_date", "N/A")
        
        # Format date
        try:
            date_obj = datetime.strptime(sale_date, "%Y-%m-%d")
            formatted_date = date_obj.strftime("%B %d, %Y")
        except:
            formatted_date = sale_date

        # Create invoice details (left) and customer info (right) in bordered boxes
        invoice_details_style = ParagraphStyle(
            name="InvoiceDetails",
            fontSize=10,
            leading=14,
            fontName="Helvetica",
        )
        
        customer_style = ParagraphStyle(
            name="CustomerInfo",
            fontSize=10,
            leading=14,
            fontName="Helvetica",
        )

        info_data = [
            [
                Paragraph(
                    f"<b>Invoice No:</b><br/>{invoice_no}<br/><br/>"
                    f"<b>Invoice Date:</b><br/>{formatted_date}<br/><br/>"
                    f"<b>Payment Status:</b><br/>"
                    f"<font color='#dc2626'>{sale_data.get('payment_status', 'Pending')}</font>",
                    invoice_details_style,
                ),
                Paragraph(
                    f"<b>BILL TO:</b><br/>"
                    f"<font size=11><b>{customer_data.get('name', 'N/A')}</b></font><br/>"
                    f"Mobile: {customer_data.get('mobile', 'N/A')}<br/>"
                    f"{customer_data.get('village', 'N/A')}<br/>"
                    f"{customer_data.get('taluka', 'N/A')}, {customer_data.get('district', 'N/A')}",
                    customer_style,
                ),
            ]
        ]

        info_table = Table(info_data, colWidths=[3.2 * inch, 3.6 * inch])
        info_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f0f9ff")),
                ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#ecfdf5")),
                ("BOX", (0, 0), (0, 0), 1.5, colors.HexColor("#3b82f6")),
                ("BOX", (1, 0), (1, 0), 1.5, colors.HexColor("#10b981")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 15),
                ("RIGHTPADDING", (0, 0), (-1, -1), 15),
                ("TOPPADDING", (0, 0), (-1, -1), 15),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 15),
            ])
        )
        elements.append(info_table)
        elements.append(Spacer(1, 0.3 * inch))

    # ... existing code ...

        # ============== PRODUCT DETAILS SECTION ==============
        section_header_style = ParagraphStyle(

            name="SectionHeader",
            fontSize=13,
            textColor=colors.HexColor("#1e3a8a"),
            fontName="Helvetica-Bold",
            spaceAfter=10,
            spaceBefore=5,
        )
        elements.append(Paragraph("PRODUCT DETAILS", section_header_style))
        
        # Decorative line under section header
        section_line = Table([[""]], colWidths=[6.8 * inch])
        section_line.setStyle(
            TableStyle([("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor("#3b82f6"))])
        )
        elements.append(section_line)
        elements.append(Spacer(1, 0.1 * inch))

        # Items Table with better formatting
        items_table_data = [
            ["Sr.", "Product Description", "Qty", "Rate", "Amount"]
        ]

        for idx, item in enumerate(items_data, 1):
            items_table_data.append([
                str(idx),
                item.get("product_name", "N/A"),
                f"{item.get('quantity', 0):.2f}",
                f"Rs. {item.get('rate', 0):,.2f}",
                f"Rs. {item.get('amount', 0):,.2f}",
            ])

        # Create items table with enhanced styling
        items_table = Table(
            items_table_data,
            colWidths=[0.5 * inch, 3.5 * inch, 0.8 * inch, 1 * inch, 1 * inch],
        )
        items_table.setStyle(
            TableStyle([
                # Header styling
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 11),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("TOPPADDING", (0, 0), (-1, 0), 12),
                
                # Body styling
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 10),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),  # Serial number
                ("ALIGN", (1, 1), (1, -1), "LEFT"),    # Product name
                ("ALIGN", (2, 1), (-1, -1), "RIGHT"),  # Numbers
                
                # Borders and padding
                ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#1e3a8a")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 1), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 10),
                
                # Alternating row colors
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ])
        )
        elements.append(items_table)
        elements.append(Spacer(1, 0.3 * inch))

        # ============== TOTALS SECTION ==============
        total_amount = sale_data.get("total_amount", 0)
        total_liters = sale_data.get("total_liters", 0)

        # Create elegant totals table
        totals_data = [
            ["Total Quantity (Liters):", f"{total_liters:.2f} L"],
            ["Subtotal:", f"Rs. {total_amount:,.2f}"],
        ]

        # Add grand total with emphasis
        totals_data.append(["", ""])  # Spacer
        totals_data.append(["GRAND TOTAL:", f"Rs. {total_amount:,.2f}"])

        totals_table = Table(
            totals_data,
            colWidths=[1.8 * inch, 1.5 * inch],
            hAlign="RIGHT",
        )
        totals_table.setStyle(
            TableStyle([
                # General styling
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, 0), (-1, -3), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -3), 11),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -2), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -2), 8),
                
                # Grand total row (special styling)
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, -1), (-1, -1), 14),
                ("TOPPADDING", (0, -1), (-1, -1), 12),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
                
                # Borders
                ("BOX", (0, 0), (-1, -2), 1, colors.HexColor("#cbd5e1")),
                ("BOX", (0, -1), (-1, -1), 2, colors.HexColor("#1e3a8a")),
                ("LINEABOVE", (0, -1), (-1, -1), 2, colors.HexColor("#3b82f6")),
            ])
        )
        elements.append(totals_table)
        elements.append(Spacer(1, 0.4 * inch))

        # ============== NOTES SECTION ==============
        if sale_data.get("notes"):
            notes_style = ParagraphStyle(
                name="Notes",
                fontSize=10,
                leading=14,
                fontName="Helvetica",
            )
            notes_data = [[Paragraph(f"<b>Notes:</b><br/>{sale_data.get('notes')}", notes_style)]]
            notes_table = Table(notes_data, colWidths=[6.8 * inch])
            notes_table.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#fbbf24")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 15),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 15),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ])
            )
            elements.append(notes_table)
            elements.append(Spacer(1, 0.3 * inch))

        # ============== FOOTER SECTION ==============
        elements.append(Spacer(1, 0.5 * inch))
        
        footer_style = ParagraphStyle(
            name="Footer",
            fontSize=9,
            textColor=colors.HexColor("#6b7280"),
            alignment=TA_CENTER,
            leading=12,
        )
        
        footer_text = (
            f"<b>Thank you for your business!</b><br/>"
            f"<font size=8>This is a computer-generated invoice. "
            f"Generated on {self._get_ist_time_str('%B %d, %Y at %I:%M %p')}</font>"
        )
        
        footer_data = [[Paragraph(footer_text, footer_style)]]
        footer_table = Table(footer_data, colWidths=[6.8 * inch])
        footer_table.setStyle(
            TableStyle([
                ("LINEABOVE", (0, 0), (-1, 0), 1, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
            ])
        )
        elements.append(footer_table)

        # Build PDF
        doc.build(elements)

        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    def generate_calling_list_report_pdf(self, calling_data: List[Dict]) -> bytes:
        """Generate Calling List Report PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch)
        elements = []

        # Header
        self._add_header(elements, "Daily Calling List")

        # Summary
        total_calls = len(calling_data)
        high_priority = sum(1 for c in calling_data if c.get("priority") == "High")
        medium_priority = sum(1 for c in calling_data if c.get("priority") == "Medium")

        summary_data = [
            ["Total Calls", str(total_calls)],
            ["High Priority", str(high_priority)],
            ["Medium Priority", str(medium_priority)],
        ]

        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        summary_table = self._create_summary_table(summary_data, ["Metric", "Value"])
        elements.append(summary_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Calling list table
        elements.append(Paragraph("Call Details", self.styles["CustomSubtitle"]))
        elements.append(Spacer(1, 0.1 * inch))

        if calling_data:
            table_data = []
            for item in calling_data:
                table_data.append(
                    [
                        item.get("name", "N/A")[:20],
                        item.get("mobile", "N/A"),
                        item.get("village", "N/A")[:15],
                        item.get("priority", "Low"),
                        item.get("reason", "N/A")[:25],
                        item.get("user_email", "Unassigned")[:15] if "user_email" in item else "Unassigned",
                    ]
                )

            # Define column widths for better fit
            col_widths = [1.5*inch, 1.2*inch, 1.2*inch, 0.8*inch, 2.0*inch, 1.5*inch]
            
            calling_table = Table([["Name", "Mobile", "Village", "Priority", "Reason", "Assigned To"]] + table_data, colWidths=col_widths, repeatRows=1)
            calling_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, 0), 10),
                        ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                        ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                        ("TEXTCOLOR", (0, 1), (-1, -1), colors.black),
                        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                        ("FONTSIZE", (0, 1), (-1, -1), 9),
                        ("GRID", (0, 0), (-1, -1), 1, colors.black),
                        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
                    ]
                )
            )
            elements.append(calling_table)

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    # ══════════════════════════════════════════════════════════════════════════
    # PHASE 4 — ENHANCED FILTER-AWARE REPORTS
    # ══════════════════════════════════════════════════════════════════════════

    def _make_kpi_table(self, kpi: Dict) -> Table:
        """Render a 2-row KPI summary table."""
        labels = ["Total Revenue", "Total Volume", "Total Orders", "Avg Order Value", "Top District", "Top Product"]
        values = [
            f"Rs.{kpi.get('total_revenue', 0):,.0f}",
            f"{kpi.get('total_liters', 0):,.1f} L",
            str(kpi.get("total_orders", 0)),
            f"Rs.{kpi.get('avg_order_value', 0):,.0f}",
            kpi.get("top_district") or "—",
            kpi.get("top_product") or "—",
        ]
        data = [labels, values]
        t = Table(data, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 1), (-1, 1), 10),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#eff6ff")),
            ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#1e40af")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#1e40af")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#93c5fd")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        return t

    def _make_ranked_table(self, rows: List[Dict], headers: List[str], col_keys: List[str]) -> Table:
        """Build a ranked breakdown table from dimension rows."""
        if not rows:
            return Paragraph("No data available.", self.styles["Normal"])
        data = [headers]
        for i, row in enumerate(rows[:200], 1):
            data.append([str(row.get(k, "—")) for k in col_keys])
        t = Table(data, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("ALIGN", (1, 1), (1, -1), "LEFT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f9ff")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return t

    def generate_sales_analytics_pdf(
        self,
        kpi: Dict,
        district_rows: List[Dict],
        village_rows: List[Dict],
        product_rows: List[Dict],
        customer_rows: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        district_filter: Optional[str] = None,
        village_filter: Optional[str] = None,
    ) -> bytes:
        """
        Phase 4: Sales Analytics Report PDF.
        Contains: KPI block, District breakdown, Village breakdown,
        Product breakdown, Top 20 customers.
        All data reflects the same filters active in the UI.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch,
                                leftMargin=0.6 * inch, rightMargin=0.6 * inch)
        elements = []

        # Build filter description
        period_str = f"{start_date or 'All'} to {end_date or 'All'}"
        filter_parts = [f"Period: {period_str}"]
        if district_filter:
            filter_parts.append(f"District: {district_filter}")
        if village_filter:
            filter_parts.append(f"Village: {village_filter}")
        date_range = " | ".join(filter_parts)

        self._add_header(elements, "Sales Analytics Report", date_range)

        # ── KPI block ──────────────────────────────────────────────────────────
        elements.append(Paragraph("Key Performance Indicators", self.styles["CustomSubtitle"]))
        elements.append(self._make_kpi_table(kpi))
        elements.append(Spacer(1, 0.35 * inch))

        # ── District breakdown ─────────────────────────────────────────────────
        elements.append(Paragraph("Sales by District", self.styles["CustomSubtitle"]))
        dist_headers = ["#", "District", "Orders", "Revenue (Rs.)", "Volume (L)", "Share %"]
        dist_keys = ["rank", "label", "orders", "revenue", "liters", "pct"]
        elements.append(self._make_ranked_table(district_rows, dist_headers, dist_keys))
        elements.append(Spacer(1, 0.35 * inch))

        # ── Village breakdown ─────────────────────────────────────────────────
        elements.append(Paragraph("Sales by Village", self.styles["CustomSubtitle"]))
        vil_headers = ["#", "Village", "District", "Orders", "Revenue (Rs.)", "Volume (L)"]
        vil_keys = ["rank", "label", "secondary_label", "orders", "revenue", "liters"]
        elements.append(self._make_ranked_table(village_rows[:50], vil_headers, vil_keys))
        elements.append(PageBreak())

        # ── Product breakdown ─────────────────────────────────────────────────
        elements.append(Paragraph("Sales by Product / Packing", self.styles["CustomSubtitle"]))
        prod_headers = ["#", "Product", "Packing", "Orders", "Revenue (Rs.)", "Qty Sold", "Share %"]
        prod_keys = ["rank", "label", "secondary_label", "orders", "revenue", "liters", "pct"]
        elements.append(self._make_ranked_table(product_rows, prod_headers, prod_keys))
        elements.append(Spacer(1, 0.35 * inch))

        # ── Top 20 customers ──────────────────────────────────────────────────
        elements.append(Paragraph("Top 20 Customers", self.styles["CustomSubtitle"]))
        cust_headers = ["#", "Customer", "Location", "Orders", "Revenue (Rs.)", "Volume (L)"]
        cust_keys = ["rank", "label", "secondary_label", "orders", "revenue", "liters"]
        elements.append(self._make_ranked_table(customer_rows[:20], cust_headers, cust_keys))

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_sales_analytics_excel(
        self,
        kpi: Dict,
        district_rows: List[Dict],
        village_rows: List[Dict],
        product_rows: List[Dict],
        customer_rows: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Phase 4: Sales Analytics Report Excel — all dimensions in separate sheets."""
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Summary / KPI sheet
            kpi_df = pd.DataFrame([
                {"Metric": "Period", "Value": f"{start_date or 'All'} to {end_date or 'All'}"},
                {"Metric": "Total Revenue (Rs.)", "Value": kpi.get("total_revenue", 0)},
                {"Metric": "Total Volume (L)", "Value": kpi.get("total_liters", 0)},
                {"Metric": "Total Orders", "Value": kpi.get("total_orders", 0)},
                {"Metric": "Avg Order Value (Rs.)", "Value": kpi.get("avg_order_value", 0)},
                {"Metric": "Top District", "Value": kpi.get("top_district", "")},
                {"Metric": "Top District Revenue (Rs.)", "Value": kpi.get("top_district_amount", 0)},
                {"Metric": "Top Product", "Value": kpi.get("top_product", "")},
                {"Metric": "Top Product Revenue (Rs.)", "Value": kpi.get("top_product_amount", 0)},
                {"Metric": "Report Generated", "Value": self._get_ist_time_str()},
            ])
            kpi_df.to_excel(writer, sheet_name="KPI Summary", index=False)

            # District sheet
            if district_rows:
                dist_df = pd.DataFrame(district_rows)[["rank", "label", "orders", "revenue", "liters", "pct"]]
                dist_df.columns = ["Rank", "District", "Orders", "Revenue (Rs.)", "Volume (L)", "Share %"]
                dist_df.to_excel(writer, sheet_name="By District", index=False)

            # Village sheet
            if village_rows:
                vil_df = pd.DataFrame(village_rows)[["rank", "label", "secondary_label", "orders", "revenue", "liters", "pct"]]
                vil_df.columns = ["Rank", "Village", "District", "Orders", "Revenue (Rs.)", "Volume (L)", "Share %"]
                vil_df.to_excel(writer, sheet_name="By Village", index=False)

            # Product sheet
            if product_rows:
                prod_df = pd.DataFrame(product_rows)[["rank", "label", "secondary_label", "orders", "revenue", "liters", "pct"]]
                prod_df.columns = ["Rank", "Product", "Packing", "Orders", "Revenue (Rs.)", "Qty Sold", "Share %"]
                prod_df.to_excel(writer, sheet_name="By Product", index=False)

            # Customer sheet
            if customer_rows:
                cust_df = pd.DataFrame(customer_rows)[["rank", "label", "secondary_label", "orders", "revenue", "liters", "pct"]]
                cust_df.columns = ["Rank", "Customer", "Village/District", "Orders", "Revenue (Rs.)", "Volume (L)", "Share %"]
                cust_df.to_excel(writer, sheet_name="Top Customers", index=False)

        buffer.seek(0)
        return buffer.getvalue()

    def generate_product_report_pdf(
        self,
        product_rows: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Phase 4: Product / Packing breakdown PDF."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch,
                                leftMargin=0.6 * inch, rightMargin=0.6 * inch)
        elements = []

        period_str = f"Period: {start_date or 'All'} to {end_date or 'All'}"
        self._add_header(elements, "Product Performance Report", period_str)

        # Summary totals
        total_revenue = sum(r.get("revenue", 0) for r in product_rows)
        total_qty = sum(r.get("liters", 0) for r in product_rows)
        summary_data = [
            ["Total Products", str(len(product_rows))],
            ["Total Revenue", f"Rs.{total_revenue:,.0f}"],
            ["Total Qty Sold", f"{total_qty:,.0f}"],
        ]
        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        elements.append(self._create_summary_table(summary_data, ["Metric", "Value"]))
        elements.append(Spacer(1, 0.3 * inch))

        # Product table
        elements.append(Paragraph("Product-wise Breakdown", self.styles["CustomSubtitle"]))
        headers = ["#", "Product", "Packing", "Orders", "Qty Sold", "Revenue (Rs.)", "Share %"]
        keys = ["rank", "label", "secondary_label", "orders", "liters", "revenue", "pct"]
        elements.append(self._make_ranked_table(product_rows, headers, keys))

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_product_report_excel(
        self,
        product_rows: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Phase 4: Product report Excel."""
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            if product_rows:
                df = pd.DataFrame(product_rows)[["rank", "label", "secondary_label", "orders", "liters", "revenue", "pct"]]
                df.columns = ["Rank", "Product", "Packing", "Orders", "Qty Sold", "Revenue (Rs.)", "Share %"]
                df.to_excel(writer, sheet_name="Product Report", index=False)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_customer_analytics_pdf(
        self,
        customer_rows: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        district_filter: Optional[str] = None,
        village_filter: Optional[str] = None,
    ) -> bytes:
        """Phase 4: Customer Analytics PDF — ranked by revenue with sales stats per customer."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5 * inch,
                                leftMargin=0.6 * inch, rightMargin=0.6 * inch)
        elements = []

        filter_parts = [f"Period: {start_date or 'All'} to {end_date or 'All'}"]
        if district_filter:
            filter_parts.append(f"District: {district_filter}")
        if village_filter:
            filter_parts.append(f"Village: {village_filter}")
        self._add_header(elements, "Customer Analytics Report", " | ".join(filter_parts))

        # Summary
        total_customers = len(customer_rows)
        total_rev = sum(r.get("revenue", 0) for r in customer_rows)
        top_customer = customer_rows[0].get("label", "—") if customer_rows else "—"
        summary_data = [
            ["Total Customers", str(total_customers)],
            ["Total Revenue", f"Rs.{total_rev:,.0f}"],
            ["Top Customer", top_customer],
        ]
        elements.append(Paragraph("Summary", self.styles["CustomSubtitle"]))
        elements.append(self._create_summary_table(summary_data, ["Metric", "Value"]))
        elements.append(Spacer(1, 0.3 * inch))

        elements.append(Paragraph("Customer Rankings (by Revenue)", self.styles["CustomSubtitle"]))
        headers = ["#", "Sabhasad", "Village / District", "Orders", "Revenue (Rs.)", "Volume (L)", "Share %"]
        keys = ["rank", "label", "secondary_label", "orders", "revenue", "liters", "pct"]
        elements.append(self._make_ranked_table(customer_rows, headers, keys))

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_customer_analytics_excel(
        self,
        customer_rows: List[Dict],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> bytes:
        """Phase 4: Customer analytics Excel."""
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            if customer_rows:
                df = pd.DataFrame(customer_rows)[["rank", "label", "secondary_label", "orders", "revenue", "liters", "pct"]]
                df.columns = ["Rank", "Customer", "Village/District", "Orders", "Revenue (Rs.)", "Volume (L)", "Share %"]
                df.to_excel(writer, sheet_name="Customer Report", index=False)
        buffer.seek(0)
        return buffer.getvalue()
