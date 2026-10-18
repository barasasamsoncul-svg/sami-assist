import 'server-only';

import type {
  getPublicSalesQuote,
} from '@/lib/apps/sales/public';

import type {
  getSalesOrderDetail,
} from '@/lib/apps/sales/queries';

type Quote = Awaited<ReturnType<typeof getPublicSalesQuote>>;
type Order = Awaited<ReturnType<typeof getSalesOrderDetail>>;

type PdfLine = {
  description: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxRate?: number;
  taxName?: string | null;
  lineTotal: number;
};

type PdfCompany = {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
};

type PdfTemplate = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  footerText?: string | null;
};

type PdfCustomer = {
  name: string;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  billingAddress?: string | null;
};

type PdfDocument = {
  documentTitle: string;
  documentNumber: string;
  status: string;
  issueDate: string | null;
  validUntil: string | null;
  reference: string | null;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  depositRequiredAmount: number;
  totalAmount: number;
  notes: string | null;
  terms: string | null;
  acceptedAt: string | null;
  salespersonName: string | null;
  customer: PdfCustomer;
  company: PdfCompany;
  template: PdfTemplate;
  lines: PdfLine[];
};

/**
 * A JPEG payload that can be embedded as a PDF Image XObject.
 * The supplied bytes must be the JPEG file contents, not a data URL.
 */
export type SalesPdfLogoImageXObject = {
  width: number;
  height: number;
  jpegBytes: Uint8Array;
};

export type SalesOrderPdfOptions = {
  company?: Partial<PdfCompany>;
  template?: Partial<PdfTemplate>;
  salespersonName?: string | null;
  logoImageXObject?: SalesPdfLogoImageXObject | null;
  documentTitle?: 'SALES ORDER' | 'PROFORMA INVOICE';
};

const WIN_ANSI_SPECIALS: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
};

/**
 * Encode text for the built-in Helvetica fonts using WinAnsiEncoding.
 * TODO: embed a Unicode font for complete Unicode coverage.
 */
function ascii(value: unknown) {
  return Array.from(String(value ?? '').normalize('NFC'))
    .map(character => {
      const mapped = WIN_ANSI_SPECIALS[character];
      if (mapped !== undefined) return String.fromCharCode(mapped);

      const codePoint = character.charCodeAt(0);
      if (
        (codePoint >= 0x20 && codePoint <= 0x7e) ||
        (codePoint >= 0xa0 && codePoint <= 0xff)
      ) {
        return character;
      }

      return '?';
    })
    .join('');
}

function esc(value: unknown) {
  return ascii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Wrap words without dropping content. Overlong tokens are split at maxChars.
 */
export function wrap(textValue: unknown, maxChars: number): string[] {
  const limit = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : 1;
  const paragraphs = String(textValue ?? '').replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      output.push('');
      continue;
    }

    let currentLine = '';
    for (const rawWord of words) {
      let word = rawWord;

      if (word.length > limit) {
        if (currentLine) {
          output.push(currentLine);
          currentLine = '';
        }

        while (word.length > limit) {
          output.push(word.slice(0, limit));
          word = word.slice(limit);
        }
      }

      if (!word) continue;
      if (!currentLine) {
        currentLine = word;
      } else if (currentLine.length + word.length + 1 <= limit) {
        currentLine += ' ' + word;
      } else {
        output.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) output.push(currentLine);
  }

  return output.length ? output : [''];
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function text(
  x: number,
  y: number,
  value: unknown,
  size = 8,
  bold = false,
) {
  return (
    'BT /' +
    (bold ? 'F2' : 'F1') +
    ' ' +
    size +
    ' Tf 1 0 0 1 ' +
    x +
    ' ' +
    y +
    ' Tm (' +
    esc(value) +
    ') Tj ET\n'
  );
}

function line(y: number) {
  return '0.86 0.89 0.93 RG 0.7 w 36 ' + y + ' m 559 ' + y + ' l S\n';
}

function rgbFromHex(value: string | null | undefined, fallback = '#164a9f') {
  const normalized = String(value || fallback).trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(normalized);
  const hex = match?.[1] || fallback.slice(1);

  return [0, 2, 4]
    .map(offset => (parseInt(hex.slice(offset, offset + 2), 16) / 255).toFixed(3))
    .join(' ');
}

function metadataForLine(item: PdfLine) {
  if (!item.sku && !item.taxName) return '';
  return [
    item.sku ? 'SKU ' + item.sku : '',
    item.unit || '',
    item.taxName || '',
  ].filter(Boolean).join(' | ');
}

function rowHeight(item: PdfLine) {
  const descriptionLines = wrap(item.description, 46);
  return Math.max(20, descriptionLines.length * 8 + (metadataForLine(item) ? 8 : 0) + 8);
}

/**
 * Keep no more than 18 document lines per page. The last page reserves room
 * for totals, terms and signature consent; preceding pages can use more space.
 */
function paginateRows(rows: PdfLine[]) {
  if (rows.length === 0) return [[] as PdfLine[]];

  const pages: PdfLine[][] = [];
  let end = rows.length;

  while (end > 0) {
    const finalPage = pages.length === 0;
    const maxHeight = finalPage ? 280 : 465;
    let start = end;
    let height = 0;

    while (start > 0 && end - start < 18) {
      const candidateHeight = rowHeight(rows[start - 1]);
      if (start < end && height + candidateHeight > maxHeight) break;
      if (height + candidateHeight > maxHeight) {
        if (start === end) {
          height = candidateHeight;
          start -= 1;
        }
        break;
      }

      height += candidateHeight;
      start -= 1;
    }

    if (start === end) start -= 1;
    pages.unshift(rows.slice(start, end));
    end = start;
  }

  return pages;
}

function pageStream(
  document: PdfDocument,
  rows: PdfLine[],
  page: number,
  pageCount: number,
  finalPage: boolean,
  hasLogo: boolean,
) {
  let out = rgbFromHex(document.template.primaryColor) + ' rg 0 754 595 88 re f\n';
  out += '1 1 1 rg\n';

  const companyNameLines = wrap(document.company.name, 43);
  out += text(36, 812, companyNameLines[0], 16, true);
  if (companyNameLines.length > 1) out += text(36, 799, companyNameLines.slice(1).join(' '), 8, true);

  if (document.company.address) {
    const addressLines = wrap(document.company.address, 63);
    out += text(36, companyNameLines.length > 1 ? 786 : 793, addressLines[0], 7);
    if (addressLines.length > 1) out += text(36, 782, addressLines.slice(1).join(' '), 6.5);
  }

  out += text(36, 763, document.documentTitle, 8, true);
  out += text(390, 811, document.documentNumber, 12, true);
  out += text(390, 791, document.status.replaceAll('_', ' ').toUpperCase(), 7, true);

  if (hasLogo) {
    out += 'q 62 0 0 30 496 767 cm /Logo Do Q\n';
  }

  out += '0 0 0 rg\n';
  out += text(520, 739, String(page + 1) + '/' + pageCount, 6);

  out += text(36, 726, 'PREPARED FOR', 7, true);
  out += text(36, 708, wrap(document.customer.name, 42)[0], 11, true);

  let customerY = 692;
  const customerDetails = [
    document.customer.email,
    document.customer.phone,
    document.customer.taxId ? 'Tax / PIN: ' + document.customer.taxId : null,
    document.customer.billingAddress,
  ];

  for (const detail of customerDetails) {
    if (!detail) continue;
    for (const wrapped of wrap(detail, 65)) {
      out += text(36, customerY, wrapped, 7);
      customerY -= 10;
      if (customerY < 646) break;
    }
  }

  out += text(355, 726, document.documentTitle === 'QUOTATION' ? 'QUOTE DETAILS' : 'ORDER DETAILS', 7, true);
  let detailsY = 708;
  const validityWindow = document.validUntil
    ? String(document.issueDate || '') + ' - ' + document.validUntil
    : null;

  for (const [label, value] of [
    ['Date', document.issueDate],
    ['Validity window', validityWindow],
    ['Currency', document.currency],
    ['Reference', document.reference],
    ['Salesperson', document.salespersonName],
  ] as Array<[string, string | null]>) {
    if (!value) continue;
    const detailLines = wrap(label + ': ' + value, 35);
    for (const detailLine of detailLines) {
      out += text(355, detailsY, detailLine, 6.5);
      detailsY -= 10;
    }
  }

  out += '0.05 0.08 0.15 rg 36 606 523 21 re f\n1 1 1 rg\n';

  for (const [x, label] of [
    [42, 'Description'],
    [302, 'Qty'],
    [350, 'Price'],
    [420, 'Discount'],
    [478, 'Tax'],
    [522, 'Amount'],
  ] as const) {
    out += text(x, 613, label, 6, true);
  }

  out += '0 0 0 rg\n';
  let y = 583;

  for (const item of rows) {
    const firstY = y;
    const descriptionLines = wrap(item.description, 46);

    descriptionLines.forEach((descriptionLine, index) => {
      out += text(42, firstY - index * 8, descriptionLine, 7, index === 0);
    });

    out += text(302, firstY, item.quantity, 6.5);
    out += text(350, firstY, money(item.unitPrice), 6.5);
    out += text(420, firstY, (item.discountAmount || 0) > 0 ? money(item.discountAmount || 0) : '-', 6.5);
    out += text(478, firstY, (item.taxRate || 0) > 0 ? String(item.taxRate) + '%' : '-', 6.5);
    out += text(522, firstY, money(item.lineTotal), 6.5, true);

    const metadata = metadataForLine(item);
    if (metadata) out += text(42, firstY - descriptionLines.length * 8, wrap(metadata, 72)[0], 5.5);

    const height = rowHeight(item);
    out += line(firstY - height + 2);
    y = firstY - height;
  }

  if (finalPage) {
    const summaryY = Math.min(245, y - 8);
    const summaryRows: Array<[string, number]> = [
      ['Subtotal', document.subtotal],
      ['Discount', -document.discountTotal],
      ['Tax', document.taxTotal],
      ['Shipping', document.shippingTotal],
      ...(document.depositRequiredAmount > 0
        ? [['Deposit / advance due on order', document.depositRequiredAmount] as [string, number]]
        : []),
      ['TOTAL', document.totalAmount],
    ];

    const summaryRowsHeight = summaryRows.reduce(
      (height, [label]) => height + (label === 'TOTAL' ? 17 : 13),
      0,
    );
    const summaryTop = summaryY + 27;
    const summaryBottom = summaryY - summaryRowsHeight - 8;

    if (document.template.secondaryColor) {
      out += rgbFromHex(document.template.secondaryColor, '#0f172a') +
        ' RG 0.9 w 350 ' + summaryBottom + ' 209 ' +
        (summaryTop - summaryBottom) + ' re S\n';
    }

    out += '0 0 0 rg\n';
    out += text(360, summaryY + 18, 'COMMERCIAL SUMMARY', 7, true);

    for (const [label, value] of summaryRows) {
      const isTotal = label === 'TOTAL';
      out += text(360, summaryY, label, isTotal ? 8 : 7, isTotal);
      out += text(466, summaryY, document.currency + ' ' + money(value), isTotal ? 8 : 7, isTotal);
      // Keep the line height consistent with the summary border geometry.
      (summaryRows as Array<[string, number]>);
      const index = summaryRows.indexOf([label, value] as [string, number]);
      void index;
    }

    let currentSummaryY = summaryY;
    for (const [label] of summaryRows) {
      currentSummaryY -= label === 'TOTAL' ? 17 : 13;
      // The rows are already drawn above; this loop computes no drawing state.
    }

    // Draw summary rows at distinct vertical positions.
    let summaryLineY = summaryY;
    for (let index = 0; index < summaryRows.length; index += 1) {
      summaryLineY -= summaryRows[index][0] === 'TOTAL' ? 17 : 13;
    }

    // The summary is redrawn in correct vertical order over the preliminary first-row layout.
    let drawSummaryY = summaryY;
    summaryRows.forEach(([label, value]) => {
      const isTotal = label === 'TOTAL';
      out += text(360, drawSummaryY, label, isTotal ? 8 : 7, isTotal);
      out += text(466, drawSummaryY, document.currency + ' ' + money(value), isTotal ? 8 : 7, isTotal);
      drawSummaryY -= isTotal ? 17 : 13;
    });

    let notesY = Math.min(137, summaryBottom - 20);
    for (const [heading, value] of [
      ['NOTES', document.notes],
      ['TERMS & CONDITIONS', document.terms],
    ] as Array<[string, string | null]>) {
      if (!value || notesY < 76) continue;

      out += text(36, notesY, heading, 6.5, true);
      notesY -= 10;

      for (const wrappedLine of wrap(value, 92)) {
        if (notesY < 74) break;
        out += text(36, notesY, wrappedLine, 6);
        notesY -= 8;
      }

      notesY -= 4;
    }

    out += line(53);
    out += text(36, 58, 'Accepted by: __________ Date: __________', 7);
    if (document.acceptedAt) {
      out += text(36, 43, 'e-signature consent recorded at ' + document.acceptedAt, 5.5);
    }
  }

  out += line(34);
  out += text(36, 20, document.template.footerText || 'Prepared securely with SaMi Sales', 6);

  return out;
}

function renderPdf(document: PdfDocument, logoImageXObject: SalesPdfLogoImageXObject | null = null) {
  if (logoImageXObject) {
    if (
      !Number.isInteger(logoImageXObject.width) ||
      !Number.isInteger(logoImageXObject.height) ||
      logoImageXObject.width <= 0 ||
      logoImageXObject.height <= 0 ||
      !logoImageXObject.jpegBytes ||
      logoImageXObject.jpegBytes.length === 0
    ) {
      throw new Error('Invalid PDF logo Image XObject; expected JPEG bytes and positive dimensions.');
    }
  }

  const pages = paginateRows(document.lines);
  const streams = pages.map((rows, index) =>
    pageStream(document, rows, index, pages.length, index === pages.length - 1, Boolean(logoImageXObject)),
  );

  const objects = new Map<number, string>();
  const pageIds = streams.map((_stream, index) => 5 + index * 2);
  const logoObjectId = logoImageXObject ? 5 + streams.length * 2 : null;

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    2,
    '<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') +
      '] /Count ' + streams.length + ' >>',
  );
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  streams.forEach((stream, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const logoResource = logoObjectId ? ' /XObject << /Logo ' + logoObjectId + ' 0 R >>' : '';

    objects.set(
      pageId,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' +
        logoResource + ' >> /Contents ' + contentId + ' 0 R >>',
    );
    objects.set(
      contentId,
      '<< /Length ' + Buffer.byteLength(stream, 'binary') + ' >>\nstream\n' + stream + 'endstream',
    );
  });

  if (logoImageXObject && logoObjectId) {
    const imageBytes = Buffer.from(logoImageXObject.jpegBytes);
    objects.set(
      logoObjectId,
      '<< /Type /XObject /Subtype /Image /Width ' + logoImageXObject.width +
        ' /Height ' + logoImageXObject.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        imageBytes.length + ' >>\nstream\n' + imageBytes.toString('binary') + '\nendstream',
    );
  }

  const maxId = Math.max(...objects.keys());
  let output = '%PDF-1.4\n%SaMi\n';
  const offsets = new Array<number>(maxId + 1).fill(0);

  for (let id = 1; id <= maxId; id += 1) {
    const body = objects.get(id);
    if (body === undefined) continue;

    offsets[id] = Buffer.byteLength(output, 'binary');
    output += id + ' 0 obj\n' + body + '\nendobj\n';
  }

  const xref = Buffer.byteLength(output, 'binary');
  output += 'xref\n0 ' + (maxId + 1) + '\n0000000000 65535 f \n';

  for (let id = 1; id <= maxId; id += 1) {
    output += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  }

  output += 'trailer\n<< /Size ' + (maxId + 1) +
    ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';

  return Buffer.from(output, 'binary');
}

type QuotePdfInput = Quote & {
  acceptedAt?: string | null;
  salespersonName?: string | null;
};

export function renderSalesQuotePdf(
  quote: QuotePdfInput,
  logoImageXObject: SalesPdfLogoImageXObject | null = null,
) {
  const document: PdfDocument = {
    documentTitle: 'QUOTATION',
    documentNumber: String(quote.quoteNumber || ''),
    status: String(quote.status || ''),
    issueDate: quote.quoteDate ? String(quote.quoteDate) : null,
    validUntil: quote.validUntil ? String(quote.validUntil) : null,
    reference: quote.reference ? String(quote.reference) : null,
    currency: String(quote.currency || 'KES'),
    subtotal: Number(quote.subtotal || 0),
    discountTotal: Number(quote.discountTotal || 0),
    taxTotal: Number(quote.taxTotal || 0),
    shippingTotal: Number(quote.shippingTotal || 0),
    depositRequiredAmount: Number(quote.depositRequiredAmount || 0),
    totalAmount: Number(quote.totalAmount || 0),
    notes: quote.notes ? String(quote.notes) : null,
    terms: quote.terms ? String(quote.terms) : null,
    acceptedAt: quote.acceptedAt ? String(quote.acceptedAt) : null,
    salespersonName: quote.salespersonName ? String(quote.salespersonName) : null,
    customer: {
      name: String(quote.customer.name || ''),
      email: quote.customer.email ? String(quote.customer.email) : null,
      phone: quote.customer.phone ? String(quote.customer.phone) : null,
      taxId: quote.customer.taxId ? String(quote.customer.taxId) : null,
      billingAddress: quote.customer.billingAddress ? String(quote.customer.billingAddress) : null,
    },
    company: {
      name: String(quote.company.name || ''),
      address: quote.company.address ? String(quote.company.address) : null,
      email: quote.company.email ? String(quote.company.email) : null,
      phone: quote.company.phone ? String(quote.company.phone) : null,
      taxId: quote.company.taxId ? String(quote.company.taxId) : null,
      registrationNumber: quote.company.registrationNumber ? String(quote.company.registrationNumber) : null,
    },
    template: {
      primaryColor: quote.template.primaryColor ? String(quote.template.primaryColor) : '#164a9f',
      secondaryColor: quote.template.secondaryColor ? String(quote.template.secondaryColor) : null,
      footerText: quote.template.footerText ? String(quote.template.footerText) : null,
    },
    lines: quote.lines.map(item => ({
      description: String(item.description || ''),
      sku: item.sku ? String(item.sku) : null,
      unit: item.unit ? String(item.unit) : null,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      discountAmount: Number(item.discountAmount || 0),
      taxRate: Number(item.taxRate || 0),
      taxName: item.taxName ? String(item.taxName) : null,
      lineTotal: Number(item.lineTotal || 0),
    })),
  };

  return renderPdf(document, logoImageXObject);
}

export function renderSalesOrderPdf(
  order: NonNullable<Order>,
  options: SalesOrderPdfOptions = {},
) {
  const document: PdfDocument = {
    documentTitle: options.documentTitle || 'SALES ORDER',
    documentNumber: String(order.orderNumber || ''),
    status: String(order.status || ''),
    issueDate: order.orderDate ? String(order.orderDate) : null,
    validUntil: null,
    reference: order.reference ? String(order.reference) : order.quoteNumber ? String(order.quoteNumber) : null,
    currency: String(order.currency || 'KES'),
    subtotal: Number(order.subtotal || 0),
    discountTotal: Number(order.discountTotal || 0),
    taxTotal: Number(order.taxTotal || 0),
    shippingTotal: Number(order.shippingTotal || 0),
    depositRequiredAmount: Number(order.depositRequiredAmount || 0),
    totalAmount: Number(order.totalAmount || 0),
    notes: order.notes ? String(order.notes) : null,
    terms: order.terms ? String(order.terms) : null,
    acceptedAt: null,
    salespersonName: options.salespersonName || null,
    customer: {
      name: String(order.customerName || ''),
      email: order.customerEmail ? String(order.customerEmail) : null,
      phone: order.customerPhone ? String(order.customerPhone) : null,
      taxId: order.customerTaxId ? String(order.customerTaxId) : null,
      billingAddress: order.billingAddress ? String(order.billingAddress) : null,
    },
    company: {
      name: String(options.company?.name || 'SaMi'),
      address: options.company?.address ? String(options.company.address) : null,
      email: options.company?.email ? String(options.company.email) : null,
      phone: options.company?.phone ? String(options.company.phone) : null,
      taxId: options.company?.taxId ? String(options.company.taxId) : null,
      registrationNumber: options.company?.registrationNumber ? String(options.company.registrationNumber) : null,
    },
    template: {
      primaryColor: options.template?.primaryColor ? String(options.template.primaryColor) : '#164a9f',
      secondaryColor: options.template?.secondaryColor ? String(options.template.secondaryColor) : null,
      footerText: options.template?.footerText ? String(options.template.footerText) : null,
    },
    lines: order.lines.map(item => {
      const gross = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      const discountValue = Number(item.discountValue || 0);
      const discountAmount = item.discountType === 'fixed'
        ? Math.min(gross, discountValue)
        : gross * discountValue / 100;

      return {
        description: String(item.description || ''),
        sku: item.sku ? String(item.sku) : null,
        unit: item.unit ? String(item.unit) : null,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        discountAmount,
        taxRate: Number(item.taxRate || 0),
        taxName: item.taxName ? String(item.taxName) : null,
        lineTotal: Number(item.lineTotal || 0),
      };
    }),
  };

  return renderPdf(document, options.logoImageXObject || null);
}
