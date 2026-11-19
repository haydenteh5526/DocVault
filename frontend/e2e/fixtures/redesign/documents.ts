// Twelve synthetic household documents for the redesign screenshots.
// Every name, amount and date is invented. Each one is drawn as a plain image
// of its text, so OCR reads it the same way it reads the bill in app.spec.ts.

export interface SeedDocument {
  /** The document's title in the list; also the upload's file name (without extension). */
  title: string
  lines: string[]
}

export const OCTOBER_BILL = 'Example Energy — October 2026'

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    title: OCTOBER_BILL,
    lines: [
      'EXAMPLE ENERGY',
      'Electricity bill',
      'Statement issued: 2 November 2026',
      'Billing period: 1 October 2026 to 31 October 2026',
      'Electricity charges: EUR 102.00',
      'Taxes and fees: EUR 21.47',
      'Total amount due: EUR 123.47',
      'Payment due date: 23 November 2026',
    ],
  },
  {
    title: 'Example Energy — September 2026',
    lines: [
      'EXAMPLE ENERGY',
      'Electricity bill',
      'Statement issued: 3 October 2026',
      'Billing period: 1 September 2026 to 30 September 2026',
      'Total amount due: EUR 98.20',
      'Payment due date: 24 October 2026',
    ],
  },
  {
    title: 'Linkline Broadband — November 2026',
    lines: [
      'LINKLINE BROADBAND',
      'Monthly bill',
      'Statement issued: 5 November 2026',
      'Billing period: 1 November 2026 to 30 November 2026',
      'Total amount due: EUR 45.00',
      'Payment due date: 20 November 2026',
    ],
  },
  {
    title: 'Water charges — July to September 2026',
    lines: [
      'EXAMPLE WATER',
      'Water charges',
      'Statement issued: 14 October 2026',
      'Billing period: 1 July 2026 to 30 September 2026',
      'Total amount due: EUR 61.30',
      'Payment due date: 14 November 2026',
    ],
  },
  {
    title: 'Tenancy agreement 2026–27',
    lines: [
      'TENANCY AGREEMENT',
      'Term: 1 September 2026 to 31 August 2027',
      'Monthly rent: EUR 1,200.00, due on the 1st of each month',
      'The tenants keep the house clean and report repairs promptly.',
    ],
  },
  {
    title: 'Washer-dryer manual (model WD8)',
    lines: [
      'WASHER-DRYER MODEL WD8',
      'User manual',
      'Keep your proof of purchase.',
      'The guarantee does not cover misuse.',
      'Clean the filter once a month.',
    ],
  },
  {
    title: 'Washer-dryer warranty card',
    lines: [
      'WASHER-DRYER MODEL WD8',
      'Warranty card',
      'Warranty period: 2 years from the date of purchase, parts and labour.',
      'Purchased: 12 June 2026',
    ],
  },
  {
    title: 'Kettle receipt',
    lines: [
      'EXAMPLE HOME STORE',
      'Receipt: kettle, EUR 34.99',
      'Date: 30 September 2026',
      'Returns within 30 days. Manufacturer warranty applies after that.',
    ],
  },
  {
    title: 'Car insurance renewal 2027',
    lines: [
      'EXAMPLE INSURANCE',
      'Car insurance renewal',
      'Issued: 9 November 2026',
      'Renewal date: 15 January 2027',
      'Annual premium: EUR 640.00',
    ],
  },
  {
    title: 'Bin collection calendar 2026',
    lines: [
      'BIN COLLECTION CALENDAR 2026',
      'General waste: every second Tuesday',
      'Recycling: every second Friday',
      'Issued: 4 January 2026',
    ],
  },
  {
    title: 'Home contents insurance schedule',
    lines: [
      'EXAMPLE INSURANCE',
      'Home contents insurance schedule',
      'Issued: 1 March 2026',
      'Contents covered up to EUR 25,000.00',
    ],
  },
  {
    title: 'Scan_2026-11-02_EXAMPLE-ENERGY-statement-account-ending-0042-page1-of-1-FINAL(2)',
    lines: [
      'EXAMPLE ENERGY',
      'Electricity bill',
      'Statement issued: 2 November 2026',
      'Account ending 0042',
      'Total amount due: EUR 123.47',
    ],
  },
]
