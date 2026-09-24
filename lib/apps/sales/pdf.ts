import 'server-only';

import type {
  getPublicSalesQuote,
} from '@/lib/apps/sales/public';


type Quote =
  Awaited<
    ReturnType<
      typeof getPublicSalesQuote
    >
  >;


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


function esc(
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


function money(
  value:
    number,
) {
  return Number(
    value ||
    0,
  ).toLocaleString(
    'en-US',
    {
      minimumFractionDigits:
        2,
      maximumFractionDigits:
        2,
    },
  );
}


function text(
  x:
    number,
  y:
    number,
  value:
    unknown,
  size =
    8,
  bold =
    false,
) {
  return (
    'BT /' +
    (
      bold
        ? 'F2'
        : 'F1'
    ) +
    ' ' +
    size +
    ' Tf 1 0 0 1 ' +
    x +
    ' ' +
    y +
    ' Tm (' +
    esc(
      value,
    ) +
    ') Tj ET\n'
  );
}


function line(
  y:
    number,
) {
  return (
    '0.86 0.89 0.93 RG 0.7 w 36 ' +
    y +
    ' m 559 ' +
    y +
    ' l S\n'
  );
}


function pageStream(
  quote:
    Quote,
  rows:
    Quote['lines'],
  page:
    number,
  pageCount:
    number,
  finalPage:
    boolean,
) {
  let out =
    '0.07 0.27 0.60 rg 0 754 595 88 re f\n';

  out +=
    '1 1 1 rg\n';

  out +=
    text(
      36,
      808,
      quote.company.name,
      17,
      true,
    );

  out +=
    text(
      36,
      784,
      'QUOTATION',
      8,
      true,
    );

  out +=
    text(
      405,
      808,
      quote.quoteNumber,
      13,
      true,
    );

  out +=
    text(
      405,
      787,
      quote.status
        .replaceAll(
          '_',
          ' ',
        )
        .toUpperCase(),
      7,
      true,
    );

  out +=
    text(
      522,
      765,
      (
        page +
        1
      ) +
      '/' +
      pageCount,
      6,
    );

  out +=
    '0 0 0 rg\n';

  out +=
    text(
      36,
      724,
      'PREPARED FOR',
      7,
      true,
    );

  out +=
    text(
      36,
      706,
      quote.customer.name,
      11,
      true,
    );

  let customerY =
    690;

  for (
    const value
    of [
      quote.customer.email,
      quote.customer.phone,
      quote.customer.taxId
        ? 'Tax / PIN: ' +
          quote.customer.taxId
        : null,
      quote.customer.billingAddress,
    ]
  ) {
    if (
      value
    ) {
      out +=
        text(
          36,
          customerY,
          String(
            value,
          ).slice(
            0,
            70,
          ),
          7,
        );

      customerY -=
        11;
    }
  }

  out +=
    text(
      355,
      724,
      'QUOTE DETAILS',
      7,
      true,
    );

  let detailsY =
    706;

  for (
    const [
      label,
      value,
    ]
    of [
      [
        'Quote date',
        quote.quoteDate,
      ],
      [
        'Valid until',
        quote.validUntil,
      ],
      [
        'Currency',
        quote.currency,
      ],
      [
        'Reference',
        quote.reference,
      ],
    ] as const
  ) {
    if (
      value
    ) {
      out +=
        text(
          355,
          detailsY,
          label +
          ': ' +
          String(
            value,
          ).slice(
            0,
            32,
          ),
          7,
        );

      detailsY -=
        13;
    }
  }

  out +=
    '0.05 0.08 0.15 rg 36 590 523 22 re f\n1 1 1 rg\n';

  for (
    const [
      x,
      label,
    ]
    of [
      [
        42,
        'Description',
      ],
      [
        302,
        'Qty',
      ],
      [
        350,
        'Price',
      ],
      [
        420,
        'Discount',
      ],
      [
        478,
        'Tax',
      ],
      [
        522,
        'Amount',
      ],
    ] as const
  ) {
    out +=
      text(
        x,
        597,
        label,
        6,
        true,
      );
  }

  out +=
    '0 0 0 rg\n';

  let y =
    563;

  for (
    const item
    of rows
  ) {
    out +=
      text(
        42,
        y,
        item.description.slice(
          0,
          43,
        ),
        7,
        true,
      );

    out +=
      text(
        302,
        y,
        item.quantity,
        6.5,
      );

    out +=
      text(
        350,
        y,
        money(
          item.unitPrice,
        ),
        6.5,
      );

    out +=
      text(
        420,
        y,
        item.discountAmount >
          0
          ? money(
              item.discountAmount,
            )
          : '-',
        6.5,
      );

    out +=
      text(
        478,
        y,
        item.taxRate >
          0
          ? item.taxRate +
            '%'
          : '-',
        6.5,
      );

    out +=
      text(
        522,
        y,
        money(
          item.lineTotal,
        ),
        6.5,
        true,
      );

    if (
      item.sku ||
      item.taxName
    ) {
      out +=
        text(
          42,
          y -
            11,
          [
            item.sku
              ? 'SKU ' +
                item.sku
              : '',
            item.unit,
            item.taxName ||
            '',
          ]
            .filter(
              Boolean,
            )
            .join(
              ' | ',
            )
            .slice(
              0,
              72,
            ),
          5.5,
        );
    }

    out +=
      line(
        y -
          18,
      );

    y -=
      32;
  }

  if (
    finalPage
  ) {
    let summaryY =
      Math.min(
        244,
        y -
          6,
      );

    out +=
      text(
        360,
        summaryY +
          18,
        'COMMERCIAL SUMMARY',
        7,
        true,
      );

    for (
      const [
        label,
        value,
      ]
      of [
        [
          'Subtotal',
          quote.subtotal,
        ],
        [
          'Discount',
          -quote.discountTotal,
        ],
        [
          'Tax',
          quote.taxTotal,
        ],
        [
          'Shipping',
          quote.shippingTotal,
        ],
        [
          'TOTAL',
          quote.totalAmount,
        ],
      ] as const
    ) {
      out +=
        text(
          360,
          summaryY,
          label,
          label ===
            'TOTAL'
            ? 8
            : 7,
          label ===
            'TOTAL',
        );

      out +=
        text(
          466,
          summaryY,
          quote.currency +
          ' ' +
          money(
            value,
          ),
          label ===
            'TOTAL'
            ? 8
            : 7,
          label ===
            'TOTAL',
        );

      summaryY -=
        label ===
          'TOTAL'
          ? 17
          : 13;
    }

    let notesY =
      142;

    for (
      const [
        heading,
        value,
      ]
      of [
        [
          'NOTES',
          quote.notes,
        ],
        [
          'TERMS & CONDITIONS',
          quote.terms,
        ],
      ] as const
    ) {
      if (
        !value
      ) {
        continue;
      }

      out +=
        text(
          36,
          notesY,
          heading,
          6.5,
          true,
        );

      notesY -=
        11;

      const words =
        String(
          value,
        )
          .replace(
            /\s+/g,
            ' ',
          )
          .trim();

      for (
        let index =
          0;
        index <
          words.length &&
        notesY >
          48;
        index +=
          90
      ) {
        out +=
          text(
            36,
            notesY,
            words.slice(
              index,
              index +
                90,
            ),
            6,
          );

        notesY -=
          9;
      }

      notesY -=
        4;
    }
  }

  out +=
    line(
      38,
    );

  out +=
    text(
      36,
      24,
      quote.template.footerText ||
      'Prepared securely with SaMi Sales',
      6,
    );

  return out;
}


export function renderSalesQuotePdf(
  quote:
    Quote,
) {
  const pages:
    Quote['lines'][] =
      [];

  for (
    let index =
      0;
    index <
      quote.lines.length;
    index +=
      9
  ) {
    pages.push(
      quote.lines.slice(
        index,
        index +
          9,
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

  const streams =
    pages.map(
      (
        rows,
        index,
      ) =>
        pageStream(
          quote,
          rows,
          index,
          pages.length,
          index ===
            pages.length -
              1,
        ),
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

  let output =
    '%PDF-1.4\n%SaMi\n';

  const offsets =
    new Array<number>(
      maxId +
        1,
    ).fill(
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
        output,
        'binary',
      );

    output +=
      id +
      ' 0 obj\n' +
      body +
      '\nendobj\n';
  }

  const xref =
    Buffer.byteLength(
      output,
      'binary',
    );

  output +=
    'xref\n0 ' +
    (
      maxId +
        1
    ) +
    '\n0000000000 65535 f \n';

  for (
    let id =
      1;
    id <=
      maxId;
    id +=
      1
  ) {
    output +=
      String(
        offsets[id],
      )
        .padStart(
          10,
          '0',
        ) +
      ' 00000 n \n';
  }

  output +=
    'trailer\n<< /Size ' +
    (
      maxId +
        1
    ) +
    ' /Root 1 0 R >>\nstartxref\n' +
    xref +
    '\n%%EOF\n';

  return Buffer.from(
    output,
    'binary',
  );
}
