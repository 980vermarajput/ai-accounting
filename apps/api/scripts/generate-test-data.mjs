/**
 * generate-test-data.mjs
 *
 * Creates realistic dummy files for an Indian CA firm to use as Gmail attachments
 * during local development / testing of the sync + RAG pipeline.
 *
 * Run from apps/api:
 *   node scripts/generate-test-data.mjs
 *
 * Output folder: apps/api/scripts/test-data/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "test-data");

fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Helpers ─────────────────────────────────────────────────────

function write(filename, content) {
  const dest = path.join(OUT_DIR, filename);
  fs.writeFileSync(dest, content);
  console.log(`  ✓  ${filename}`);
}

function writeXlsx(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, path.join(OUT_DIR, filename));
  console.log(`  ✓  ${filename}`);
}

/**
 * Minimal valid PDF containing readable text.
 * pdf-parse extracts text from the stream object — this is enough for our extractor.
 */
function makePdf(title, lines) {
  const body = lines.join("\n");
  // We encode it as a simple PDF with a single text stream
  const stream = `BT\n/F1 11 Tf\n50 750 Td\n(${title.replace(/[()\\]/g, "\\$&")}) Tj\n0 -20 Td\n` +
    lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj\n0 -15 Td`).join("\n") +
    `\nET`;

  const streamBytes = Buffer.from(stream, "latin1");

  const objects = [];

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`);
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`,
  );
  objects.push(
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj`,
  );
  objects.push(
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
  );

  let pdf = `%PDF-1.4\n`;
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += objects[i] + "\n";
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const o of offsets) {
    pdf += String(o).padStart(10, "0") + ` 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

// ─── 1. GST Return Summary (PDF) ─────────────────────────────────

console.log("\nGenerating test files for Indian CA firm...\n");

write(
  "GST_Return_Q3_FY2025_Mehta_Traders.pdf",
  makePdf("GST Return - Q3 FY 2024-25", [
    "Taxpayer: Mehta Traders Pvt Ltd",
    "GSTIN: 27AABCM1234F1ZP",
    "Return Period: October - December 2024",
    "Return Type: GSTR-3B",
    "",
    "OUTWARD SUPPLIES (SALES)",
    "Taxable Value: Rs. 18,45,000",
    "CGST @ 9%: Rs. 1,66,050",
    "SGST @ 9%: Rs. 1,66,050",
    "Total GST Collected: Rs. 3,32,100",
    "",
    "INWARD SUPPLIES (PURCHASES)",
    "Total ITC Available: Rs. 2,10,500",
    "ITC on Capital Goods: Rs. 45,000",
    "ITC on Services: Rs. 32,000",
    "Total ITC Claimed: Rs. 2,87,500",
    "",
    "NET TAX PAYABLE",
    "Output GST: Rs. 3,32,100",
    "Less: ITC: Rs. 2,87,500",
    "Net Payable: Rs. 44,600",
    "",
    "Payment Reference: GSTIN2024Q3PMT001",
    "Filing Date: 20-01-2025",
    "Status: Filed",
  ]),
);

// ─── 2. Balance Sheet (PDF) ───────────────────────────────────────

write(
  "Balance_Sheet_FY2025_Mehta_Traders.pdf",
  makePdf("Balance Sheet as at 31 March 2025", [
    "Company: Mehta Traders Pvt Ltd",
    "CIN: U51900MH2018PTC123456",
    "Prepared by: Sharma & Associates, CA",
    "",
    "EQUITY AND LIABILITIES",
    "Share Capital: Rs. 25,00,000",
    "Retained Earnings: Rs. 8,42,300",
    "Long-Term Borrowings (HDFC Bank OD): Rs. 12,00,000",
    "Short-Term Borrowings: Rs. 4,50,000",
    "Trade Payables: Rs. 6,23,100",
    "GST Payable: Rs. 44,600",
    "Total Equity & Liabilities: Rs. 56,60,000",
    "",
    "ASSETS",
    "Fixed Assets (Net Block): Rs. 18,20,000",
    "Capital WIP: Rs. 2,00,000",
    "Inventories: Rs. 14,30,000",
    "Trade Receivables: Rs. 15,40,000",
    "Cash & Bank Balances: Rs. 4,80,000",
    "Other Current Assets: Rs. 1,90,000",
    "Total Assets: Rs. 56,60,000",
    "",
    "Auditor: Rajesh Sharma, CA (M.No. 123456)",
    "UDIN: 25123456ABCDEF7890",
  ]),
);

// ─── 3. Income Tax Computation (PDF) ─────────────────────────────

write(
  "ITR_Computation_AY2025-26_Mehta_Traders.pdf",
  makePdf("Income Tax Computation - AY 2025-26", [
    "Assessee: Mehta Traders Pvt Ltd",
    "PAN: AABCM1234F",
    "Assessment Year: 2025-26",
    "Previous Year: 2024-25",
    "",
    "COMPUTATION OF TOTAL INCOME",
    "Net Profit as per P&L: Rs. 12,84,500",
    "Add: Disallowances u/s 40A(3): Rs. 45,000",
    "Add: Depreciation as per books: Rs. 2,10,000",
    "Less: Depreciation u/s 32: Rs. 2,85,000",
    "Add: Inadmissible expenses: Rs. 18,000",
    "Total Income from Business: Rs. 12,72,500",
    "",
    "TAX CALCULATION",
    "Tax @ 22% (Sec 115BAA): Rs. 2,79,950",
    "Surcharge @ 10%: Rs. 27,995",
    "Health & Education Cess @ 4%: Rs. 12,318",
    "Total Tax Liability: Rs. 3,20,263",
    "Less: Advance Tax Paid: Rs. 2,80,000",
    "Less: TDS Deducted: Rs. 24,500",
    "Self Assessment Tax Payable: Rs. 15,763",
    "",
    "Filing Date: 30-09-2025",
    "Acknowledgement No.: 123456789012345",
  ]),
);

// ─── 4. Trial Balance (Excel) ─────────────────────────────────────

writeXlsx("Trial_Balance_March2025_Mehta_Traders.xlsx", {
  "Trial Balance": [
    ["MEHTA TRADERS PVT LTD", "", "", ""],
    ["Trial Balance as at 31 March 2025", "", "", ""],
    ["", "", "", ""],
    ["Account", "Account Code", "Debit (Rs.)", "Credit (Rs.)"],
    ["Share Capital", "1001", "", "25,00,000"],
    ["Retained Earnings", "1002", "", "8,42,300"],
    ["HDFC Bank OD", "2001", "", "12,00,000"],
    ["Short Term Loan - Kotak", "2002", "", "4,50,000"],
    ["Trade Payables", "2003", "", "6,23,100"],
    ["GST Payable", "2004", "", "44,600"],
    ["Plant & Machinery (Net)", "3001", "18,20,000", ""],
    ["Capital Work in Progress", "3002", "2,00,000", ""],
    ["Inventories - Raw Material", "4001", "8,50,000", ""],
    ["Inventories - Finished Goods", "4002", "5,80,000", ""],
    ["Trade Receivables", "4003", "15,40,000", ""],
    ["Cash in Hand", "4004", "80,000", ""],
    ["HDFC Current Account", "4005", "4,00,000", ""],
    ["Other Current Assets", "4006", "1,90,000", ""],
    ["Sales", "5001", "", "1,84,50,000"],
    ["Cost of Goods Sold", "6001", "1,42,30,000", ""],
    ["Employee Salaries", "6002", "18,40,000", ""],
    ["Rent Expense", "6003", "3,60,000", ""],
    ["Depreciation", "6004", "2,10,000", ""],
    ["Misc Expenses", "6005", "1,40,000", ""],
    ["Income Tax Expense", "6006", "3,20,263", ""],
    ["", "", "", ""],
    ["TOTAL", "", "2,28,10,263", "2,28,10,000"],
    ["Difference (rounding)", "", "", "263"],
  ],
});

// ─── 5. GST Purchase Register (Excel) ────────────────────────────

writeXlsx("GST_Purchase_Register_Q3_FY2025.xlsx", {
  "Purchase Register": [
    [
      "Date",
      "Supplier Name",
      "GSTIN",
      "Invoice No",
      "Taxable Amt",
      "CGST",
      "SGST",
      "IGST",
      "Total",
    ],
    [
      "01-Oct-24",
      "Tata Steel Ltd",
      "21AAACT2727Q1ZV",
      "TS/2024/10/4521",
      "1,20,000",
      "10,800",
      "10,800",
      "",
      "1,41,600",
    ],
    [
      "05-Oct-24",
      "Reliance Industries",
      "27AAACR5055K1Z5",
      "RIL/OCT/8834",
      "85,000",
      "7,650",
      "7,650",
      "",
      "1,00,300",
    ],
    [
      "12-Oct-24",
      "M/s Gupta Packaging",
      "07AABCG4321H1ZM",
      "GP/24-25/321",
      "32,500",
      "",
      "",
      "5,850",
      "38,350",
    ],
    [
      "18-Oct-24",
      "Infosys BPM Ltd",
      "29AABCI0048N1ZG",
      "INF/SVC/4892",
      "45,000",
      "4,050",
      "4,050",
      "",
      "53,100",
    ],
    [
      "25-Oct-24",
      "Hindustan Unilever",
      "27AAACH4446M1ZL",
      "HUL/MH/7723",
      "28,000",
      "2,520",
      "2,520",
      "",
      "33,040",
    ],
    [
      "03-Nov-24",
      "HDFC Bank (Charges)",
      "24AAAEH0468N1Z5",
      "HDFC/NOV/4501",
      "8,000",
      "720",
      "720",
      "",
      "9,440",
    ],
    [
      "14-Nov-24",
      "Amazon Business",
      "29AAGCS4259H1ZR",
      "AMZ/B2B/84432",
      "18,500",
      "1,665",
      "1,665",
      "",
      "21,830",
    ],
    [
      "22-Nov-24",
      "Maersk India (Freight)",
      "27AABCM8931F1ZQ",
      "MAE/FRT/2024/112",
      "55,000",
      "",
      "",
      "9,900",
      "64,900",
    ],
    [
      "08-Dec-24",
      "Schneider Electric",
      "07AABCS4045G1Z2",
      "SE/DEL/7812",
      "92,000",
      "",
      "",
      "16,560",
      "1,08,560",
    ],
    [
      "20-Dec-24",
      "Quick Heal Technologies",
      "27AABCQ0123P1Z3",
      "QH/LIC/9901",
      "12,000",
      "1,080",
      "1,080",
      "",
      "14,160",
    ],
    ["", "", "", "", "", "", "", "", ""],
    [
      "TOTAL",
      "",
      "",
      "",
      "4,96,000",
      "28,485",
      "28,485",
      "32,310",
      "5,85,280",
    ],
  ],
});

// ─── 6. Sales Invoice (plain text) ───────────────────────────────

write(
  "Invoice_INV2025_0042_Mehta_Traders.txt",
  `TAX INVOICE
================================================================================
Mehta Traders Pvt Ltd
123, Industrial Area, Andheri East, Mumbai - 400093
GSTIN: 27AABCM1234F1ZP | PAN: AABCM1234F
Phone: +91 22 4567 8901 | Email: accounts@mehtatraders.in
================================================================================

Invoice No  : INV/2025-26/0042
Invoice Date: 15-Feb-2025
Due Date    : 17-Mar-2025

BILL TO:
Krishnamurthy Exports Ltd
45, MIDC, Pune - 411018
GSTIN: 27AABCK9876D1ZR

--------------------------------------------------------------------------------
#   Description                    HSN/SAC   Qty   Unit Rate     Amount
--------------------------------------------------------------------------------
1   HR Steel Coils (3mm)           7208      10 MT  85,000/MT  8,50,000.00
2   CR Steel Sheets (1.5mm)        7209      05 MT  92,000/MT  4,60,000.00
3   Galvanised Iron Sheets         7210      03 MT  78,000/MT  2,34,000.00
4   Transportation & Handling      9965       -        -          35,000.00
--------------------------------------------------------------------------------
                                          Taxable Value  15,79,000.00
                                          CGST @ 9%       1,42,110.00
                                          SGST @ 9%       1,42,110.00
                                          Round Off              0.80
                                          TOTAL          18,63,220.80
================================================================================

Bank Details:
Bank: HDFC Bank | Branch: Andheri East
A/c No: 50200012345678 | IFSC: HDFC0001234

Terms: Payment within 30 days. Interest @ 18% p.a. on delayed payments.
This is a computer-generated invoice and does not require a signature.
================================================================================
`,
);

// ─── 7. Salary Register (CSV) ────────────────────────────────────

write(
  "Salary_Register_Feb2025_Mehta_Traders.csv",
  `Emp ID,Employee Name,Designation,Department,Basic,HRA,Conveyance,Medical,Gross,PF (Employee),ESI,Prof Tax,TDS,Net Pay
E001,Suresh Nair,General Manager,Operations,75000,30000,1600,1250,107850,9000,0,200,8500,90150
E002,Priya Sharma,Accounts Manager,Finance,55000,22000,1600,1250,79850,6600,0,200,4200,68850
E003,Ravi Kumar,Senior Executive,Sales,38000,15200,1600,1250,56050,4560,2100,200,1800,47390
E004,Anita Desai,HR Executive,HR,32000,12800,1600,1250,47650,3840,2100,200,1200,40310
E005,Manoj Patil,Store Keeper,Operations,28000,11200,1600,1250,42050,3360,2100,200,0,36390
E006,Kavitha Rao,Junior Accountant,Finance,26000,10400,1600,1250,39250,3120,2100,200,0,33830
E007,Deepak Mehta,Sales Executive,Sales,24000,9600,1600,1250,36450,2880,2100,200,0,31270
E008,Sanjay Gupta,Delivery Supervisor,Logistics,22000,8800,1600,1250,33650,2640,2100,200,0,28710
E009,Rekha Joshi,Receptionist,Admin,20000,8000,1600,1250,30850,2400,2100,200,0,26150
E010,Vijay Tiwari,Security Guard,Admin,18000,7200,1600,1250,28050,2160,2100,200,0,23590
,,,,,,,,,,,,,,
TOTAL,,,,338000,135200,16000,12500,501650,40560,16800,2000,15700,426740
`,
);

// ─── 8. Bank Reconciliation Statement (CSV) ──────────────────────

write(
  "Bank_Reconciliation_Feb2025_HDFC.csv",
  `BANK RECONCILIATION STATEMENT
Mehta Traders Pvt Ltd | HDFC Current A/c No: 50200012345678
As at 28 February 2025

PARTICULARS,AMOUNT (Rs.)
Balance as per Bank Statement (28-Feb-2025),4,82,340.50
,,
ADD: Deposits in transit (not credited by bank),,
  INV/2025-26/0039 - Krishnamurthy Exports,"1,18,000.00"
  INV/2025-26/0041 - Shree Enterprises,"84,500.00"
Total Deposits in Transit,"2,02,500.00"
,,
LESS: Outstanding Cheques (issued but not presented),,
  Chq No 004521 - Tata Steel Ltd,"1,41,600.00"
  Chq No 004522 - Gupta Packaging,"38,350.00"
  Chq No 004523 - Employee Salaries,"4,26,740.00"
Total Outstanding Cheques,"6,06,690.00"
,,
Adjusted Bank Balance,"4,78,150.50"
Balance as per Cash Book (28-Feb-2025),"4,78,150.50"
Difference,0.00
,,
Prepared by: Priya Sharma | Reviewed by: Rajesh Sharma CA
`,
);

// ─── Done ─────────────────────────────────────────────────────────

console.log(`\n✅  All files written to: ${OUT_DIR}\n`);
console.log("Files ready to attach to Gmail:");
fs.readdirSync(OUT_DIR).forEach((f) => console.log(`  • ${f}`));
console.log(`
Suggested email subjects to use:
  1. "GST Return Q3 FY2024-25 - Mehta Traders"       → attach GST_Return_Q3 PDF
  2. "Balance Sheet & ITR Documents FY2025"           → attach Balance_Sheet + ITR PDFs
  3. "Salary Register February 2025"                  → attach Salary CSV
  4. "Trial Balance + Purchase Register Q3"           → attach both Excel files
  5. "Invoice INV/2025-26/0042 - Payment Request"     → attach Invoice TXT
  6. "Bank Reconciliation February 2025"              → attach Bank Recon CSV
`);
