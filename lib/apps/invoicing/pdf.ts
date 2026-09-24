import 'server-only';


type PdfInvoice = {
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  reference: string | null;
  purchaseOrderNumber: string | null;
  paymentTermsName: string | null;
  taxCalculation: 'exclusive' | 'inclusive';
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  roundingAdjustment: number;
  totalAmount: number;
  paidAmount: number;
  creditedAmount: number;
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
    phone: string | null;
    taxId: string | null;
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


type Rgb =
  readonly [
    number,
    number,
    number,
  ];


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


function cleanLine(
  value:
    unknown,
) {
  return ascii(
    value,
  )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}


function truncate(
  value:
    unknown,
  max:
    number,
) {
  const text =
    cleanLine(
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


function wrap(
  value:
    unknown,
  max:
    number,
) {
  const source =
    cleanLine(
      value,
    );

  if (
    !source
  ) {
    return [];
  }

  const words =
    source.split(
      ' ',
    );

  const lines:
    string[] =
      [];

  let current =
    '';

  for (
    const word
    of words
  ) {
    if (
      word.length >
      max
    ) {
      if (
        current
      ) {
        lines.push(
          current,
        );

        current =
          '';
      }

      for (
        let offset =
          0;
        offset <
          word.length;
        offset +=
          max
      ) {
        lines.push(
          word.slice(
            offset,
            offset +
              max,
          ),
        );
      }

      continue;
    }

    const candidate =
      current
        ? current +
          ' ' +
          word
        : word;

    if (
      candidate.length >
      max
    ) {
      lines.push(
        current,
      );

      current =
        word;
    } else {
      current =
        candidate;
    }
  }

  if (
    current
  ) {
    lines.push(
      current,
    );
  }

  return lines;
}


function color(
  input:
    string |
    null |
    undefined,
  fallback:
    string,
): Rgb {
  const value =
    /^#[0-9a-f]{6}$/i.test(
      input ||
      '',
    )
      ? String(
          input,
        )
      : fallback;

  return [
    Number.parseInt(
      value.slice(
        1,
        3,
      ),
      16,
    ) /
      255,
    Number.parseInt(
      value.slice(
        3,
        5,
      ),
      16,
    ) /
      255,
    Number.parseInt(
      value.slice(
        5,
        7,
      ),
      16,
    ) /
      255,
  ];
}


function rgb(
  value:
    Rgb,
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


function amount(
  value:
    number,
) {
  return Number(
    value ||
    0,
  )
    .toLocaleString(
      'en-US',
      {
        minimumFractionDigits:
          2,
        maximumFractionDigits:
          2,
      },
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
    amount(
      value,
    )
  );
}


function statusLabel(
  value:
    string,
) {
  return value
    .replaceAll(
      '_',
      ' ',
    )
    .toUpperCase();
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
    color?: Rgb;
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
  shade =
    '0.88 0.90 0.93',
) {
  return (
    shade +
    ' RG 0.7 w ' +
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


function rectCommand(
  x:
    number,
  y:
    number,
  width:
    number,
  height:
    number,
  fill:
    Rgb,
) {
  return (
    rgb(
      fill,
    ) +
    ' rg ' +
    x +
    ' ' +
    y +
    ' ' +
    width +
    ' ' +
    height +
    ' re f\n'
  );
}


function drawWrapped(
  input: {
    x: number;
    y: number;
    value: unknown;
    maxChars: number;
    lineHeight: number;
    size?: number;
    bold?: boolean;
    color?: Rgb;
    maxLines?: number;
  },
) {
  const lines =
    wrap(
      input.value,
      input.maxChars,
    )
      .slice(
        0,
        input.maxLines ??
          Number.MAX_SAFE_INTEGER,
      );

  let content =
    '';

  let y =
    input.y;

  for (
    const line
    of lines
  ) {
    content +=
      textCommand(
        input.x,
        y,
        line,
        {
          size:
            input.size,
          bold:
            input.bold,
          color:
            input.color,
        },
      );

    y -=
      input.lineHeight;
  }

  return {
    content,
    y,
    count:
      lines.length,
  };
}


function documentHeader(
  invoice:
    PdfInvoice,
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

  let content =
    '';

  content +=
    rectCommand(
      0,
      742,
      595,
      100,
      primary,
    );

  content +=
    textCommand(
      36,
      802,
      truncate(
        invoice.company
          .name,
        46,
      ),
      {
        size:
          invoice.template
            .layout ===
            'bold'
            ? 23
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
      777,
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
      390,
      802,
      truncate(
        invoice.invoiceNumber,
        26,
      ),
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

  content +=
    textCommand(
      390,
      780,
      statusLabel(
        invoice.status,
      ),
      {
        size:
          8,
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
      510,
      758,
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
          1,
          1,
          1,
        ],
      },
    );

  content +=
    textCommand(
      36,
      719,
      'FROM',
      {
        size:
          7,
        bold:
          true,
        color:
          primary,
      },
    );

  let fromY =
    704;

  if (
    invoice.template
      .showCompanyAddress &&
    invoice.company
      .address
  ) {
    const address =
      drawWrapped({
        x:
          36,
        y:
          fromY,
        value:
          invoice.company
            .address,
        maxChars:
          54,
        lineHeight:
          10,
        size:
          7,
        maxLines:
          2,
      });

    content +=
      address.content;

    fromY =
      address.y;
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
          fromY,
          truncate(
            contact,
            70,
          ),
          {
            size:
              7,
          },
        );

      fromY -=
        10;
    }
  }

  const legalIdentity =
    [
      (
        invoice.template
          .showTaxId &&
        invoice.company
          .taxId
      )
        ? 'PIN ' +
          invoice.company
            .taxId
        : '',
      invoice.company
        .registrationNumber
        ? 'Reg ' +
          invoice.company
            .registrationNumber
        : '',
    ]
      .filter(
        Boolean,
      )
      .join(
        ' | ',
      );

  if (
    legalIdentity
  ) {
    content +=
      textCommand(
        36,
        fromY,
        truncate(
          legalIdentity,
          72,
        ),
        {
          size:
            7,
        },
      );
  }

  content +=
    textCommand(
      36,
      645,
      'BILL TO',
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
      629,
      truncate(
        invoice.customer
          .name,
        48,
      ),
      {
        size:
          11,
        bold:
          true,
        color:
          secondary,
      },
    );

  let billY =
    614;

  for (
    const customerLine
    of [
      invoice.customer
        .email,
      invoice.customer
        .phone,
      invoice.customer
        .taxId
        ? 'Tax / PIN: ' +
          invoice.customer
            .taxId
        : null,
    ]
  ) {
    if (
      customerLine
    ) {
      content +=
        textCommand(
          36,
          billY,
          truncate(
            customerLine,
            56,
          ),
          {
            size:
              7.5,
          },
        );

      billY -=
        11;
    }
  }

  if (
    invoice.customer
      .billingAddress
  ) {
    const billingAddress =
      drawWrapped({
        x:
          36,
        y:
          billY,
        value:
          invoice.customer
            .billingAddress,
        maxChars:
          58,
        lineHeight:
          10,
        size:
          7,
        maxLines:
          2,
      });

    content +=
      billingAddress
        .content;
  }

  content +=
    textCommand(
      350,
      719,
      'INVOICE DETAILS',
      {
        size:
          7,
        bold:
          true,
        color:
          primary,
      },
    );

  const detailRows:
    Array<
      [
        string,
        string | null,
      ]
    > = [
      [
        'Issued',
        invoice.invoiceDate,
      ],
      [
        'Due',
        invoice.dueDate,
      ],
      [
        'Currency',
        invoice.currency,
      ],
      [
        'Payment terms',
        invoice.paymentTermsName,
      ],
      [
        'Tax mode',
        invoice.taxCalculation,
      ],
      [
        'Reference',
        invoice.reference,
      ],
      [
        'PO',
        invoice.purchaseOrderNumber,
      ],
    ];

  let detailY =
    704;

  for (
    const [
      label,
      value,
    ]
    of detailRows
  ) {
    if (
      !value
    ) {
      continue;
    }

    content +=
      textCommand(
        350,
        detailY,
        label +
        ':',
        {
          size:
            7,
          bold:
            true,
          color:
            secondary,
        },
      );

    content +=
      textCommand(
        418,
        detailY,
        truncate(
          value,
          28,
        ),
        {
          size:
            7,
        },
      );

    detailY -=
      13;
  }

  return content;
}


function tableHeader(
  invoice:
    PdfInvoice,
  y:
    number,
) {
  const secondary =
    color(
      invoice.template
        .secondaryColor,
      '#0f172a',
    );

  let content =
    '';

  content +=
    rectCommand(
      36,
      y -
        18,
      523,
      22,
      secondary,
    );

  const white:
    Rgb = [
      1,
      1,
      1,
    ];

  const headers:
    Array<
      [
        number,
        string,
      ]
    > = [
      [
        42,
        'Description',
      ],
      [
        282,
        'Qty',
      ],
      [
        314,
        'Unit',
      ],
      [
        351,
        'Price',
      ],
      [
        407,
        'Disc.',
      ],
      [
        454,
        'Tax',
      ],
      [
        505,
        'Amount',
      ],
    ];

  for (
    const [
      x,
      label,
    ]
    of headers
  ) {
    content +=
      textCommand(
        x,
        y -
          11,
        label,
        {
          size:
            6.5,
          bold:
            true,
          color:
            white,
        },
      );
  }

  return content;
}


function renderItemPage(
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
  includeSummary:
    boolean,
  detailEntries:
    string[],
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

  let content =
    documentHeader(
      invoice,
      pageIndex,
      pageCount,
    );

  const tableTop =
    535;

  content +=
    tableHeader(
      invoice,
      tableTop,
    );

  let y =
    tableTop -
    42;

  for (
    const line
    of pageLines
  ) {
    content +=
      textCommand(
        42,
        y,
        truncate(
          line.description,
          35,
        ),
        {
          size:
            7.5,
          bold:
            true,
        },
      );

    content +=
      textCommand(
        282,
        y,
        amount(
          line.quantity,
        ),
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        314,
        y,
        truncate(
          line.unit,
          8,
        ),
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        351,
        y,
        amount(
          line.unitPrice,
        ),
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        407,
        y,
        line.discountAmount >
          0
          ? amount(
              line.discountAmount,
            )
          : '-',
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        454,
        y,
        line.taxRate >
          0
          ? amount(
              line.taxRate,
            ) +
            '%'
          : '-',
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        505,
        y,
        amount(
          line.lineTotal,
        ),
        {
          size:
            6.8,
          bold:
            true,
        },
      );

    const subline =
      [
        line.sku
          ? 'SKU ' +
            line.sku
          : '',
        (
          invoice.template
            .showTaxBreakdown &&
          line.taxName
        )
          ? 'Tax ' +
            line.taxName +
            ' (' +
            amount(
              line.taxAmount,
            ) +
            ')'
          : '',
      ]
        .filter(
          Boolean,
        )
        .join(
          ' | ',
        );

    if (
      subline
    ) {
      content +=
        textCommand(
          42,
          y -
            11,
          truncate(
            subline,
            80,
          ),
          {
            size:
              5.8,
            color: [
              0.40,
              0.44,
              0.50,
            ],
          },
        );
    }

    content +=
      lineCommand(
        36,
        y -
          17,
        559,
        y -
          17,
      );

    y -=
      31;
  }

  if (
    includeSummary
  ) {
    const summaryTop =
      Math.min(
        250,
        y -
          4,
      );

    content +=
      textCommand(
        350,
        summaryTop +
          13,
        'FINANCIAL SUMMARY',
        {
          size:
            7,
          bold:
            true,
          color:
            primary,
        },
      );

    let sy =
      summaryTop;

    const totalRow =
      (
        label:
          string,
        value:
          string,
        options: {
          bold?: boolean;
          color?: Rgb;
        } = {},
      ) => {
        content +=
          textCommand(
            350,
            sy,
            label,
            {
              size:
                options.bold
                  ? 8.5
                  : 7,
              bold:
                options.bold,
              color:
                options.color,
            },
          );

        content +=
          textCommand(
            470,
            sy,
            value,
            {
              size:
                options.bold
                  ? 8.5
                  : 7,
              bold:
                options.bold,
              color:
                options.color,
            },
          );

        sy -=
          options.bold
            ? 16
            : 13;
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
      invoice.shippingTotal !==
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

    if (
      invoice.roundingAdjustment !==
        0
    ) {
      totalRow(
        'Rounding',
        money(
          invoice.roundingAdjustment,
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
      {
        bold:
          true,
        color:
          secondary,
      },
    );

    if (
      invoice.paidAmount >
        0
    ) {
      totalRow(
        'Paid',
        '- ' +
        money(
          invoice.paidAmount,
          invoice.currency,
        ),
      );
    }

    if (
      invoice.creditedAmount >
        0
    ) {
      totalRow(
        'Credits',
        '- ' +
        money(
          invoice.creditedAmount,
          invoice.currency,
        ),
      );
    }

    totalRow(
      'Balance due',
      money(
        invoice.balanceDue,
        invoice.currency,
      ),
      {
        bold:
          true,
        color:
          primary,
      },
    );

    if (
      detailEntries.length >
        0
    ) {
      let dy =
        Math.min(
          118,
          sy -
            4,
        );

      for (
        const entry
        of detailEntries
      ) {
        const heading =
          entry.startsWith(
            '# ',
          );

        content +=
          textCommand(
            36,
            dy,
            heading
              ? entry.slice(
                  2,
                )
              : entry,
            {
              size:
                heading
                  ? 6.5
                  : 6,
              bold:
                heading,
              color:
                heading
                  ? primary
                  : undefined,
            },
          );

        dy -=
          heading
            ? 11
            : 9;
      }
    }
  }

  const footer =
    invoice.template
      .footerText ||
    'Generated securely through SaMi';

  content +=
    lineCommand(
      36,
      38,
      559,
      38,
    );

  content +=
    textCommand(
      36,
      24,
      truncate(
        footer,
        76,
      ),
      {
        size:
          6.2,
        color: [
          0.45,
          0.49,
          0.55,
        ],
      },
    );

  return content;
}


function supplementaryEntries(
  invoice:
    PdfInvoice,
) {
  const entries:
    string[] =
      [];

  function add(
    title:
      string,
    value:
      string |
      null |
      undefined,
  ) {
    if (
      !value
    ) {
      return;
    }

    entries.push(
      '# ' +
      title,
    );

    entries.push(
      ...wrap(
        value,
        92,
      ),
    );
  }

  if (
    invoice.template
      .showPaymentInstructions
  ) {
    add(
      'PAYMENT INSTRUCTIONS',
      invoice
        .paymentInstructions,
    );
  }

  add(
    'NOTES',
    invoice.notes,
  );

  add(
    'TERMS & CONDITIONS',
    invoice.template
      .termsText ||
    invoice.terms,
  );

  return entries;
}


function renderSupplementPage(
  invoice:
    PdfInvoice,
  entries:
    string[],
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

  let content =
    documentHeader(
      invoice,
      pageIndex,
      pageCount,
    );

  content +=
    textCommand(
      36,
      535,
      'INVOICE NOTES & TERMS',
      {
        size:
          9,
        bold:
          true,
        color:
          primary,
      },
    );

  let y =
    510;

  for (
    const entry
    of entries
  ) {
    const heading =
      entry.startsWith(
        '# ',
      );

    content +=
      textCommand(
        36,
        y,
        heading
          ? entry.slice(
              2,
            )
          : entry,
        {
          size:
            heading
              ? 7.5
              : 7,
          bold:
            heading,
          color:
            heading
              ? primary
              : undefined,
        },
      );

    y -=
      heading
        ? 16
        : 12;
  }

  content +=
    lineCommand(
      36,
      38,
      559,
      38,
    );

  content +=
    textCommand(
      36,
      24,
      truncate(
        invoice.template
          .footerText ||
        'Generated securely through SaMi',
        76,
      ),
      {
        size:
          6.2,
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
  const itemChunks:
    PdfInvoice[
      'lines'
    ][] =
      [];

  const perPage =
    8;

  for (
    let index =
      0;
    index <
      invoice.lines.length;
    index +=
      perPage
  ) {
    itemChunks.push(
      invoice.lines.slice(
        index,
        index +
          perPage,
      ),
    );
  }

  if (
    itemChunks.length ===
      0
  ) {
    itemChunks.push(
      [],
    );
  }

  const details =
    supplementaryEntries(
      invoice,
    );

  const inlineDetailLimit =
    7;

  const inlineDetails =
    details.slice(
      0,
      inlineDetailLimit,
    );

  const remainingDetails =
    details.slice(
      inlineDetailLimit,
    );

  const detailChunks:
    string[][] =
      [];

  const detailPerPage =
    33;

  for (
    let index =
      0;
    index <
      remainingDetails.length;
    index +=
      detailPerPage
  ) {
    detailChunks.push(
      remainingDetails.slice(
        index,
        index +
          detailPerPage,
      ),
    );
  }

  const pageCount =
    itemChunks.length +
    detailChunks.length;

  const streams:
    string[] =
      [];

  itemChunks.forEach(
    (
      lines,
      index,
    ) => {
      streams.push(
        renderItemPage(
          invoice,
          lines,
          index,
          pageCount,
          index ===
            itemChunks.length -
              1,
          index ===
            itemChunks.length -
              1
            ? inlineDetails
            : [],
        ),
      );
    },
  );

  detailChunks.forEach(
    (
      entries,
      index,
    ) => {
      streams.push(
        renderSupplementPage(
          invoice,
          entries,
          itemChunks.length +
            index,
          pageCount,
        ),
      );
    },
  );

  const objects =
    new Map<
      number,
      string
    >();

  const pageIds =
    streams.map(
      (
        _stream,
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
    streams.length +
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

  streams.forEach(
    (
      stream,
      index,
    ) => {
      const pageId =
        pageIds[index];

      const contentId =
        pageId +
        1;

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
