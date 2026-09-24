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
from reportlab.lib.pagesizes import A4, letter, landscape
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


# ─── Unicode / Font Setup ──────────────────────────────────────────────────────
FONT_FAMILY = "Helvetica"
FONT_BOLD_FAMILY = "Helvetica-Bold"

try:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase.pdfmetrics import registerFontFamily

    base_dir = os.path.dirname(os.path.abspath(__file__))
    bundled_reg = os.path.join(base_dir, "data", "fonts", "NotoSansGujarati-Regular.ttf")
    bundled_bold = os.path.join(base_dir, "data", "fonts", "NotoSansGujarati-Bold.ttf")

    if os.path.exists(bundled_reg):
        pdfmetrics.registerFont(TTFont("NotoSansGujarati", bundled_reg))
        if os.path.exists(bundled_bold):
            pdfmetrics.registerFont(TTFont("NotoSansGujarati-Bold", bundled_bold))
        else:
            pdfmetrics.registerFont(TTFont("NotoSansGujarati-Bold", bundled_reg))
        registerFontFamily("NotoSansGujarati", normal="NotoSansGujarati", bold="NotoSansGujarati-Bold")
        FONT_FAMILY = "NotoSansGujarati"
        FONT_BOLD_FAMILY = "NotoSansGujarati-Bold"
    else:
        # Fallback to system fonts if bundled font is missing
        win_font = "C:/Windows/Fonts/Nirmala.ttc"
        if os.path.exists(win_font):
            pdfmetrics.registerFont(TTFont("NirmalaGujarati", win_font, subfontIndex=0))
            win_bold = "C:/Windows/Fonts/NirmalaB.ttc"
            if os.path.exists(win_bold):
                pdfmetrics.registerFont(TTFont("NirmalaGujarati-Bold", win_bold, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont("NirmalaGujarati-Bold", win_font, subfontIndex=0))
            registerFontFamily("NirmalaGujarati", normal="NirmalaGujarati", bold="NirmalaGujarati-Bold")
            FONT_FAMILY = "NirmalaGujarati"
            FONT_BOLD_FAMILY = "NirmalaGujarati-Bold"
except Exception as e:
    print(f"[Warning] Failed to load Unicode Gujarati font: {e}")


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas for Page X of Y page numbering and professional footer"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        page_w, page_h = self._pagesize
        footer_y = 0.35 * inch
        
        # Bottom divider line
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(0.4 * inch, footer_y + 12, page_w - 0.4 * inch, footer_y + 12)
        
        # Footer text
        self.setFont(FONT_FAMILY, 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(0.4 * inch, footer_y, "PARUL CHEMICALS  |  Official Telecaller Report")
        
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(page_w - 0.4 * inch, footer_y, page_str)
        self.restoreState()



REPORT_THEMES = {
    "performance": {
        "primary_color": "#1E40AF",
        "header_bg": "1E40AF",
        "card_bg": "#F8FAFC",
        "card_border": "#CBD5E1",
    },
    "attendance": {
        "primary_color": "#059669",
        "header_bg": "059669",
        "card_bg": "#ECFDF5",
        "card_border": "#A7F3D0",
    },
    "orders": {
        "primary_color": "#EA580C",
        "header_bg": "EA580C",
        "card_bg": "#FFF7ED",
        "card_border": "#FED7AA",
    },
    "call_logs": {
        "primary_color": "#7C3AED",
        "header_bg": "7C3AED",
        "card_bg": "#F5F3FF",
        "card_border": "#DDD6FE",
    },
}

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
            else:
                df = pd.DataFrame([["No records found for the selected filters."]], columns=["Status"])
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
            else:
                df = pd.DataFrame([["No records found for the selected filters."]], columns=["Status"])
            df.to_excel(writer, sheet_name="Customer Report", index=False)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_generic_table_pdf(
        self,
        title: str,
        subtitle: str,
        headers: List[str],
        data_rows: List[List[Any]],
        metadata_filters: List[str],
        summary_cards: Optional[List[Dict[str, Any]]] = None,
        summary_paragraph: Optional[str] = None,
        theme: Optional[Dict[str, str]] = None,
        col_widths: Optional[List[float]] = None,
    ) -> bytes:
        """Generic PDF generator for Telecaller Reports with Parul Chemicals branding, KPI cards, dynamic column width scaling, and Gujarati Unicode font support."""
        buffer = io.BytesIO()
        
        primary_hex = theme.get("primary_color", "#1E40AF") if theme else "#1E40AF"
        card_bg_hex = theme.get("card_bg", "#F8FAFC") if theme else "#F8FAFC"
        card_border_hex = theme.get("card_border", "#CBD5E1") if theme else "#CBD5E1"
        header_bg_hex = theme.get("header_bg", "1E40AF") if theme else "1E40AF"

        # Select orientation: Landscape for tables with > 5 columns, Portrait for <= 5
        is_landscape = len(headers) > 5
        page_size = landscape(A4) if is_landscape else A4
        page_width, page_height = page_size
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=page_size,
            topMargin=0.4 * inch,
            bottomMargin=0.6 * inch,
            leftMargin=0.4 * inch,
            rightMargin=0.4 * inch
        )
        elements = []

        # ── 1. Corporate Branding Header (Logo + Parul Chemicals) ──────────────
        logo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "logo.png"))
        
        co_title_style = ParagraphStyle(
            name="CoTitleStyle",
            parent=self.styles["Normal"],
            fontName=FONT_BOLD_FAMILY,
            fontSize=16,
            textColor=colors.HexColor("#1E3A8A"),
            leading=18
        )
        co_addr_style = ParagraphStyle(
            name="CoAddrStyle",
            parent=self.styles["Normal"],
            fontName=FONT_FAMILY,
            fontSize=7.5,
            textColor=colors.HexColor("#475569"),
            leading=10
        )
        report_title_style = ParagraphStyle(
            name="ReportTitleStyle",
            parent=self.styles["Normal"],
            fontName=FONT_BOLD_FAMILY,
            fontSize=13,
            textColor=colors.HexColor(primary_hex),
            alignment=TA_RIGHT,
            leading=16
        )

        left_header_flowables = []
        if os.path.exists(logo_path):
            try:
                img = Image(logo_path, width=42, height=42)
                co_text = Paragraph(
                    "<b>PARUL CHEMICALS</b><br/>"
                    "<font size=7.5 color='#475569'>SURVEY NO.63, A/PART-1, VILLAGE- PANCHDEVLA, TALUKO - WAGHODIA, VADODARA-391510</font>",
                    co_title_style
                )
                hdr_sub_table = Table([[img, co_text]], colWidths=[50, None])
                hdr_sub_table.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]))
                left_header_flowables.append(hdr_sub_table)
            except Exception:
                left_header_flowables.append(Paragraph("<b>PARUL CHEMICALS</b>", co_title_style))
        else:
            left_header_flowables.append(Paragraph("<b>PARUL CHEMICALS</b>", co_title_style))

        right_header_text = Paragraph(f"<b>{title.upper()}</b>", report_title_style)
        
        header_table = Table(
            [[left_header_flowables[0], right_header_text]],
            colWidths=[(page_width - 0.8 * inch) * 0.65, (page_width - 0.8 * inch) * 0.35]
        )
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(header_table)
        
        # Divider Line
        div_table = Table([[""]], colWidths=[page_width - 0.8 * inch])
        div_table.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 1.5, colors.HexColor(primary_hex)),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(div_table)
        elements.append(Spacer(1, 0.1 * inch))

        # ── 2. Applied Filters & Reporting Period Metadata Block ──────────────
        meta_style = ParagraphStyle(
            name="MetaBlockStyle",
            parent=self.styles["Normal"],
            fontName=FONT_FAMILY,
            fontSize=8,
            textColor=colors.HexColor("#334155"),
            leading=11
        )
        
        time_now_str = self._get_ist_time_str("%B %d, %Y at %I:%M %p")
        filter_items = [f"<b>Generated:</b> {time_now_str}"]
        if subtitle:
            filter_items.append(f"<b>{subtitle}</b>")
        if metadata_filters:
            filter_items.extend([f"<b>{m.split(':', 1)[0]}:</b> {m.split(':', 1)[1]}" if ":" in m else f"<b>{m}</b>" for m in metadata_filters])

        meta_html = "  &nbsp;|&nbsp;  ".join(filter_items)
        meta_p = Paragraph(meta_html, meta_style)
        
        meta_table = Table([[meta_p]], colWidths=[page_width - 0.8 * inch])
        meta_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 0.15 * inch))

        # ── 3. KPI Summary Cards Grid (if provided) ───────────────────────────
        if summary_cards:
            cards_elements = []
            for card in summary_cards:
                lbl = card.get("label", "")
                val = card.get("value", "")
                sub = card.get("subLabel", "")
                
                card_html = f"<b><font size=7.5 color='#64748B'>{lbl.upper()}</font></b><br/>" \
                            f"<b><font size=12 color='{primary_hex}'>{val}</font></b>"
                if sub:
                    card_html += f"<br/><font size=7 color='#94A3B8'>{sub}</font>"
                    
                p = Paragraph(card_html, ParagraphStyle(
                    name="CardStyle",
                    parent=self.styles["Normal"],
                    alignment=TA_CENTER,
                    leading=13,
                    fontName=FONT_FAMILY
                ))
                cards_elements.append(p)
                
            avail_card_w = page_width - 0.8 * inch
            # Break cards into rows if > 5 cards
            cards_per_row = 4 if len(cards_elements) > 4 else len(cards_elements)
            rows_of_cards = [cards_elements[i:i + cards_per_row] for i in range(0, len(cards_elements), cards_per_row)]
            
            for c_row in rows_of_cards:
                c_w = avail_card_w / max(len(c_row), 1)
                c_table = Table([c_row], colWidths=[c_w] * len(c_row))
                c_table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(card_bg_hex)),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(card_border_hex)),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor(card_border_hex)),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]))
                elements.append(c_table)
                elements.append(Spacer(1, 0.08 * inch))
            elements.append(Spacer(1, 0.08 * inch))

        # ── 4. Narrative Summary Paragraph (if provided) ─────────────────────
        if summary_paragraph:
            p_narrative = Paragraph(
                summary_paragraph,
                ParagraphStyle(
                    name="SummaryNarrative",
                    parent=self.styles["Normal"],
                    fontName=FONT_FAMILY,
                    fontSize=8.5,
                    textColor=colors.HexColor("#334155"),
                    leading=12,
                )
            )
            elements.append(p_narrative)
            elements.append(Spacer(1, 0.15 * inch))

        # ── 5. Main Data Table ───────────────────────────────────────────────
        if not data_rows:
            elements.append(Spacer(1, 0.2 * inch))
            no_rec_p = Paragraph(
                "<b>No records found for the selected filters.</b>",
                ParagraphStyle(name="NoRec", parent=self.styles["Normal"], fontName=FONT_FAMILY, fontSize=9, textColor=colors.HexColor("#64748B"))
            )
            elements.append(no_rec_p)
        else:
            header_style = ParagraphStyle(
                name="PDFHeaderStyle",
                parent=self.styles["Normal"],
                fontSize=8.5,
                textColor=colors.whitesmoke,
                fontName=FONT_BOLD_FAMILY,
                alignment=TA_LEFT
            )
            cell_style = ParagraphStyle(
                name="PDFCellStyle",
                parent=self.styles["Normal"],
                fontSize=8,
                textColor=colors.HexColor("#1E293B"),
                fontName=FONT_FAMILY,
                leading=11,
                alignment=TA_LEFT
            )

            table_data = []
            # Header Row
            hdr_cells = [Paragraph(f"<b>{str(h)}</b>", header_style) for h in headers]
            table_data.append(hdr_cells)

            # Data Rows
            for row in data_rows:
                row_cells = []
                for item in row:
                    item_str = str(item) if item is not None else ""
                    row_cells.append(Paragraph(item_str, cell_style))
                table_data.append(row_cells)

            # Calculate proportional column widths
            avail_width = page_width - 0.8 * inch
            if col_widths and len(col_widths) == len(headers):
                widths = col_widths
            else:
                weights = []
                for h in headers:
                    h_lower = str(h).lower()
                    if any(k in h_lower for k in ["notes", "products"]):
                        weights.append(3.2)
                    elif any(k in h_lower for k in ["customer", "name", "telecaller", "village", "district", "sabhasad"]):
                        weights.append(1.6)
                    elif any(k in h_lower for k in ["rank", "#", "date", "time", "status", "calls", "orders", "pct", "%", "days", "duration", "items"]):
                        weights.append(0.85)
                    else:
                        weights.append(1.0)
                total_w = sum(weights)
                widths = [(w / total_w) * avail_width for w in weights]

            t = Table(table_data, colWidths=widths, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{header_bg_hex}")),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                ("TOPPADDING", (0, 1), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ]))
            elements.append(t)

        doc.build(elements, canvasmaker=NumberedCanvas)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_generic_table_excel(
        self,
        sheet_name: str,
        headers: List[str],
        data_rows: List[List[Any]],
        metadata_filters: Optional[List[str]] = None,
        theme: Optional[Dict[str, str]] = None,
        title: Optional[str] = None,
        subtitle: Optional[str] = None,
        summary_cards: Optional[List[Dict[str, Any]]] = None,
        summary_paragraph: Optional[str] = None,
    ) -> bytes:
        """Generic Excel generator with openpyxl corporate header, KPI block, theme fills, freeze panes, auto-filters, status highlights, and clean cell formatting."""
        buffer = io.BytesIO()
        header_bg_hex = theme.get("header_bg", "1E40AF") if theme else "1E40AF"
        primary_hex = theme.get("primary_color", "#1E40AF") if theme else "#1E40AF"
        primary_hex_clean = primary_hex[1:] if primary_hex.startswith("#") else primary_hex

        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter

        wb = Workbook()
        ws = wb.active
        clean_sheet_title = (title or sheet_name)[:31].replace(":", "").replace("/", "").replace("\\", "").replace("?", "").replace("*", "").replace("[", "").replace("]", "")
        ws.title = clean_sheet_title or "Report"

        # Typography & Styles
        title_font = Font(name="Calibri", size=14, bold=True, color="1E3A8A")
        sub_font = Font(name="Calibri", size=9.5, italic=True, color="475569")
        kpi_label_font = Font(name="Calibri", size=8.5, bold=True, color="475569")
        kpi_val_font = Font(name="Calibri", size=12, bold=True, color=primary_hex_clean)
        header_font = Font(name="Calibri", size=10.5, bold=True, color="FFFFFF")
        cell_font = Font(name="Calibri", size=10, color="1E293B")
        
        header_fill = PatternFill(start_color=header_bg_hex, end_color=header_bg_hex, fill_type="solid")
        kpi_lbl_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        kpi_val_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        alt_row_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

        # Status Fills & Fonts
        status_approved_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
        status_approved_font = Font(name="Calibri", size=10, bold=True, color="15803D")
        
        status_rejected_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
        status_rejected_font = Font(name="Calibri", size=10, bold=True, color="B91C1C")
        
        status_pending_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
        status_pending_font = Font(name="Calibri", size=10, bold=True, color="B45309")

        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )
        kpi_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        current_row = 1

        # 1. Title Banner
        report_heading = f"PARUL CHEMICALS  |  {(title or sheet_name)}"
        ws.cell(row=current_row, column=1, value=report_heading)
        ws.cell(row=current_row, column=1).font = title_font
        ws.row_dimensions[current_row].height = 24
        current_row += 1

        # 2. Metadata / Subtitle Filter Line
        meta_parts = []
        if subtitle:
            meta_parts.append(subtitle)
        if metadata_filters:
            meta_parts.extend(metadata_filters)
        meta_parts.append(f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")
        
        meta_line = "  |  ".join(meta_parts)
        ws.cell(row=current_row, column=1, value=meta_line)
        ws.cell(row=current_row, column=1).font = sub_font
        ws.row_dimensions[current_row].height = 18
        current_row += 1

        # 3. KPI Summary Section (if available)
        if summary_cards:
            current_row += 1  # blank gap
            kpi_start_row = current_row
            col_idx = 1
            for card in summary_cards:
                lbl = card.get("label", "")
                val = card.get("value", "")
                
                c_lbl = ws.cell(row=kpi_start_row, column=col_idx, value=str(lbl).upper())
                c_lbl.font = kpi_label_font
                c_lbl.fill = kpi_lbl_fill
                c_lbl.alignment = Alignment(horizontal="center", vertical="center")
                c_lbl.border = kpi_border
                
                c_val = ws.cell(row=kpi_start_row + 1, column=col_idx, value=str(val))
                c_val.font = kpi_val_font
                c_val.fill = kpi_val_fill
                c_val.alignment = Alignment(horizontal="center", vertical="center")
                c_val.border = kpi_border
                
                col_idx += 1
            
            ws.row_dimensions[kpi_start_row].height = 16
            ws.row_dimensions[kpi_start_row + 1].height = 22
            current_row = kpi_start_row + 2

        current_row += 1  # Blank spacing before data table

        # 4. Data Table Header
        header_row_idx = current_row
        col_names = headers if data_rows else ["Status"]
        
        for col_i, h_name in enumerate(col_names, 1):
            cell = ws.cell(row=header_row_idx, column=col_i, value=h_name)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border
        
        ws.row_dimensions[header_row_idx].height = 24

        # 5. Data Rows
        data_start_row = header_row_idx + 1
        if not data_rows:
            cell = ws.cell(row=data_start_row, column=1, value="No records found for the selected filters.")
            cell.font = cell_font
            cell.alignment = Alignment(horizontal="left", vertical="center")
            cell.border = thin_border
            last_data_row = data_start_row
        else:
            for r_idx, row_data in enumerate(data_rows, data_start_row):
                row_fill = white_fill if (r_idx % 2 == 0) else alt_row_fill
                ws.row_dimensions[r_idx].height = 20
                
                for c_idx, val in enumerate(row_data, 1):
                    cell = ws.cell(row=r_idx, column=c_idx, value=val)
                    cell.font = cell_font
                    cell.fill = row_fill
                    cell.border = thin_border
                    
                    hdr_lower = str(col_names[c_idx - 1] if c_idx - 1 < len(col_names) else "").lower()
                    val_str = str(val or "").strip()
                    val_upper = val_str.upper()

                    # Alignments
                    if any(k in hdr_lower for k in ["rank", "#", "date", "time", "status", "calls", "orders", "rate", "pct", "%", "days", "phone"]):
                        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                    elif any(k in hdr_lower for k in ["amount", "revenue", "price", "total", "qty", "volume"]):
                        cell.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
                    else:
                        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

                    # Status Cell Styling
                    if "status" in hdr_lower or val_upper in ["APPROVED", "REJECTED", "PENDING", "UNCONFIRMED", "CONNECTED", "NOT REACHABLE", "PRESENT", "ABSENT"]:
                        if any(s in val_upper for s in ["APPROV", "CONNECT", "PRESENT", "SUCCESS"]):
                            cell.fill = status_approved_fill
                            cell.font = status_approved_font
                        elif any(s in val_upper for s in ["REJECT", "CANCEL", "NOT REACHABLE", "ABSENT", "FAIL"]):
                            cell.fill = status_rejected_fill
                            cell.font = status_rejected_font
                        elif any(s in val_upper for s in ["PENDING", "UNCONFIRM", "IN PROGRESS"]):
                            cell.fill = status_pending_fill
                            cell.font = status_pending_font

            last_data_row = data_start_row + len(data_rows) - 1

        # 6. Freeze Panes & AutoFilter
        ws.freeze_panes = f"A{header_row_idx + 1}"
        last_col_letter = get_column_letter(len(col_names))
        ws.auto_filter.ref = f"A{header_row_idx}:{last_col_letter}{last_data_row}"

        # 7. Column Width Auto-Scaling
        for col_idx in range(1, len(col_names) + 1):
            col_letter = get_column_letter(col_idx)
            hdr_name = str(col_names[col_idx - 1]).lower()
            
            max_len = len(str(col_names[col_idx - 1]))
            for r in range(header_row_idx, last_data_row + 1):
                cell_val = str(ws.cell(row=r, column=col_idx).value or "")
                if len(cell_val) > max_len:
                    max_len = len(cell_val)
            
            if any(k in hdr_name for k in ["notes", "summary", "products"]):
                target_w = min(max(max_len + 3, 16), 48)
            elif any(k in hdr_name for k in ["customer", "telecaller", "user", "name", "village", "district"]):
                target_w = min(max(max_len + 3, 14), 32)
            else:
                target_w = min(max(max_len + 3, 11), 22)
                
            ws.column_dimensions[col_letter].width = target_w

        wb.save(buffer)
        buffer.seek(0)
        return buffer.getvalue()
