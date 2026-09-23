import 'server-only';


type PdfInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  reference: string | null;
  purchaseOrderNumber: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  totalAmount: number;
  balanceDue: number;
  notes: string | null;
  terms: string | null;
  paymentInstructions: string | null;
  template: {
    layout: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    showCompanyAddress: boolean;
    showCompanyContact: boolean;
    showTaxId: boolean;
    showPaymentInstructions: boolean;
    showTaxBreakdown: boolean;
    showDiscount: boolean;
    footerText: string | null;
    termsText: string | null;
  };
  customer: {
    name: string;
    email: string | null;
    billingAddress: string | null;
  };
  company: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    registrationNumber: string | null;
  };
  lines: Array<{
    description: string;
    sku: string | null;
    unit: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxName: string | null;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }>;
};


function ascii(
  value:
    unknown,
) {
  return String(
    value ??
    '',
  )
    .normalize(
      'NFKD',
    )
    .replace(
      /[^\x20-\x7E]/g,
      '?',
    );
}


function pdfEscape(
  value:
    unknown,
) {
  return ascii(
    value,
  )
    .replace(
      /\\/g,
      '\\\\',
    )
    .replace(
      /\(/g,
      '\\(',
    )
    .replace(
      /\)/g,
      '\\)',
    );
}


function truncate(
  value:
    unknown,
  max:
    number,
) {
  const text =
    ascii(
      value,
    );

  return text.length >
    max
    ? text.slice(
        0,
        Math.max(
          0,
          max -
          3,
        ),
      ) +
      '...'
    : text;
}


function color(
  input:
    string |
    null |
    undefined,
  fallback:
    string,
) {
  const value =
    /^#[0-9a-f]{6}$/i.test(
      input ||
      '',
    )
      ? String(
          input,
        )
      : fallback;

  const red =
    Number.parseInt(
      value.slice(
        1,
        3,
      ),
      16,
    ) /
    255;

  const green =
    Number.parseInt(
      value.slice(
        3,
        5,
      ),
      16,
    ) /
    255;

  const blue =
    Number.parseInt(
      value.slice(
        5,
        7,
      ),
      16,
    ) /
    255;

  return [
    red,
    green,
    blue,
  ] as const;
}


function rgb(
  value:
    readonly [
      number,
      number,
      number,
    ],
) {
  return value
    .map(
      part =>
        part
          .toFixed(
            4,
          ),
    )
    .join(
      ' ',
    );
}


function money(
  value:
    number,
  currency:
    string,
) {
  return (
    currency +
    ' ' +
    Number(
      value ||
      0,
    )
      .toFixed(
        2,
      )
  );
}


function textCommand(
  x:
    number,
  y:
    number,
  value:
    unknown,
  options: {
    size?: number;
    bold?: boolean;
    color?:
      readonly [
        number,
        number,
        number,
      ];
  } = {},
) {
  const font =
    options.bold
      ? 'F2'
      : 'F1';

  const size =
    options.size ??
    10;

  const fill =
    options.color
      ? rgb(
          options.color,
        ) +
        ' rg\n'
      : '';

  return (
    fill +
    'BT /' +
    font +
    ' ' +
    size +
    ' Tf 1 0 0 1 ' +
    x +
    ' ' +
    y +
    ' Tm (' +
    pdfEscape(
      value,
    ) +
    ') Tj ET\n'
  );
}


function lineCommand(
  x1:
    number,
  y1:
    number,
  x2:
    number,
  y2:
    number,
) {
  return (
    '0.88 0.90 0.93 RG 0.7 w ' +
    x1 +
    ' ' +
    y1 +
    ' m ' +
    x2 +
    ' ' +
    y2 +
    ' l S\n'
  );
}


function pageContent(
  invoice:
    PdfInvoice,
  pageLines:
    PdfInvoice[
      'lines'
    ],
  pageIndex:
    number,
  pageCount:
    number,
) {
  const primary =
    color(
      invoice.template
        .primaryColor,
      '#164a9f',
    );

  const secondary =
    color(
      invoice.template
        .secondaryColor,
      '#0f172a',
    );

  const compact =
    invoice.template
      .layout ===
      'compact';

  const boldLayout =
    invoice.template
      .layout ===
      'bold';

  let content =
    '';

  if (
    invoice.template
      .layout !==
      'classic'
  ) {
    content +=
      rgb(
        primary,
      ) +
      ' rg 0 742 595 100 re f\n';

    content +=
      textCommand(
        36,
        795,
        truncate(
          invoice.company
            .name,
          42,
        ),
        {
          size:
            boldLayout
              ? 24
              : 20,
          bold:
            true,
          color: [
            1,
            1,
            1,
          ],
        },
      );

    content +=
      textCommand(
        36,
        770,
        'INVOICE',
        {
          size:
            9,
          bold:
            true,
          color: [
            1,
            1,
            1,
          ],
        },
      );

    content +=
      textCommand(
        410,
        790,
        invoice.invoiceNumber,
        {
          size:
            15,
          bold:
            true,
          color: [
            1,
            1,
            1,
          ],
        },
      );
  } else {
    content +=
      textCommand(
        36,
        795,
        truncate(
          invoice.company
            .name,
          42,
        ),
        {
          size:
            21,
          bold:
            true,
          color:
            primary,
        },
      );

    content +=
      textCommand(
        410,
        795,
        invoice.invoiceNumber,
        {
          size:
            14,
          bold:
            true,
          color:
            secondary,
        },
      );

    content +=
      lineCommand(
        36,
        770,
        559,
        770,
      );
  }

  content +=
    textCommand(
      36,
      720,
      'Bill to',
      {
        size:
          8,
        bold:
          true,
        color:
          primary,
      },
    );

  content +=
    textCommand(
      36,
      701,
      truncate(
        invoice.customer
          .name,
        48,
      ),
      {
        size:
          12,
        bold:
          true,
        color:
          secondary,
      },
    );

  let customerY =
    684;

  if (
    invoice.customer
      .email
  ) {
    content +=
      textCommand(
        36,
        customerY,
        truncate(
          invoice.customer
            .email,
          58,
        ),
        {
          size:
            8,
        },
      );

    customerY -=
      13;
  }

  if (
    invoice.customer
      .billingAddress
  ) {
    content +=
      textCommand(
        36,
        customerY,
        truncate(
          invoice.customer
            .billingAddress
            .replace(
              /\s+/g,
              ' ',
            ),
          65,
        ),
        {
          size:
            8,
        },
      );
  }

  content +=
    textCommand(
      355,
      720,
      'Invoice details',
      {
        size:
          8,
        bold:
          true,
        color:
          primary,
      },
    );

  content +=
    textCommand(
      355,
      701,
      'Issued: ' +
      invoice.invoiceDate,
      {
        size:
          9,
      },
    );

  content +=
    textCommand(
      355,
      685,
      'Due: ' +
      invoice.dueDate,
      {
        size:
          9,
      },
    );

  if (
    invoice.reference
  ) {
    content +=
      textCommand(
        355,
        669,
        'Reference: ' +
        truncate(
          invoice.reference,
          28,
        ),
        {
          size:
            8,
        },
      );
  }

  if (
    invoice
      .purchaseOrderNumber
  ) {
    content +=
      textCommand(
        355,
        653,
        'PO: ' +
        truncate(
          invoice
            .purchaseOrderNumber,
          34,
        ),
        {
          size:
            8,
        },
      );
  }

  let companyY =
    632;

  if (
    invoice.template
      .showCompanyAddress &&
    invoice.company
      .address
  ) {
    content +=
      textCommand(
        36,
        companyY,
        truncate(
          invoice.company
            .address,
          84,
        ),
        {
          size:
            7,
        },
      );

    companyY -=
      12;
  }

  if (
    invoice.template
      .showCompanyContact
  ) {
    const contact =
      [
        invoice.company
          .email,
        invoice.company
          .phone,
      ]
        .filter(
          Boolean,
        )
        .join(
          ' | ',
        );

    if (
      contact
    ) {
      content +=
        textCommand(
          36,
          companyY,
          truncate(
            contact,
            84,
          ),
          {
            size:
              7,
          },
        );

      companyY -=
        12;
    }
  }

  if (
    invoice.template
      .showTaxId &&
    invoice.company
      .taxId
  ) {
    content +=
      textCommand(
        36,
        companyY,
        'Tax / PIN: ' +
        truncate(
          invoice.company
            .taxId,
          50,
        ),
        {
          size:
            7,
        },
      );
  }

  const tableTop =
    compact
      ? 610
      : 600;

  content +=
    rgb(
      secondary,
    ) +
    ' rg 36 ' +
    (
      tableTop -
      18
    ) +
    ' 523 22 re f\n';

  const white: readonly [
    number,
    number,
    number,
  ] = [
    1,
    1,
    1,
  ];

  content +=
    textCommand(
      43,
      tableTop -
      11,
      'Description',
      {
        size:
          8,
        bold:
          true,
        color:
          white,
      },
    );

  content +=
    textCommand(
      318,
      tableTop -
      11,
      'Qty',
      {
        size:
          8,
        bold:
          true,
        color:
          white,
      },
    );

  content +=
    textCommand(
      370,
      tableTop -
      11,
      'Price',
      {
        size:
          8,
        bold:
          true,
        color:
          white,
      },
    );

  content +=
    textCommand(
      458,
      tableTop -
      11,
      'Amount',
      {
        size:
          8,
        bold:
          true,
        color:
          white,
      },
    );

  const rowHeight =
    compact
      ? 21
      : 25;

  let y =
    tableTop -
    42;

  for (
    const line
    of pageLines
  ) {
    content +=
      textCommand(
        43,
        y,
        truncate(
          line.description,
          48,
        ),
        {
          size:
            8,
          bold:
            true,
        },
      );

    content +=
      textCommand(
        318,
        y,
        line.quantity,
        {
          size:
            8,
        },
      );

    content +=
      textCommand(
        370,
        y,
        money(
          line.unitPrice,
          invoice.currency,
        ),
        {
          size:
            8,
        },
      );

    content +=
      textCommand(
        458,
        y,
        money(
          line.lineTotal,
          invoice.currency,
        ),
        {
          size:
            8,
          bold:
            true,
        },
      );

    const details =
      [
        line.sku
          ? 'SKU ' +
            line.sku
          : '',
        (
          invoice.template
            .showDiscount &&
          line.discountAmount >
            0
        )
          ? 'Discount ' +
            money(
              line.discountAmount,
              invoice.currency,
            )
          : '',
        (
          invoice.template
            .showTaxBreakdown &&
          line.taxRate >
            0
        )
          ? (
              line.taxName ||
              'Tax'
            ) +
            ' ' +
            line.taxRate +
            '%'
          : '',
      ]
        .filter(
          Boolean,
        )
        .join(
          ' | ',
        );

    if (
      details &&
      !compact
    ) {
      content +=
        textCommand(
          43,
          y -
          10,
          truncate(
            details,
            72,
          ),
          {
            size:
              6.5,
            color: [
              0.38,
              0.42,
              0.48,
            ],
          },
        );
    }

    content +=
      lineCommand(
        36,
        y -
        (
          compact
            ? 8
            : 13
        ),
        559,
        y -
        (
          compact
            ? 8
            : 13
        ),
      );

    y -=
      rowHeight;
  }

  if (
    pageIndex ===
      pageCount -
      1
  ) {
    const totalsY =
      Math.max(
        150,
        y -
        16,
      );

    let ty =
      totalsY;

    const totalRow =
      (
        label:
          string,
        value:
          string,
        bold =
          false,
      ) => {
        content +=
          textCommand(
            370,
            ty,
            label,
            {
              size:
                bold
                  ? 10
                  : 8,
              bold,
              color:
                bold
                  ? secondary
                  : undefined,
            },
          );

        content +=
          textCommand(
            458,
            ty,
            value,
            {
              size:
                bold
                  ? 10
                  : 8,
              bold,
              color:
                bold
                  ? primary
                  : undefined,
            },
          );

        ty -=
          bold
            ? 19
            : 15;
      };

    totalRow(
      'Subtotal',
      money(
        invoice.subtotal,
        invoice.currency,
      ),
    );

    if (
      invoice.template
        .showDiscount &&
      invoice.discountTotal >
        0
    ) {
      totalRow(
        'Discount',
        '- ' +
        money(
          invoice.discountTotal,
          invoice.currency,
        ),
      );
    }

    if (
      invoice.template
        .showTaxBreakdown
    ) {
      totalRow(
        'Tax',
        money(
          invoice.taxTotal,
          invoice.currency,
        ),
      );
    }

    if (
      invoice.shippingTotal >
        0
    ) {
      totalRow(
        'Shipping',
        money(
          invoice.shippingTotal,
          invoice.currency,
        ),
      );
    }

    totalRow(
      'Total',
      money(
        invoice.totalAmount,
        invoice.currency,
      ),
      true,
    );

    totalRow(
      'Balance due',
      money(
        invoice.balanceDue,
        invoice.currency,
      ),
      true,
    );

    let noteY =
      Math.max(
        76,
        totalsY -
        5,
      );

    if (
      invoice.template
        .showPaymentInstructions &&
      invoice
        .paymentInstructions
    ) {
      content +=
        textCommand(
          36,
          noteY,
          'Payment instructions',
          {
            size:
              7,
            bold:
              true,
            color:
              primary,
          },
        );

      content +=
        textCommand(
          36,
          noteY -
          13,
          truncate(
            invoice
              .paymentInstructions
              .replace(
                /\s+/g,
                ' ',
              ),
            78,
          ),
          {
            size:
              6.5,
          },
        );

      noteY -=
        30;
    }

    const terms =
      invoice.template
        .termsText ||
      invoice.terms;

    if (
      terms &&
      noteY >
        45
    ) {
      content +=
        textCommand(
          36,
          noteY,
          'Terms',
          {
            size:
              7,
            bold:
              true,
            color:
              primary,
          },
        );

      content +=
        textCommand(
          36,
          noteY -
          13,
          truncate(
            terms.replace(
              /\s+/g,
              ' ',
            ),
            78,
          ),
          {
            size:
              6.5,
          },
        );
    }
  }

  const footer =
    invoice.template
      .footerText ||
    'Generated securely through SaMi';

  content +=
    textCommand(
      36,
      24,
      truncate(
        footer,
        72,
      ),
      {
        size:
          6.5,
        color: [
          0.45,
          0.49,
          0.55,
        ],
      },
    );

  content +=
    textCommand(
      505,
      24,
      (
        pageIndex +
        1
      ) +
      ' / ' +
      pageCount,
      {
        size:
          6.5,
        color: [
          0.45,
          0.49,
          0.55,
        ],
      },
    );

  return content;
}


export function renderInvoicePdf(
  invoice:
    PdfInvoice,
) {
  const perPage =
    invoice.template
      .layout ===
      'compact'
      ? 22
      : 18;

  const pages:
    PdfInvoice[
      'lines'
    ][] =
      [];

  for (
    let index =
      0;
    index <
      invoice.lines.length;
    index +=
      perPage
  ) {
    pages.push(
      invoice.lines.slice(
        index,
        index +
        perPage,
      ),
    );
  }

  if (
    pages.length ===
      0
  ) {
    pages.push(
      [],
    );
  }

  const objects =
    new Map<
      number,
      string
    >();

  const pageIds =
    pages.map(
      (
        _page,
        index,
      ) =>
        5 +
        index *
        2,
    );

  objects.set(
    1,
    '<< /Type /Catalog /Pages 2 0 R >>',
  );

  objects.set(
    2,
    '<< /Type /Pages /Kids [' +
    pageIds
      .map(
        id =>
          id +
          ' 0 R',
      )
      .join(
        ' ',
      ) +
    '] /Count ' +
    pages.length +
    ' >>',
  );

  objects.set(
    3,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );

  objects.set(
    4,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  );

  pages.forEach(
    (
      lines,
      index,
    ) => {
      const pageId =
        pageIds[index];

      const contentId =
        pageId +
        1;

      const stream =
        pageContent(
          invoice,
          lines,
          index,
          pages.length,
        );

      objects.set(
        pageId,
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' +
        contentId +
        ' 0 R >>',
      );

      objects.set(
        contentId,
        '<< /Length ' +
        Buffer.byteLength(
          stream,
          'ascii',
        ) +
        ' >>\nstream\n' +
        stream +
        'endstream',
      );
    },
  );

  const maxId =
    Math.max(
      ...objects.keys(),
    );

  let pdf =
    '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

  const offsets =
    new Array<number>(
      maxId +
      1,
    )
      .fill(
        0,
      );

  for (
    let id =
      1;
    id <=
      maxId;
    id +=
      1
  ) {
    const body =
      objects.get(
        id,
      );

    if (
      body ===
      undefined
    ) {
      continue;
    }

    offsets[id] =
      Buffer.byteLength(
        pdf,
        'binary',
      );

    pdf +=
      id +
      ' 0 obj\n' +
      body +
      '\nendobj\n';
  }

  const xref =
    Buffer.byteLength(
      pdf,
      'binary',
    );

  pdf +=
    'xref\n0 ' +
    (
      maxId +
      1
    ) +
    '\n';

  pdf +=
    '0000000000 65535 f \n';

  for (
    let id =
      1;
    id <=
      maxId;
    id +=
      1
  ) {
    pdf +=
      String(
        offsets[id],
      )
        .padStart(
          10,
          '0',
        ) +
      ' 00000 n \n';
  }

  pdf +=
    'trailer\n<< /Size ' +
    (
      maxId +
      1
    ) +
    ' /Root 1 0 R >>\n' +
    'startxref\n' +
    xref +
    '\n%%EOF\n';

  return Buffer.from(
    pdf,
    'binary',
  );
}
