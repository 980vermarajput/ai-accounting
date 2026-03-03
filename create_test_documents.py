#!/usr/bin/env python3
"""
Create realistic PDF and Excel test documents for AI accounting system testing.
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from datetime import datetime
import os

def create_invoice_pdf():
    """Create a professional invoice PDF"""
    doc = SimpleDocTemplate("TEST_INVOICE.pdf", pagesize=A4)
    story = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30,
        textColor=colors.darkblue,
        alignment=1  # Center
    )

    company_style = ParagraphStyle(
        'Company',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=6,
        textColor=colors.black
    )

    # Title
    story.append(Paragraph("INVOICE", title_style))
    story.append(Spacer(1, 20))

    # Company header
    company_info = [
        ["ABC Electronics Pvt Ltd", "Invoice No: INV-2026-001"],
        ["123 Business Park, Sector 15", "Date: March 3, 2026"],
        ["Gurgaon, Haryana - 122001", "Due Date: March 18, 2026"],
        ["GST No: 06AABCA1234E1Z5", ""],
        ["PAN No: AABCA1234E", ""]
    ]

    company_table = Table(company_info, colWidths=[3*inch, 2.5*inch])
    company_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('FONTSIZE', (0,0), (-1,-1), 11),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,0), (1,2), 'Helvetica-Bold'),
    ]))
    story.append(company_table)
    story.append(Spacer(1, 20))

    # Bill To
    story.append(Paragraph("<b>Bill To:</b>", company_style))
    bill_to = [
        ["XYZ Corporation"],
        ["456 Tech City, Phase 2"],
        ["Bangalore, Karnataka - 560001"],
        ["GST No: 29AABCX5678G1Z2"]
    ]

    bill_table = Table(bill_to, colWidths=[4*inch])
    bill_table.setStyle(TableStyle([
        ('FONTSIZE', (0,0), (-1,-1), 11),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(bill_table)
    story.append(Spacer(1, 20))

    # Items table
    items_data = [
        ['DESCRIPTION', 'QTY', 'RATE', 'AMOUNT'],
        ['Laptop Dell Inspiron 15 3000', '10', '₹45,000', '₹4,50,000'],
        ['Wireless Mouse', '10', '₹1,500', '₹15,000'],
        ['Extended Warranty (2 Years)', '10', '₹2,000', '₹20,000'],
        ['', '', 'SUB TOTAL:', '₹4,85,000'],
        ['', '', 'CGST @ 9%:', '₹43,650'],
        ['', '', 'SGST @ 9%:', '₹43,650'],
        ['', '', 'TOTAL GST:', '₹87,300'],
        ['', '', 'TOTAL AMOUNT:', '₹5,72,300']
    ]

    items_table = Table(items_data, colWidths=[3*inch, 0.7*inch, 1*inch, 1.3*inch])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.grey),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('ROWBACKGROUNDS', (0,1), (-1,-5), [colors.beige, colors.white]),
        ('GRID', (0,0), (-1,3), 1, colors.black),
        ('LINEBELOW', (0,3), (-1,3), 2, colors.black),
        ('FONTNAME', (2,4), (-1,-1), 'Helvetica-Bold'),
        ('BACKGROUND', (2,7), (-1,7), colors.lightblue),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 30))

    # Bank details
    bank_info = """
    <b>Bank Details:</b><br/>
    Account Name: ABC Electronics Pvt Ltd<br/>
    Bank: HDFC Bank<br/>
    Account No: 12345678901234<br/>
    IFSC Code: HDFC0001234<br/>
    Branch: Sector 14, Gurgaon
    """
    story.append(Paragraph(bank_info, company_style))
    story.append(Spacer(1, 30))

    # Signature
    signature_info = """
    For ABC Electronics Pvt Ltd<br/><br/>
    _____________________<br/>
    Authorized Signatory<br/>
    Name: Rajesh Kumar<br/>
    Designation: Finance Manager
    """
    story.append(Paragraph(signature_info, company_style))

    doc.build(story)
    print("✓ Created TEST_INVOICE.pdf")

def create_balance_sheet_excel():
    """Create a professional balance sheet in Excel"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Balance Sheet"

    # Styling
    header_font = Font(bold=True, size=14, color="FFFFFF")
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    title_font = Font(bold=True, size=16)
    bold_font = Font(bold=True)
    currency_font = Font(name='Arial', size=10)

    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    # Title
    ws.merge_cells('A1:C1')
    ws['A1'] = 'TECH SOLUTIONS PRIVATE LIMITED'
    ws['A1'].font = title_font
    ws['A1'].alignment = Alignment(horizontal='center')

    ws.merge_cells('A2:C2')
    ws['A2'] = 'Balance Sheet as at March 31, 2026'
    ws['A2'].font = bold_font
    ws['A2'].alignment = Alignment(horizontal='center')

    # Headers
    ws['A4'] = 'ASSETS'
    ws['A4'].font = header_font
    ws['A4'].fill = header_fill
    ws['C4'] = 'Amount (₹)'
    ws['C4'].font = header_font
    ws['C4'].fill = header_fill

    # Assets data
    assets_data = [
        ('NON-CURRENT ASSETS:', '', ''),
        ('Property, Plant & Equipment', '', ''),
        ('  - Land & Building', '', '15,00,000'),
        ('  - Plant & Machinery', '', '8,50,000'),
        ('  - Office Equipment', '', '2,25,000'),
        ('  - Computer & Software', '', '3,15,000'),
        ('Total Fixed Assets', '', '28,90,000'),
        ('', '', ''),
        ('CURRENT ASSETS:', '', ''),
        ('Inventories', '', '4,65,000'),
        ('Trade Receivables', '', '6,75,000'),
        ('Cash & Bank Balances', '', ''),
        ('  - Cash in Hand', '', '45,000'),
        ('  - Bank Balance - HDFC Bank', '', '2,85,000'),
        ('Other Current Assets', '', '1,25,000'),
        ('Total Current Assets', '', '15,95,000'),
        ('', '', ''),
        ('TOTAL ASSETS', '', '44,85,000')
    ]

    row = 5
    for item in assets_data:
        ws[f'A{row}'] = item[0]
        ws[f'C{row}'] = item[2]
        if 'Total' in item[0] or 'TOTAL' in item[0]:
            ws[f'A{row}'].font = bold_font
            ws[f'C{row}'].font = bold_font
        row += 1

    # Equity & Liabilities
    row += 2
    ws[f'A{row}'] = 'EQUITY & LIABILITIES'
    ws[f'A{row}'].font = header_font
    ws[f'A{row}'].fill = header_fill
    ws[f'C{row}'] = 'Amount (₹)'
    ws[f'C{row}'].font = header_font
    ws[f'C{row}'].fill = header_fill

    equity_data = [
        ('EQUITY:', '', ''),
        ('Share Capital', '', '10,00,000'),
        ('Retained Earnings', '', '8,45,000'),
        ('Other Comprehensive Income', '', '1,25,000'),
        ('Total Equity', '', '19,70,000'),
        ('', '', ''),
        ('NON-CURRENT LIABILITIES:', '', ''),
        ('Long-term Borrowings', '', '8,50,000'),
        ('Deferred Tax Liability', '', '1,35,000'),
        ('Total Non-Current Liabilities', '', '9,85,000'),
        ('', '', ''),
        ('CURRENT LIABILITIES:', '', ''),
        ('Trade Payables', '', '6,25,000'),
        ('Short-term Borrowings', '', '4,15,000'),
        ('Provisions', '', '2,85,000'),
        ('Other Current Liabilities', '', '2,05,000'),
        ('Total Current Liabilities', '', '15,30,000'),
        ('', '', ''),
        ('TOTAL EQUITY & LIABILITIES', '', '44,85,000')
    ]

    row += 1
    for item in equity_data:
        ws[f'A{row}'] = item[0]
        ws[f'C{row}'] = item[2]
        if 'Total' in item[0] or 'TOTAL' in item[0]:
            ws[f'A{row}'].font = bold_font
            ws[f'C{row}'].font = bold_font
        row += 1

    # Signatures
    row += 3
    ws[f'A{row}'] = 'For TECH SOLUTIONS PRIVATE LIMITED'
    ws[f'A{row}'].font = bold_font
    row += 3
    ws[f'A{row}'] = 'Chief Financial Officer'
    ws[f'C{row}'] = 'Managing Director'
    row += 1
    ws[f'A{row}'] = 'Priya Sharma, CA'
    ws[f'C{row}'] = 'Amit Kumar'
    row += 1
    ws[f'A{row}'] = 'Date: April 15, 2026'
    ws[f'C{row}'] = 'Date: April 15, 2026'

    # Adjust column widths
    ws.column_dimensions['A'].width = 35
    ws.column_dimensions['B'].width = 5
    ws.column_dimensions['C'].width = 15

    wb.save("TEST_BALANCE_SHEET.xlsx")
    print("✓ Created TEST_BALANCE_SHEET.xlsx")

def create_gst_return_excel():
    """Create a GST return in Excel format"""
    wb = Workbook()
    ws = wb.active
    ws.title = "GSTR-1"

    # Styling
    header_font = Font(bold=True, size=12, color="FFFFFF")
    header_fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
    title_font = Font(bold=True, size=14)
    bold_font = Font(bold=True)

    # Title and company info
    ws.merge_cells('A1:H1')
    ws['A1'] = 'GST RETURN FORM GSTR-1'
    ws['A1'].font = title_font
    ws['A1'].alignment = Alignment(horizontal='center')

    ws['A3'] = 'GREENTECH INDUSTRIES LIMITED'
    ws['A3'].font = bold_font
    ws['A4'] = 'GSTIN: 27AABCG1234H1ZP'
    ws['A5'] = 'Return Period: March 2026'
    ws['A6'] = 'Filing Date: April 10, 2026'

    # B2B Supplies header
    ws['A8'] = '4A - B2B SUPPLIES:'
    ws['A8'].font = bold_font

    headers = ['Invoice Date', 'Invoice No', 'Buyer GSTIN', 'Taxable Value', 'CGST', 'SGST', 'Total Tax']
    for i, header in enumerate(headers):
        cell = ws.cell(row=9, column=i+1)
        cell.value = header
        cell.font = header_font
        cell.fill = header_fill

    # B2B data
    b2b_data = [
        ['Mar 05, 2026', 'GTI/001/26', '29AABCX5678G1Z2', '₹5,00,000', '₹45,000', '₹45,000', '₹90,000'],
        ['Mar 12, 2026', 'GTI/002/26', '06AABCY9012F1Z8', '₹3,25,000', '₹29,250', '₹29,250', '₹58,500'],
        ['Mar 18, 2026', 'GTI/003/26', '33AABCZ3456J1Z1', '₹4,75,000', '₹42,750', '₹42,750', '₹85,500'],
        ['Mar 25, 2026', 'GTI/004/26', '24AABCW7890K1Z9', '₹2,85,000', '₹25,650', '₹25,650', '₹51,300']
    ]

    row = 10
    for data in b2b_data:
        for i, value in enumerate(data):
            ws.cell(row=row, column=i+1).value = value
        row += 1

    # Totals
    row += 1
    ws[f'A{row}'] = 'Total B2B Supplies: ₹15,85,000'
    ws[f'A{row}'].font = bold_font
    row += 1
    ws[f'A{row}'] = 'Total CGST: ₹1,42,650'
    row += 1
    ws[f'A{row}'] = 'Total SGST: ₹1,42,650'
    row += 1
    ws[f'A{row}'] = 'Total Tax: ₹2,85,300'
    ws[f'A{row}'].font = bold_font

    # Summary section
    row += 3
    ws[f'A{row}'] = 'TOTAL OUTWARD SUPPLIES:'
    ws[f'A{row}'].font = bold_font
    row += 1
    ws[f'A{row}'] = 'Taxable Value: ₹17,10,000'
    row += 1
    ws[f'A{row}'] = 'Total CGST: ₹1,53,900'
    row += 1
    ws[f'A{row}'] = 'Total SGST: ₹1,53,900'
    row += 1
    ws[f'A{row}'] = 'TOTAL GST COLLECTED: ₹3,07,800'
    ws[f'A{row}'].font = bold_font

    # ITC Section
    row += 3
    ws[f'A{row}'] = 'INPUT TAX CREDIT (ITC) CLAIMED:'
    ws[f'A{row}'].font = bold_font
    row += 1
    ws[f'A{row}'] = 'Total ITC Claimed: ₹1,98,250'

    # Net tax
    row += 3
    ws[f'A{row}'] = 'NET TAX PAYABLE:'
    ws[f'A{row}'].font = bold_font
    row += 1
    ws[f'A{row}'] = 'Total Net Tax: ₹1,54,800'
    ws[f'A{row}'].font = bold_font

    # Adjust column widths
    for col in range(1, 8):
        ws.column_dimensions[chr(64 + col)].width = 15

    wb.save("TEST_GST_RETURN.xlsx")
    print("✓ Created TEST_GST_RETURN.xlsx")

if __name__ == "__main__":
    print("Creating professional test documents...")

    create_invoice_pdf()
    create_balance_sheet_excel()
    create_gst_return_excel()

    print("\n🎉 Successfully created:")
    print("  1. TEST_INVOICE.pdf")
    print("  2. TEST_BALANCE_SHEET.xlsx")
    print("  3. TEST_GST_RETURN.xlsx")
    print("\nThese files are ready to upload to Google Drive for testing!")