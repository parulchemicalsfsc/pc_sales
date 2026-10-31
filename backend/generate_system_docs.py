# -*- coding: utf-8 -*-
"""
generate_system_docs.py
-----------------------
Comprehensive System Documentation Generator for Parul Chemicals FSC (PC-Sales ERP/CRM).
Produces:
  1. docs/PROJECT_DOCUMENTATION.md
  2. docs/Parul_Chemicals_Complete_System_Documentation.pdf
"""

import os
import sys
import json
from datetime import datetime

# Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(BASE_DIR), "docs")
os.makedirs(DOCS_DIR, exist_ok=True)

MD_PATH = os.path.join(DOCS_DIR, "PROJECT_DOCUMENTATION.md")
PDF_PATH = os.path.join(DOCS_DIR, "Parul_Chemicals_Complete_System_Documentation.pdf")

# Load extracted routes
ROUTES_PATH = os.path.join(BASE_DIR, "scratch", "extracted_routes.json")
routes_data = []
if os.path.exists(ROUTES_PATH):
    with open(ROUTES_PATH, "r", encoding="utf-8") as f:
        routes_data = json.load(f)

print(f"Loaded {len(routes_data)} routes.")

# ReportLab imports
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
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
        if self._pageNumber == 1:
            return  # Suppress running header/footer on title page
        
        self.saveState()
        # Running Header
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#0f172a"))
        self.drawString(45, A4[1] - 30, "PARUL CHEMICALS (PC-SALES) — SYSTEM DOCUMENTATION")
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawRightString(A4[0] - 45, A4[1] - 30, "ENTERPRISE SPECIFICATION | V2.4")
        
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.6)
        self.line(45, A4[1] - 35, A4[0] - 45, A4[1] - 35)

        # Running Footer
        self.line(45, 42, A4[0] - 45, 42)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(45, 30, "CONFIDENTIAL — FOR INTERNAL USE ONLY")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(A4[0] - 45, 30, page_str)
        self.restoreState()

print("NumberedCanvas initialized.")

