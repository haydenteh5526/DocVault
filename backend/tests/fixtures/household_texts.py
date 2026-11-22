"""Synthetic household document texts. Every name, amount and date is invented.

The first twelve mirror frontend/e2e/fixtures/redesign/documents.ts; the rest are
lookalikes of the live-run documents.
"""

OCTOBER_BILL = (
    "EXAMPLE ENERGY\nElectricity bill\nStatement issued: 2 November 2026\n"
    "Billing period: 1 October 2026 to 31 October 2026\nElectricity charges: EUR 102.00\n"
    "Taxes and fees: EUR 21.47\nTotal amount due: EUR 123.47\nPayment due date: 23 November 2026"
)
SEPTEMBER_BILL = (
    "EXAMPLE ENERGY\nElectricity bill\nStatement issued: 3 October 2026\n"
    "Billing period: 1 September 2026 to 30 September 2026\nTotal amount due: EUR 98.20\n"
    "Payment due date: 24 October 2026"
)
BROADBAND_BILL = (
    "LINKLINE BROADBAND\nMonthly bill\nStatement issued: 5 November 2026\n"
    "Billing period: 1 November 2026 to 30 November 2026\nTotal amount due: EUR 45.00\n"
    "Payment due date: 20 November 2026"
)
WATER_BILL = (
    "EXAMPLE WATER\nWater charges\nStatement issued: 14 October 2026\n"
    "Billing period: 1 July 2026 to 30 September 2026\nTotal amount due: EUR 61.30\n"
    "Payment due date: 14 November 2026"
)
TENANCY = (
    "TENANCY AGREEMENT\nTerm: 1 September 2026 to 31 August 2027\n"
    "Monthly rent: EUR 1,200.00, due on the 1st of each month\n"
    "The tenants keep the house clean and report repairs promptly."
)
WASHER_MANUAL = (
    "WASHER-DRYER MODEL WD8\nUser manual\nKeep your proof of purchase.\n"
    "The guarantee does not cover misuse.\nClean the filter once a month."
)
WASHER_WARRANTY_CARD = (
    "WASHER-DRYER MODEL WD8\nWarranty card\n"
    "Warranty period: 2 years from the date of purchase, parts and labour.\nPurchased: 12 June 2026"
)
KETTLE_RECEIPT = (
    "EXAMPLE HOME STORE\nReceipt: kettle, EUR 34.99\nDate: 30 September 2026\n"
    "Returns within 30 days. Manufacturer warranty applies after that."
)
CAR_INSURANCE = (
    "EXAMPLE INSURANCE\nCar insurance renewal\nIssued: 9 November 2026\n"
    "Renewal date: 15 January 2027\nAnnual premium: EUR 640.00"
)
BIN_CALENDAR = (
    "BIN COLLECTION CALENDAR 2026\nGeneral waste: every second Tuesday\n"
    "Recycling: every second Friday\nIssued: 4 January 2026"
)
HOME_INSURANCE_SCHEDULE = (
    "EXAMPLE INSURANCE\nHome contents insurance schedule\nIssued: 1 March 2026\n"
    "Contents covered up to EUR 25,000.00"
)
SCAN_STATEMENT = (
    "EXAMPLE ENERGY\nElectricity bill\nStatement issued: 2 November 2026\n"
    "Account ending 0042\nTotal amount due: EUR 123.47"
)

# Live-run lookalikes
LAPTOP_RECEIPT = (
    "FERNHILL STORE\nReceipt: Fernhill FL14 laptop, EUR 899.00\nDate: 8 January 2026\n"
    "2-year manufacturer warranty included.\nWarranty expires: 8 January 2028"
)
HOME_INSURANCE_RENEWAL = (
    "EXAMPLE INSURANCE\nHome insurance renewal notice\nIssued: 2 November 2026\n"
    "Renewal date: 12 December 2026\nAnnual premium: EUR 310.00"
)
ELECTRICITY_BILL_LIVE = (
    "EXAMPLE ENERGY\nElectricity bill\nStatement issued: 2 November 2026\n"
    "Total amount due: EUR 123.47\nPayment due date: 23 November 2026"
)
BROADBAND_BILL_LIVE = (
    "LINKLINE BROADBAND\nBroadband bill\nStatement issued: 5 November 2026\n"
    "Total amount due: EUR 45.00\nPayment due date: 20 November 2026"
)

EXPECTED_KINDS = {
    "OCTOBER_BILL": "Bill",
    "SEPTEMBER_BILL": "Bill",
    "BROADBAND_BILL": "Bill",
    "WATER_BILL": "Bill",
    "TENANCY": "Contract",
    "WASHER_MANUAL": "Manual",
    "WASHER_WARRANTY_CARD": "Warranty",
    "KETTLE_RECEIPT": "Receipt",
    "CAR_INSURANCE": "Insurance",
    "BIN_CALENDAR": "Other",
    "HOME_INSURANCE_SCHEDULE": "Insurance",
    "SCAN_STATEMENT": "Bill",
    "LAPTOP_RECEIPT": "Receipt",
    "HOME_INSURANCE_RENEWAL": "Insurance",
    "ELECTRICITY_BILL_LIVE": "Bill",
    "BROADBAND_BILL_LIVE": "Bill",
}
