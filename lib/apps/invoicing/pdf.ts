import 'server-only';

import {
  deflateSync,
  inflateSync,
} from 'node:zlib';


export const INVOICE_PDF_RENDERER_VERSION =
  'invoice-pdf-v5';


export type PdfInvoice = {
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  serviceDate: string | null;
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
  etims?: {
    status: 'succeeded';
    solutionType: 'oscu' | 'vscu';
    environment: 'sandbox' | 'production';
    transactionInvoiceNo: number;
    receiptNo: number | null;
    totalReceiptNo: number | null;
    sdcId: string | null;
    mrcNo: string | null;
    internalData: string | null;
    receiptSignature: string | null;
    verificationUrl: string | null;
    resultCode: string | null;
    succeededAt: string | null;
  } | null;
  template: {
    layout: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    designVersion: number;
    density: string;
    headerStyle: string;
    documentTitle: string;
    fromLabel: string;
    billToLabel: string;
    notesLabel: string;
    termsLabel: string;
    paymentLabel: string;
    footerAlignment: string;
    showStatus: boolean;
    showPageNumbers: boolean;
    showSku: boolean;
    showUnit: boolean;
    showQuantity: boolean;
    showUnitPrice: boolean;
    showLineTax: boolean;
    showLineDiscount: boolean;
    showCompanyLogo: boolean;
    logoJpegBase64?: string | null;
    logoImageBase64?: string | null;
    logoImageMimeType?: string | null;
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
    shippingAddress: string | null;
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


function imageCommand(
  x:
    number,
  y:
    number,
  width:
    number,
  height:
    number,
) {
  return (
    'q ' +
    width +
    ' 0 0 ' +
    height +
    ' ' +
    x +
    ' ' +
    y +
    ' cm /Logo Do Q\n'
  );
}


function jpegDimensions(
  bytes:
    Buffer,
) {
  if (
    bytes.length <
      4 ||
    bytes[0] !==
      0xff ||
    bytes[1] !==
      0xd8
  ) {
    return null;
  }

  let offset =
    2;

  while (
    offset +
      9 <
    bytes.length
  ) {
    if (
      bytes[offset] !==
      0xff
    ) {
      offset +=
        1;
      continue;
    }

    const marker =
      bytes[
        offset +
        1
      ];

    offset +=
      2;

    if (
      marker ===
        0xd8 ||
      marker ===
        0xd9
    ) {
      continue;
    }

    if (
      offset +
        2 >
      bytes.length
    ) {
      break;
    }

    const length =
      bytes.readUInt16BE(
        offset,
      );

    if (
      length <
        2 ||
      offset +
        length >
      bytes.length
    ) {
      break;
    }

    const sof =
      (
        marker >=
          0xc0 &&
        marker <=
          0xc3
      ) ||
      (
        marker >=
          0xc5 &&
        marker <=
          0xc7
      ) ||
      (
        marker >=
          0xc9 &&
        marker <=
          0xcb
      ) ||
      (
        marker >=
          0xcd &&
        marker <=
          0xcf
      );

    if (
      sof &&
      length >=
        7
    ) {
      const height =
        bytes.readUInt16BE(
          offset +
          3,
        );

      const width =
        bytes.readUInt16BE(
          offset +
          5,
        );

      if (
        width >
          0 &&
        height >
          0
      ) {
        return {
          width,
          height,
        };
      }
    }

    offset +=
      length;
  }

  return null;
}


function paethPredictor(
  left:
    number,
  up:
    number,
  upLeft:
    number,
) {
  const estimate =
    left +
    up -
    upLeft;

  const leftDistance =
    Math.abs(
      estimate -
      left,
    );

  const upDistance =
    Math.abs(
      estimate -
      up,
    );

  const upLeftDistance =
    Math.abs(
      estimate -
      upLeft,
    );

  if (
    leftDistance <=
      upDistance &&
    leftDistance <=
      upLeftDistance
  ) {
    return left;
  }

  if (
    upDistance <=
    upLeftDistance
  ) {
    return up;
  }

  return upLeft;
}


function decodePngForPdf(
  bytes:
    Buffer,
) {
  const signature =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

  if (
    bytes.length <
      33 ||
    !bytes
      .subarray(
        0,
        8,
      )
      .equals(
        signature,
      )
  ) {
    return null;
  }

  let offset =
    8;

  let width =
    0;
  let height =
    0;
  let bitDepth =
    0;
  let colorType =
    -1;
  let interlace =
    1;

  const idat:
    Buffer[] =
      [];

  while (
    offset +
      12 <=
    bytes.length
  ) {
    const length =
      bytes.readUInt32BE(
        offset,
      );

    const type =
      bytes
        .subarray(
          offset +
            4,
          offset +
            8,
        )
        .toString(
          'ascii',
        );

    const dataStart =
      offset +
      8;

    const dataEnd =
      dataStart +
      length;

    if (
      dataEnd +
        4 >
      bytes.length
    ) {
      return null;
    }

    const data =
      bytes.subarray(
        dataStart,
        dataEnd,
      );

    if (
      type ===
      'IHDR'
    ) {
      if (
        data.length !==
        13
      ) {
        return null;
      }

      width =
        data.readUInt32BE(
          0,
        );

      height =
        data.readUInt32BE(
          4,
        );

      bitDepth =
        data[8];

      colorType =
        data[9];

      interlace =
        data[12];
    } else if (
      type ===
      'IDAT'
    ) {
      idat.push(
        Buffer.from(
          data,
        ),
      );
    } else if (
      type ===
      'IEND'
    ) {
      break;
    }

    offset =
      dataEnd +
      4;
  }

  if (
    width <=
      0 ||
    height <=
      0 ||
    width *
      height >
      8_000_000 ||
    bitDepth !==
      8 ||
    interlace !==
      0 ||
    ![
      0,
      2,
      4,
      6,
    ].includes(
      colorType,
    ) ||
    idat.length ===
      0
  ) {
    return null;
  }

  const bytesPerPixel =
    colorType ===
      0
      ? 1
      : colorType ===
          2
        ? 3
        : colorType ===
            4
          ? 2
          : 4;

  const rowBytes =
    width *
    bytesPerPixel;

  let inflated:
    Buffer;

  try {
    inflated =
      inflateSync(
        Buffer.concat(
          idat,
        ),
      );
  } catch {
    return null;
  }

  const expected =
    (
      rowBytes +
      1
    ) *
    height;

  if (
    inflated.length <
    expected
  ) {
    return null;
  }

  const decoded =
    Buffer.alloc(
      rowBytes *
      height,
    );

  let inputOffset =
    0;

  for (
    let y =
      0;
    y <
      height;
    y +=
      1
  ) {
    const filter =
      inflated[
        inputOffset
      ];

    inputOffset +=
      1;

    const rowOffset =
      y *
      rowBytes;

    for (
      let x =
        0;
      x <
        rowBytes;
      x +=
        1
    ) {
      const raw =
        inflated[
          inputOffset +
          x
        ];

      const left =
        x >=
          bytesPerPixel
          ? decoded[
              rowOffset +
              x -
              bytesPerPixel
            ]
          : 0;

      const up =
        y >
          0
          ? decoded[
              rowOffset -
              rowBytes +
              x
            ]
          : 0;

      const upLeft =
        y >
            0 &&
        x >=
          bytesPerPixel
          ? decoded[
              rowOffset -
              rowBytes +
              x -
              bytesPerPixel
            ]
          : 0;

      let predictor =
        0;

      if (
        filter ===
        1
      ) {
        predictor =
          left;
      } else if (
        filter ===
        2
      ) {
        predictor =
          up;
      } else if (
        filter ===
        3
      ) {
        predictor =
          Math.floor(
            (
              left +
              up
            ) /
              2,
          );
      } else if (
        filter ===
        4
      ) {
        predictor =
          paethPredictor(
            left,
            up,
            upLeft,
          );
      } else if (
        filter !==
        0
      ) {
        return null;
      }

      decoded[
        rowOffset +
        x
      ] =
        (
          raw +
          predictor
        ) &
        0xff;
    }

    inputOffset +=
      rowBytes;
  }

  const rgb =
    Buffer.alloc(
      width *
      height *
      3,
    );

  for (
    let pixel =
      0;
    pixel <
      width *
        height;
    pixel +=
      1
  ) {
    const source =
      pixel *
      bytesPerPixel;

    const target =
      pixel *
      3;

    let red =
      0;
    let green =
      0;
    let blue =
      0;
    let alpha =
      255;

    if (
      colorType ===
      0
    ) {
      red =
        decoded[
          source
        ];
      green =
        red;
      blue =
        red;
    } else if (
      colorType ===
      2
    ) {
      red =
        decoded[
          source
        ];
      green =
        decoded[
          source +
          1
        ];
      blue =
        decoded[
          source +
          2
        ];
    } else if (
      colorType ===
      4
    ) {
      red =
        decoded[
          source
        ];
      green =
        red;
      blue =
        red;
      alpha =
        decoded[
          source +
          1
        ];
    } else {
      red =
        decoded[
          source
        ];
      green =
        decoded[
          source +
          1
        ];
      blue =
        decoded[
          source +
          2
        ];
      alpha =
        decoded[
          source +
          3
        ];
    }

    if (
      alpha <
      255
    ) {
      const background =
        255 *
        (
          255 -
          alpha
        );

      red =
        Math.round(
          (
            red *
              alpha +
            background
          ) /
            255,
        );

      green =
        Math.round(
          (
            green *
              alpha +
            background
          ) /
            255,
        );

      blue =
        Math.round(
          (
            blue *
              alpha +
            background
          ) /
            255,
        );
    }

    rgb[target] =
      red;
    rgb[
      target +
      1
    ] =
      green;
    rgb[
      target +
      2
    ] =
      blue;
  }

  return {
    width,
    height,
    bytes:
      deflateSync(
        rgb,
      ),
    filter:
      'FlateDecode',
  } as const;
}


function logoGeometry(
  invoice:
    PdfInvoice,
) {
  if (
    !invoice.template
      .showCompanyLogo
  ) {
    return null;
  }

  const encoded =
    invoice.template
      .logoImageBase64 ||
    invoice.template
      .logoJpegBase64 ||
    null;

  if (
    !encoded
  ) {
    return null;
  }

  try {
    const sourceBytes =
      Buffer.from(
        encoded,
        'base64',
      );

    const mimeType =
      (
        invoice.template
          .logoImageMimeType ||
        (
          invoice.template
            .logoJpegBase64
            ? 'image/jpeg'
            : ''
        )
      )
        .trim()
        .toLowerCase();

    let sourceWidth =
      0;

    let sourceHeight =
      0;

    let pdfBytes =
      sourceBytes;

    let filter:
      'DCTDecode' |
      'FlateDecode' =
        'DCTDecode';

    if (
      mimeType ===
        'image/png'
    ) {
      const decoded =
        decodePngForPdf(
          sourceBytes,
        );

      if (
        !decoded
      ) {
        return null;
      }

      sourceWidth =
        decoded.width;

      sourceHeight =
        decoded.height;

      pdfBytes =
        decoded.bytes;

      filter =
        decoded.filter;
    } else {
      const dimensions =
        jpegDimensions(
          sourceBytes,
        );

      if (
        !dimensions
      ) {
        return null;
      }

      sourceWidth =
        dimensions.width;

      sourceHeight =
        dimensions.height;
    }

    const maxWidth =
      78;

    const maxHeight =
      42;

    const scale =
      Math.min(
        maxWidth /
          sourceWidth,
        maxHeight /
          sourceHeight,
      );

    return {
      bytes:
        pdfBytes,
      sourceWidth,
      sourceHeight,
      filter,
      width:
        Math.max(
          1,
          sourceWidth *
            scale,
        ),
      height:
        Math.max(
          1,
          sourceHeight *
            scale,
        ),
    };
  } catch {
    return null;
  }
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

  if (
    invoice.template
      .headerStyle !==
      'minimal'
  ) {
    content +=
      rectCommand(
        0,
        742,
        595,
        invoice.template
          .headerStyle ===
          'split'
          ? 72
          : 100,
        primary,
      );
  }

  const logo =
    logoGeometry(
      invoice,
    );

  if (
    logo
  ) {
    content +=
      imageCommand(
        36,
        788 -
          logo.height /
          2,
        logo.width,
        logo.height,
      );
  }

  content +=
    textCommand(
      logo
        ? 126
        : 36,
      802,
      truncate(
        invoice.company
          .name,
        logo
          ? 32
          : 46,
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
        color:
          invoice.template
            .headerStyle ===
            'minimal'
            ? secondary
            : [
                1,
                1,
                1,
              ],
      },
    );

  content +=
    textCommand(
      logo
        ? 126
        : 36,
      777,
      truncate(
        invoice.template
          .documentTitle ||
        'Invoice',
        28,
      )
        .toUpperCase(),
      {
        size:
          9,
        bold:
          true,
        color:
          invoice.template
            .headerStyle ===
            'minimal'
            ? primary
            : [
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

  if (
    invoice.template
      .showStatus
  ) {
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
          color:
            invoice.template
              .headerStyle ===
              'minimal'
              ? secondary
              : [
                  1,
                  1,
                  1,
                ],
        },
      );
  }

  if (
    invoice.template
      .showPageNumbers
  ) {
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
          color:
            invoice.template
              .headerStyle ===
              'minimal'
              ? secondary
              : [
                  1,
                  1,
                  1,
                ],
        },
      );
  }

  content +=
    textCommand(
      36,
      719,
      truncate(
        invoice.template
          .fromLabel ||
        'From',
        24,
      )
        .toUpperCase(),
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
      truncate(
        invoice.template
          .billToLabel ||
        'BILL TO',
        24,
      )
        .toUpperCase(),
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
        'Service date',
        invoice.serviceDate,
      ],
      [
        'Ship to',
        invoice.customer
          .shippingAddress,
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
        invoice.template
          .showQuantity
          ? 'Qty'
          : '',
      ],
      [
        314,
        invoice.template
          .showUnit
          ? 'Unit'
          : '',
      ],
      [
        351,
        invoice.template
          .showUnitPrice
          ? 'Price'
          : '',
      ],
      [
        407,
        invoice.template
          .showLineDiscount
          ? 'Disc.'
          : '',
      ],
      [
        454,
        invoice.template
          .showLineTax
          ? 'Tax'
          : '',
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
    const descriptionLines =
      wrap(
        line.description,
        42,
      )
        .slice(
          0,
          2,
        );

    (
      descriptionLines.length >
        0
        ? descriptionLines
        : [
            'Item',
          ]
    )
      .forEach(
        (
          descriptionLine,
          descriptionIndex,
        ) => {
          content +=
            textCommand(
              42,
              y -
                descriptionIndex *
                  10,
              descriptionLine,
              {
                size:
                  7.5,
                bold:
                  descriptionIndex ===
                  0,
              },
            );
        },
      );

    content +=
      textCommand(
        282,
        y,
        invoice.template
        .showQuantity
        ? amount(
            line.quantity,
          )
        : '',
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        314,
        y,
        invoice.template
        .showUnit
        ? truncate(
            line.unit,
            8,
          )
        : '',
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        351,
        y,
        invoice.template
        .showUnitPrice
        ? amount(
            line.unitPrice,
          )
        : '',
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        407,
        y,
        invoice.template
        .showLineDiscount
        ? (
            line.discountAmount >
              0
              ? amount(
                  line.discountAmount,
                )
              : '-'
          )
        : '',
        {
          size:
            6.8,
        },
      );

    content +=
      textCommand(
        454,
        y,
        invoice.template
        .showLineTax
        ? (
            line.taxRate >
              0
              ? amount(
                  line.taxRate,
                ) +
                '%'
              : '-'
          )
        : '',
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
        (
          invoice.template
            .showSku &&
          line.sku
        )
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

    const detailOffset =
      descriptionLines.length >
        1
        ? 22
        : 12;

    if (
      subline
    ) {
      content +=
        textCommand(
          42,
          y -
            detailOffset,
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

    const rowHeight =
      invoice.template
        .density ===
        'compact'
        ? (
            descriptionLines.length >
              1 ||
            subline
              ? 34
              : 25
          )
        : invoice.template
            .density ===
            'spacious'
          ? (
              descriptionLines.length >
                1 ||
              subline
                ? 46
                : 37
            )
          : (
              descriptionLines.length >
                1 ||
              subline
                ? 40
                : 31
            );

    content +=
      lineCommand(
        36,
        y -
          rowHeight +
          8,
        559,
        y -
          rowHeight +
          8,
      );

    y -=
      rowHeight;
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
      invoice.template
        .footerAlignment ===
        'center'
        ? 210
        : invoice.template
            .footerAlignment ===
            'right'
          ? 390
          : 36,
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
    invoice.etims?.status ===
      'succeeded'
  ) {
    add(
      invoice.etims.environment ===
        'production'
        ? 'KRA eTIMS FISCAL RECEIPT'
        : 'KRA eTIMS SANDBOX / TEST',
      [
        'Solution: ' +
          invoice.etims
            .solutionType
            .toUpperCase(),
        'eTIMS invoice no: ' +
          invoice.etims
            .transactionInvoiceNo,
        invoice.etims
          .receiptNo
          ? 'Receipt no: ' +
            invoice.etims
              .receiptNo
          : '',
        invoice.etims
          .totalReceiptNo
          ? 'Total receipt no: ' +
            invoice.etims
              .totalReceiptNo
          : '',
        invoice.etims
          .sdcId
          ? 'SDC ID: ' +
            invoice.etims
              .sdcId
          : '',
        invoice.etims
          .mrcNo
          ? 'MRC no: ' +
            invoice.etims
              .mrcNo
          : '',
        invoice.etims
          .resultCode
          ? 'KRA result: ' +
            invoice.etims
              .resultCode
          : '',
        invoice.etims
          .succeededAt
          ? 'Fiscalized: ' +
            invoice.etims
              .succeededAt
          : '',
      ]
        .filter(
          Boolean,
        )
        .join(
          ' | ',
        ),
    );

    add(
      'eTIMS RECEIPT SIGNATURE',
      invoice.etims
        .receiptSignature,
    );

    add(
      'eTIMS INTERNAL DATA',
      invoice.etims
        .internalData,
    );

    add(
      'eTIMS VERIFICATION',
      invoice.etims
        .verificationUrl,
    );
  }

  if (
    invoice.template
      .showPaymentInstructions
  ) {
    add(
      (
        invoice.template
          .paymentLabel ||
        'PAYMENT INSTRUCTIONS'
      )
        .toUpperCase(),
      invoice
        .paymentInstructions,
    );
  }

  add(
    (
      invoice.template
        .notesLabel ||
      'NOTES'
    )
      .toUpperCase(),
    invoice.notes,
  );

  add(
    (
      invoice.template
        .termsLabel ||
      'TERMS & CONDITIONS'
    )
      .toUpperCase(),
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
      invoice.template
        .footerAlignment ===
        'center'
        ? 210
        : invoice.template
            .footerAlignment ===
            'right'
          ? 390
          : 36,
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
    invoice.template
      .density ===
      'compact'
      ? 8
      : invoice.template
          .density ===
          'spacious'
        ? 5
        : 6;

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

  const logo =
    logoGeometry(
      invoice,
    );

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

  const logoObjectId =
    logo
      ? 5 +
        streams.length *
        2
      : null;

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
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' +
        (
          logoObjectId
            ? ' /XObject << /Logo ' +
              logoObjectId +
              ' 0 R >>'
            : ''
        ) +
        ' >> /Contents ' +
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

  if (
    logo &&
    logoObjectId
  ) {
    objects.set(
      logoObjectId,
      '<< /Type /XObject /Subtype /Image /Width ' +
      Math.round(
        logo.sourceWidth,
      ) +
      ' /Height ' +
      Math.round(
        logo.sourceHeight,
      ) +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /' +
      logo.filter +
      ' /Length ' +
      logo.bytes.length +
      ' >>\nstream\n' +
      logo.bytes.toString(
        'binary',
      ) +
      '\nendstream',
    );
  }

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
