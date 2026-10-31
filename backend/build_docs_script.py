"""
Complete System Documentation Generator for Parul Chemicals (PC-Sales ERP/CRM)
Generates:
1. docs/PROJECT_DOCUMENTATION.md (Exhaustive Markdown Documentation)
2. docs/Parul_Chemicals_Complete_System_Documentation.pdf (Professional PDF Document)
"""
import os
import sys
import json
from datetime import datetime

# Import reportlab
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and draw 'Page X of Y',
    running header, and running footer.
    """
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
            # Skip cover page
            return
        
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#1e293b"))
        # Running Header
        self.drawString(54, A4[1] - 36, "PARUL CHEMICALS (PC-SALES) — COMPLETE SYSTEM DOCUMENTATION")
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawRightString(A4[0] - 54, A4[1] - 36, "CONFIDENTIAL & PROPRIETARY")
        
        # Header line
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.75)
        self.line(54, A4[1] - 42, A4[0] - 54, A4[1] - 42)

        # Running Footer
        self.line(54, 46, A4[0] - 54, 46)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(54, 34, f"Generated: {datetime.now().strftime('%B %d, %Y')} | Version 2.4.0 Production")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(A4[0] - 54, 34, page_text)
        self.restoreState()

print("Script template ready...")

