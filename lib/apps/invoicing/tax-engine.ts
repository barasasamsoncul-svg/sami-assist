import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  cleanText,
  INVOICING_PERMISSIONS,
  InvoicingError,
  isoDate,
  money,
  numberInput,
  optionalUuid,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';


type TaxComponentDefinition = {
  taxRateId: string | null;
  taxGroupId: string | null;
  name: string;
  taxType: string;
  rate: number;
  sequenceNo: number;
  compound: boolean;
};


export type InvoicingTaxComponent = {
  taxRateId: string | null;
  taxGroupId: string | null;
  name: string;
  taxType: string;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
  sequenceNo: number;
  compound: boolean;
};


export type InvoicingTaxTreatment = {
  taxRateId: string | null;
  taxGroupId: string | null;
  taxName: string | null;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  components: InvoicingTaxComponent[];
  fiscalPositionId: string | null;
  localizationId: string | null;
  exemptionId: string | null;
  source: string;
};


function countryCode(
  value: unknown,
) {
  const code =
    cleanText(
      value,
      2,
    ).toUpperCase();

  if (
    code &&
    !/^[A-Z]{2}$/.test(
      code,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Country code must use two letters.',
    );
  }

  return code ||
    null;
}


function dateOrNull(
  value: unknown,
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ''
  ) {
    return null;
  }

  return isoDate(
    value,
  );
}


function roundedRate(
  value: unknown,
) {
  const rate =
    Number(
      value ||
      0,
    );

  if (
    !Number.isFinite(
      rate,
    )
  ) {
    return 0;
  }

  return Math.round(
    rate *
    10000,
  ) /
    10000;
}


async function activity(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    model: string;
    recordId: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(
    `
      INSERT INTO activities (
        company_id,
        user_id,
        model,
        record_id,
        type,
        content,
        metadata
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.model,
      input.recordId,
      input.type,
      input.content,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}


function computeExclusiveComponents(
  taxableAmount: number,
  definitions:
    TaxComponentDefinition[],
) {
  let accumulatedTax =
    0;

  const components:
    InvoicingTaxComponent[] =
      [];

  for (
    const definition
    of definitions
  ) {
    const componentBase =
      definition.compound
        ? taxableAmount +
          accumulatedTax
        : taxableAmount;

    const taxAmount =
      money(
        componentBase *
        definition.rate /
        100,
      );

    accumulatedTax =
      money(
        accumulatedTax +
        taxAmount,
      );

    components.push({
      taxRateId:
        definition.taxRateId,
      taxGroupId:
        definition.taxGroupId,
      name:
        definition.name,
      taxType:
        definition.taxType,
      rate:
        definition.rate,
      taxableAmount:
        money(
          componentBase,
        ),
      taxAmount,
      sequenceNo:
        definition.sequenceNo,
      compound:
        definition.compound,
    });
  }

  return {
    components,
    totalTax:
      money(
        accumulatedTax,
      ),
  };
}


function calculateTax(
  taxableAmount:
    number,
  taxCalculation:
    'exclusive' |
    'inclusive',
  definitions:
    TaxComponentDefinition[],
) {
  if (
    definitions.length ===
      0 ||
    taxableAmount <=
      0
  ) {
    return {
      components:
        [] as
          InvoicingTaxComponent[],
      taxAmount:
        0,
      lineTotal:
        money(
          taxableAmount,
        ),
      effectiveRate:
        0,
    };
  }

  if (
    taxCalculation ===
      'exclusive'
  ) {
    const calculated =
      computeExclusiveComponents(
        taxableAmount,
        definitions,
      );

    return {
      components:
        calculated.components,
      taxAmount:
        calculated.totalTax,
      lineTotal:
        money(
          taxableAmount +
          calculated.totalTax,
        ),
      effectiveRate:
        taxableAmount >
        0
          ? roundedRate(
              calculated.totalTax /
              taxableAmount *
              100,
            )
          : 0,
    };
  }

  const unit =
    computeExclusiveComponents(
      1,
      definitions,
    );

  const grossFactor =
    1 +
    unit.totalTax;

  const netAmount =
    grossFactor >
      0
      ? taxableAmount /
        grossFactor
      : taxableAmount;

  const calculated =
    computeExclusiveComponents(
      netAmount,
      definitions,
    );

  const totalTax =
    money(
      taxableAmount -
      netAmount,
    );

  return {
    components:
      calculated.components.map(
        component => ({
          ...component,
          taxAmount:
            calculated.totalTax >
            0
              ? money(
                  totalTax *
                  component.taxAmount /
                  calculated.totalTax,
                )
              : 0,
        }),
      ),
    taxAmount:
      totalTax,
    lineTotal:
      money(
        taxableAmount,
      ),
    effectiveRate:
      netAmount >
      0
        ? roundedRate(
            totalTax /
            netAmount *
            100,
          )
        : 0,
  };
}


async function activeRateDefinition(
  client:
    PoolClient,
  input: {
    companyId: string;
    taxRateId: string;
    invoiceDate: string;
    taxGroupId?: string | null;
    sequenceNo?: number;
    compound?: boolean;
  },
):
  Promise<TaxComponentDefinition> {
  const result =
    await client.query(
      `
        SELECT
          id,
          name,
          rate,
          tax_type
        FROM invoicing_tax_rates
        WHERE id = $1
          AND company_id = $2
          AND is_active = TRUE
          AND deleted_at IS NULL
          AND (
            valid_from IS NULL
            OR valid_from <= $3::date
          )
          AND (
            valid_to IS NULL
            OR valid_to >= $3::date
          )
        LIMIT 1
      `,
      [
        input.taxRateId,
        input.companyId,
        input.invoiceDate,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The selected tax rate is inactive or outside its validity period.',
      {
        taxRateId:
          input.taxRateId,
      },
    );
  }

  const row =
    result.rows[0];

  return {
    taxRateId:
      String(
        row.id,
      ),
    taxGroupId:
      input.taxGroupId ||
      null,
    name:
      String(
        row.name,
      ),
    taxType:
      String(
        row.tax_type ||
        'vat',
      ),
    rate:
      roundedRate(
        row.rate,
      ),
    sequenceNo:
      input.sequenceNo ||
      10,
    compound:
      input.compound ===
      true,
  };
}


async function groupDefinitions(
  client:
    PoolClient,
  input: {
    companyId: string;
    taxGroupId: string;
    invoiceDate: string;
  },
) {
  const group =
    await client.query(
      `
        SELECT
          id,
          name,
          calculation_mode
        FROM invoicing_tax_groups
        WHERE id = $1
          AND company_id = $2
          AND is_active = TRUE
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.taxGroupId,
        input.companyId,
      ],
    );

  if (
    group.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The selected tax group is not active.',
    );
  }

  const members =
    await client.query(
      `
        SELECT
          member.tax_rate_id,
          member.sequence_no,
          member.compound
        FROM invoicing_tax_group_members member
        INNER JOIN invoicing_tax_rates rate
          ON rate.id =
             member.tax_rate_id
         AND rate.company_id =
             member.company_id
        WHERE member.group_id = $1
          AND member.company_id = $2
          AND rate.is_active = TRUE
          AND rate.deleted_at IS NULL
          AND (
            rate.valid_from IS NULL
            OR rate.valid_from <= $3::date
          )
          AND (
            rate.valid_to IS NULL
            OR rate.valid_to >= $3::date
          )
        ORDER BY
          member.sequence_no,
          member.id
      `,
      [
        input.taxGroupId,
        input.companyId,
        input.invoiceDate,
      ],
    );

  if (
    members.rows.length ===
      0
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The selected tax group has no active tax components.',
    );
  }

  const definitions:
    TaxComponentDefinition[] =
      [];

  for (
    const member
    of members.rows
  ) {
    definitions.push(
      await activeRateDefinition(
        client,
        {
          companyId:
            input.companyId,
          taxRateId:
            String(
              member.tax_rate_id,
            ),
          invoiceDate:
            input.invoiceDate,
          taxGroupId:
            input.taxGroupId,
          sequenceNo:
            Number(
              member.sequence_no ||
              10,
            ),
          compound:
            String(
              group.rows[0]
                .calculation_mode,
            ) ===
              'compound' ||
            member.compound ===
              true,
        },
      ),
    );
  }

  return {
    groupName:
      String(
        group.rows[0].name,
      ),
    definitions,
  };
}


async function resolveFiscalPosition(
  client:
    PoolClient,
  input: {
    companyId: string;
    explicitId: string | null;
    countryCode: string | null;
    customerType: string;
  },
) {
  if (
    input.explicitId
  ) {
    const explicit =
      await client.query(
        `
          SELECT id
          FROM invoicing_fiscal_positions
          WHERE id = $1
            AND company_id = $2
            AND is_active = TRUE
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          input.explicitId,
          input.companyId,
        ],
      );

    if (
      explicit.rows.length ===
        1
    ) {
      return String(
        explicit.rows[0].id,
      );
    }
  }

  const automatic =
    await client.query(
      `
        SELECT id
        FROM invoicing_fiscal_positions
        WHERE company_id = $1
          AND is_active = TRUE
          AND deleted_at IS NULL
          AND (
            country_code IS NULL
            OR country_code = $2
          )
          AND (
            customer_type IS NULL
            OR customer_type = $3
          )
          AND (
            auto_apply = TRUE
            OR is_default = TRUE
          )
        ORDER BY
          CASE
            WHEN country_code = $2
              THEN 0
            ELSE 1
          END,
          CASE
            WHEN customer_type = $3
              THEN 0
            ELSE 1
          END,
          is_default DESC,
          priority ASC,
          created_at ASC
        LIMIT 1
      `,
      [
        input.companyId,
        input.countryCode,
        input.customerType,
      ],
    );

  return automatic.rows[0]
    ?.id
      ? String(
          automatic.rows[0].id,
        )
      : null;
}


async function resolveLocalization(
  client:
    PoolClient,
  companyId:
    string,
  country:
    string |
    null,
) {
  const result =
    await client.query(
      `
        SELECT id
        FROM invoicing_tax_localizations
        WHERE company_id = $1
          AND is_active = TRUE
          AND deleted_at IS NULL
          AND (
            country_code = $2
            OR is_default = TRUE
          )
        ORDER BY
          CASE
            WHEN country_code = $2
              THEN 0
            ELSE 1
          END,
          is_default DESC,
          created_at ASC
        LIMIT 1
      `,
      [
        companyId,
        country,
      ],
    );

  return result.rows[0]
    ?.id
      ? String(
          result.rows[0].id,
        )
      : null;
}


export async function resolveInvoicingTaxTreatment(
  client:
    PoolClient,
  input: {
    companyId: string;
    customerId: string;
    catalogItemId?: string | null;
    explicitTaxRateId?: string | null;
    explicitTaxGroupId?: string | null;
    explicitTaxRate?: number | null;
    invoiceDate: string;
    taxCalculation:
      'exclusive' |
      'inclusive';
    taxableAmount: number;
  },
):
  Promise<InvoicingTaxTreatment> {
  const customer =
    await client.query(
      `
        SELECT
          id,
          customer_type,
          country_code,
          fiscal_position_id
        FROM invoicing_customers
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.customerId,
        input.companyId,
      ],
    );

  if (
    customer.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'CUSTOMER_NOT_FOUND',
      'Customer tax context could not be resolved.',
    );
  }

  let taxCategory:
    string |
    null =
      null;

  let sourceRateId =
    input.explicitTaxRateId ||
    null;

  let sourceGroupId =
    input.explicitTaxGroupId ||
    null;

  if (
    input.catalogItemId
  ) {
    const catalog =
      await client.query(
        `
          SELECT
            tax_category,
            default_tax_rate_id,
            default_tax_group_id
          FROM invoicing_catalog_items
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          input.catalogItemId,
          input.companyId,
        ],
      );

    if (
      catalog.rows.length ===
        1
    ) {
      taxCategory =
        catalog.rows[0]
          .tax_category
          ? String(
              catalog.rows[0]
                .tax_category,
            )
          : null;

      sourceRateId =
        sourceRateId ||
        (
          catalog.rows[0]
            .default_tax_rate_id
            ? String(
                catalog.rows[0]
                  .default_tax_rate_id,
              )
            : null
        );

      sourceGroupId =
        sourceGroupId ||
        (
          catalog.rows[0]
            .default_tax_group_id
            ? String(
                catalog.rows[0]
                  .default_tax_group_id,
              )
            : null
        );
    }
  }

  const customerCountry =
    customer.rows[0]
      .country_code
      ? String(
          customer.rows[0]
            .country_code,
        )
      : null;

  const customerType =
    String(
      customer.rows[0]
        .customer_type ||
      'company',
    );

  const fiscalPositionId =
    await resolveFiscalPosition(
      client,
      {
        companyId:
          input.companyId,
        explicitId:
          customer.rows[0]
            .fiscal_position_id
            ? String(
                customer.rows[0]
                  .fiscal_position_id,
              )
            : null,
        countryCode:
          customerCountry,
        customerType,
      },
    );

  const localizationId =
    await resolveLocalization(
      client,
      input.companyId,
      customerCountry,
    );

  const exemption =
    await client.query(
      `
        SELECT
          id,
          reason
        FROM invoicing_tax_exemptions
        WHERE company_id = $1
          AND customer_id = $2
          AND status = 'active'
          AND (
            country_code IS NULL
            OR country_code = $3
          )
          AND (
            valid_from IS NULL
            OR valid_from <= $4::date
          )
          AND (
            valid_to IS NULL
            OR valid_to >= $4::date
          )
        ORDER BY
          valid_to NULLS LAST,
          created_at DESC
        LIMIT 1
      `,
      [
        input.companyId,
        input.customerId,
        customerCountry,
        input.invoiceDate,
      ],
    );

  if (
    exemption.rows.length ===
      1
  ) {
    return {
      taxRateId:
        null,
      taxGroupId:
        null,
      taxName:
        'Tax exempt',
      taxRate:
        0,
      taxAmount:
        0,
      lineTotal:
        money(
          input.taxableAmount,
        ),
      components:
        [],
      fiscalPositionId,
      localizationId,
      exemptionId:
        String(
          exemption.rows[0].id,
        ),
      source:
        'customer_exemption',
    };
  }

  if (
    fiscalPositionId &&
    (
      sourceRateId ||
      sourceGroupId
    )
  ) {
    const mapping =
      await client.query(
        `
          SELECT
            destination_tax_rate_id,
            destination_tax_group_id,
            exempt,
            label
          FROM invoicing_fiscal_position_mappings
          WHERE company_id = $1
            AND fiscal_position_id = $2
            AND (
              (
                $3::uuid IS NOT NULL
                AND source_tax_rate_id = $3::uuid
              )
              OR (
                $4::uuid IS NOT NULL
                AND source_tax_group_id = $4::uuid
              )
            )
          ORDER BY
            sequence_no,
            created_at
          LIMIT 1
        `,
        [
          input.companyId,
          fiscalPositionId,
          sourceRateId,
          sourceGroupId,
        ],
      );

    if (
      mapping.rows.length ===
        1
    ) {
      if (
        mapping.rows[0]
          .exempt ===
        true
      ) {
        return {
          taxRateId:
            null,
          taxGroupId:
            null,
          taxName:
            mapping.rows[0]
              .label
              ? String(
                  mapping.rows[0]
                    .label,
                )
              : 'Fiscal-position exemption',
          taxRate:
            0,
          taxAmount:
            0,
          lineTotal:
            money(
              input.taxableAmount,
            ),
          components:
            [],
          fiscalPositionId,
          localizationId,
          exemptionId:
            null,
          source:
            'fiscal_position_exemption',
        };
      }

      sourceRateId =
        mapping.rows[0]
          .destination_tax_rate_id
          ? String(
              mapping.rows[0]
                .destination_tax_rate_id,
            )
          : null;

      sourceGroupId =
        mapping.rows[0]
          .destination_tax_group_id
          ? String(
              mapping.rows[0]
                .destination_tax_group_id,
            )
          : null;
    }
  }

  const rule =
    await client.query(
      `
        SELECT
          id,
          name,
          action,
          destination_tax_rate_id,
          destination_tax_group_id
        FROM invoicing_tax_rules
        WHERE company_id = $1
          AND is_active = TRUE
          AND deleted_at IS NULL
          AND (
            country_code IS NULL
            OR country_code = $2
          )
          AND (
            customer_type IS NULL
            OR customer_type = $3
          )
          AND (
            tax_category IS NULL
            OR tax_category = $4
          )
          AND (
            source_tax_rate_id IS NULL
            OR source_tax_rate_id = $5::uuid
          )
          AND (
            source_tax_group_id IS NULL
            OR source_tax_group_id = $6::uuid
          )
          AND (
            valid_from IS NULL
            OR valid_from <= $7::date
          )
          AND (
            valid_to IS NULL
            OR valid_to >= $7::date
          )
        ORDER BY
          priority,
          created_at,
          id
        LIMIT 1
      `,
      [
        input.companyId,
        customerCountry,
        customerType,
        taxCategory,
        sourceRateId,
        sourceGroupId,
        input.invoiceDate,
      ],
    );

  if (
    rule.rows.length ===
      1
  ) {
    const action =
      String(
        rule.rows[0]
          .action,
      );

    if (
      action ===
        'exempt'
    ) {
      return {
        taxRateId:
          null,
        taxGroupId:
          null,
        taxName:
          String(
            rule.rows[0]
              .name,
          ),
        taxRate:
          0,
        taxAmount:
          0,
        lineTotal:
          money(
            input.taxableAmount,
          ),
        components:
          [],
        fiscalPositionId,
        localizationId,
        exemptionId:
          null,
        source:
          'tax_rule_exemption',
      };
    }

    if (
      action ===
        'map'
    ) {
      sourceRateId =
        rule.rows[0]
          .destination_tax_rate_id
          ? String(
              rule.rows[0]
                .destination_tax_rate_id,
            )
          : sourceRateId;

      sourceGroupId =
        rule.rows[0]
          .destination_tax_group_id
          ? String(
              rule.rows[0]
                .destination_tax_group_id,
            )
          : sourceGroupId;
    }
  }

  let definitions:
    TaxComponentDefinition[] =
      [];

  let taxName:
    string |
    null =
      null;

  let resolvedGroupId:
    string |
    null =
      null;

  let resolvedRateId:
    string |
    null =
      null;

  if (
    sourceGroupId
  ) {
    const grouped =
      await groupDefinitions(
        client,
        {
          companyId:
            input.companyId,
          taxGroupId:
            sourceGroupId,
          invoiceDate:
            input.invoiceDate,
        },
      );

    definitions =
      grouped.definitions;

    taxName =
      grouped.groupName;

    resolvedGroupId =
      sourceGroupId;
  } else if (
    sourceRateId
  ) {
    const definition =
      await activeRateDefinition(
        client,
        {
          companyId:
            input.companyId,
          taxRateId:
            sourceRateId,
          invoiceDate:
            input.invoiceDate,
        },
      );

    definitions = [
      definition,
    ];

    taxName =
      definition.name;

    resolvedRateId =
      sourceRateId;
  } else if (
    input.explicitTaxRate !==
      undefined &&
    input.explicitTaxRate !==
      null
  ) {
    const manualRate =
      numberInput(
        input.explicitTaxRate,
        'Tax rate',
        {
          min:
            0,
          max:
            100,
        },
      );

    if (
      manualRate >
        0
    ) {
      definitions = [
        {
          taxRateId:
            null,
          taxGroupId:
            null,
          name:
            'Manual tax',
          taxType:
            'manual',
          rate:
            roundedRate(
              manualRate,
            ),
          sequenceNo:
            10,
          compound:
            false,
        },
      ];

      taxName =
        'Manual tax';
    }
  }

  const calculated =
    calculateTax(
      input.taxableAmount,
      input.taxCalculation,
      definitions,
    );

  return {
    taxRateId:
      resolvedRateId,
    taxGroupId:
      resolvedGroupId,
    taxName,
    taxRate:
      calculated.effectiveRate,
    taxAmount:
      calculated.taxAmount,
    lineTotal:
      calculated.lineTotal,
    components:
      calculated.components,
    fiscalPositionId,
    localizationId,
    exemptionId:
      null,
    source:
      sourceGroupId
        ? 'tax_group'
        : sourceRateId
          ? (
              rule.rows.length >
                0
                ? 'tax_rule'
                : fiscalPositionId
                  ? 'fiscal_position'
                  : 'tax_rate'
            )
          : definitions.length >
              0
            ? 'manual'
            : 'none',
  };
}


async function taxAdminContext() {
  return requireInvoicingContext(
    INVOICING_PERMISSIONS
      .SETTINGS_MANAGE,
  );
}


export async function saveInvoicingTaxGroup(
  input:
    Record<string, unknown>,
) {
  const context =
    await taxAdminContext();

  const groupId =
    optionalUuid(
      input.groupId,
    );

  const name =
    cleanText(
      input.name,
      140,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax group name is required.',
    );
  }

  const code =
    cleanText(
      input.code,
      80,
    ) ||
    null;

  const mode =
    input.calculationMode ===
      'compound'
      ? 'compound'
      : 'sum';

  const makeDefault =
    input.isDefault ===
      true ||
    input.isDefault ===
      'true';

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_tax_groups
          SET
            is_default = FALSE,
            updated_by = $2,
            updated_at = NOW()
          WHERE company_id = $1
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    const saved =
      groupId
        ? await client.query(
            `
              UPDATE invoicing_tax_groups
              SET
                name = $3,
                code = $4,
                description = $5,
                tax_type = $6,
                country_code = $7,
                jurisdiction_code = $8,
                calculation_mode = $9,
                is_default = $10,
                is_active = $11,
                updated_by = $12,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id
            `,
            [
              groupId,
              context.companyId,
              name,
              code,
              cleanText(
                input.description,
                4000,
              ) ||
                null,
              cleanText(
                input.taxType,
                40,
              ) ||
                'vat',
              countryCode(
                input.countryCode,
              ),
              cleanText(
                input.jurisdictionCode,
                80,
              ) ||
                null,
              mode,
              makeDefault,
              input.isActive !==
                false,
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO invoicing_tax_groups (
                company_id,
                name,
                code,
                description,
                tax_type,
                country_code,
                jurisdiction_code,
                calculation_mode,
                is_default,
                is_active,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
              )
              RETURNING id
            `,
            [
              context.companyId,
              name,
              code,
              cleanText(
                input.description,
                4000,
              ) ||
                null,
              cleanText(
                input.taxType,
                40,
              ) ||
                'vat',
              countryCode(
                input.countryCode,
              ),
              cleanText(
                input.jurisdictionCode,
                80,
              ) ||
                null,
              mode,
              makeDefault,
              input.isActive !==
                false,
              context.userId,
            ],
          );

    if (
      saved.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Tax group could not be saved.',
      );
    }

    const id =
      String(
        saved.rows[0].id,
      );

    await activity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.tax_group',
        recordId:
          id,
        type:
          'invoicing.tax_group_saved',
        content:
          'Tax group ' +
          name +
          ' saved.',
        metadata: {
          calculationMode:
            mode,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function saveInvoicingTaxGroupMember(
  input:
    Record<string, unknown>,
) {
  const context =
    await taxAdminContext();

  const groupId =
    requireUuid(
      input.groupId,
      'Tax group',
    );

  const taxRateId =
    requireUuid(
      input.taxRateId,
      'Tax rate',
    );

  const sequenceNo =
    Math.trunc(
      numberInput(
        input.sequenceNo ??
        10,
        'Sequence',
        {
          min:
            1,
          max:
            100000,
        },
      ),
    );

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_tax_group_members (
          company_id,
          group_id,
          tax_rate_id,
          sequence_no,
          compound,
          created_by,
          updated_by
        )
        SELECT
          $1,$2,$3,$4,$5,$6,$6
        WHERE EXISTS (
          SELECT 1
          FROM invoicing_tax_groups group_row
          WHERE group_row.id = $2
            AND group_row.company_id = $1
            AND group_row.is_active = TRUE
            AND group_row.deleted_at IS NULL
        )
        AND EXISTS (
          SELECT 1
          FROM invoicing_tax_rates rate
          WHERE rate.id = $3
            AND rate.company_id = $1
            AND rate.is_active = TRUE
            AND rate.deleted_at IS NULL
        )
        ON CONFLICT (
          group_id,
          tax_rate_id
        )
        DO UPDATE
        SET
          sequence_no =
            EXCLUDED.sequence_no,
          compound =
            EXCLUDED.compound,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
        RETURNING id
      `,
      [
        context.companyId,
        groupId,
        taxRateId,
        sequenceNo,
        input.compound ===
          true ||
        input.compound ===
          'true',
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose an active tax group and active tax rate.',
    );
  }

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}


export async function saveInvoicingFiscalPosition(
  input:
    Record<string, unknown>,
) {
  const context =
    await taxAdminContext();

  const positionId =
    optionalUuid(
      input.positionId,
    );

  const name =
    cleanText(
      input.name,
      140,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Fiscal position name is required.',
    );
  }

  const values = [
    context.companyId,
    name,
    cleanText(
      input.code,
      80,
    ) ||
      null,
    cleanText(
      input.description,
      4000,
    ) ||
      null,
    countryCode(
      input.countryCode,
    ),
    cleanText(
      input.customerType,
      30,
    ) ||
      null,
    Math.trunc(
      numberInput(
        input.priority ??
        100,
        'Priority',
        {
          min:
            0,
          max:
            100000,
        },
      ),
    ),
    input.autoApply !==
      false,
    input.isDefault ===
      true ||
    input.isDefault ===
      'true',
    input.isActive !==
      false,
    context.userId,
  ];

  const result =
    positionId
      ? await context.pool.query(
          `
            UPDATE invoicing_fiscal_positions
            SET
              name = $3,
              code = $4,
              description = $5,
              country_code = $6,
              customer_type = $7,
              priority = $8,
              auto_apply = $9,
              is_default = $10,
              is_active = $11,
              updated_by = $12,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            RETURNING id
          `,
          [
            positionId,
            ...values,
          ],
        )
      : await context.pool.query(
          `
            INSERT INTO invoicing_fiscal_positions (
              company_id,
              name,
              code,
              description,
              country_code,
              customer_type,
              priority,
              auto_apply,
              is_default,
              is_active,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
            )
            RETURNING id
          `,
          values,
        );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Fiscal position could not be saved.',
    );
  }

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}


export async function saveInvoicingFiscalPositionMapping(
  input:
    Record<string, unknown>,
) {
  const context =
    await taxAdminContext();

  const positionId =
    requireUuid(
      input.positionId,
      'Fiscal position',
    );

  const sourceTaxRateId =
    optionalUuid(
      input.sourceTaxRateId,
    );

  const sourceTaxGroupId =
    optionalUuid(
      input.sourceTaxGroupId,
    );

  if (
    !sourceTaxRateId &&
    !sourceTaxGroupId
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a source tax rate or tax group.',
    );
  }

  const exempt =
    input.exempt ===
      true ||
    input.exempt ===
      'true';

  const destinationTaxRateId =
    optionalUuid(
      input.destinationTaxRateId,
    );

  const destinationTaxGroupId =
    optionalUuid(
      input.destinationTaxGroupId,
    );

  if (
    !exempt &&
    !destinationTaxRateId &&
    !destinationTaxGroupId
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a destination tax or mark the mapping exempt.',
    );
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_fiscal_position_mappings (
          company_id,
          fiscal_position_id,
          source_tax_rate_id,
          source_tax_group_id,
          destination_tax_rate_id,
          destination_tax_group_id,
          exempt,
          label,
          sequence_no,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
        )
        RETURNING id
      `,
      [
        context.companyId,
        positionId,
        sourceTaxRateId,
        sourceTaxGroupId,
        destinationTaxRateId,
        destinationTaxGroupId,
        exempt,
        cleanText(
          input.label,
          180,
        ) ||
          null,
        Math.trunc(
          numberInput(
            input.sequenceNo ??
            100,
            'Sequence',
            {
              min:
                1,
              max:
                100000,
            },
          ),
        ),
        context.userId,
      ],
    );

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}


export async function saveInvoicingTaxRule(
  input:
    Record<string, unknown>,
) {
  const context =
    await taxAdminContext();

  const ruleId =
    optionalUuid(
      input.ruleId,
    );

  const name =
    cleanText(
      input.name,
      160,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax rule name is required.',
    );
  }

  const action =
    [
      'map',
      'exempt',
      'keep',
    ].includes(
      String(
        input.action ||
        '',
      ),
    )
      ? String(
          input.action,
        )
      : 'map';

  const sourceTaxRateId =
    optionalUuid(
      input.sourceTaxRateId,
    );

  const sourceTaxGroupId =
    optionalUuid(
      input.sourceTaxGroupId,
    );

  const destinationTaxRateId =
    optionalUuid(
      input.destinationTaxRateId,
    );

  const destinationTaxGroupId =
    optionalUuid(
      input.destinationTaxGroupId,
    );

  if (
    action ===
      'map' &&
    !destinationTaxRateId &&
    !destinationTaxGroupId
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Mapped tax rules need a destination tax rate or tax group.',
    );
  }

  const values = [
    context.companyId,
    name,
    Math.trunc(
      numberInput(
        input.priority ??
        100,
        'Priority',
        {
          min:
            0,
          max:
            100000,
        },
      ),
    ),
    countryCode(
      input.countryCode,
    ),
    cleanText(
      input.customerType,
      30,
    ) ||
      null,
    cleanText(
      input.taxCategory,
      80,
    ) ||
      null,
    sourceTaxRateId,
    sourceTaxGroupId,
    destinationTaxRateId,
    destinationTaxGroupId,
    action,
    dateOrNull(
      input.validFrom,
    ),
    dateOrNull(
      input.validTo,
    ),
    input.stopProcessing !==
      false,
    input.isActive !==
      false,
    context.userId,
  ];

  const result =
    ruleId
      ? await context.pool.query(
          `
            UPDATE invoicing_tax_rules
            SET
              name = $3,
              priority = $4,
              country_code = $5,
              customer_type = $6,
              tax_category = $7,
              source_tax_rate_id = $8,
              source_tax_group_id = $9,
              destination_tax_rate_id = $10,
              destination_tax_group_id = $11,
              action = $12,
              valid_from = $13,
              valid_to = $14,
              stop_processing = $15,
              is_active = $16,
              updated_by = $17,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            RETURNING id
          `,
          [
            ruleId,
            ...values,
          ],
        )
      : await context.pool.query(
          `
            INSERT INTO invoicing_tax_rules (
              company_id,
              name,
              priority,
              country_code,
              customer_type,
              tax_category,
              source_tax_rate_id,
              source_tax_group_id,
              destination_tax_rate_id,
              destination_tax_group_id,
              action,
              valid_from,
              valid_to,
              stop_processing,
              is_active,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16
            )
            RETURNING id
          `,
          values,
        );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax rule could not be saved.',
    );
  }

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}


export async function saveInvoicingTaxExemption(
  input:
    Record<string, unknown>,
) {
  const context =
    await taxAdminContext();

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const reason =
    cleanText(
      input.reason,
      4000,
    );

  if (!reason) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax exemption reason is required.',
    );
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_tax_exemptions (
          company_id,
          customer_id,
          exemption_type,
          certificate_number,
          tax_type,
          country_code,
          valid_from,
          valid_to,
          reason,
          status,
          created_by,
          updated_by
        )
        SELECT
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          'active',
          $10,$10
        WHERE EXISTS (
          SELECT 1
          FROM invoicing_customers customer
          WHERE customer.id = $2
            AND customer.company_id = $1
            AND customer.deleted_at IS NULL
        )
        RETURNING id
      `,
      [
        context.companyId,
        customerId,
        cleanText(
          input.exemptionType,
          80,
        ) ||
          'customer',
        cleanText(
          input.certificateNumber,
          180,
        ) ||
          null,
        cleanText(
          input.taxType,
          40,
        ) ||
          null,
        countryCode(
          input.countryCode,
        ),
        dateOrNull(
          input.validFrom,
        ),
        dateOrNull(
          input.validTo,
        ),
        reason,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid customer for the tax exemption.',
    );
  }

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}


export async function saveInvoicingTaxLocalization(
  input:
    Record<string, unknown>,
) {
  const context =
    await taxAdminContext();

  const localizationId =
    optionalUuid(
      input.localizationId,
    );

  const name =
    cleanText(
      input.name,
      160,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax localization name is required.',
    );
  }

  const localizationCountry =
    countryCode(
      input.countryCode,
    );

  if (
    !localizationCountry
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax localization country is required.',
    );
  }

  const makeDefault =
    input.isDefault ===
      true ||
    input.isDefault ===
      'true';

  if (
    makeDefault
  ) {
    await context.pool.query(
      `
        UPDATE invoicing_tax_localizations
        SET
          is_default = FALSE,
          updated_by = $2,
          updated_at = NOW()
        WHERE company_id = $1
          AND deleted_at IS NULL
      `,
      [
        context.companyId,
        context.userId,
      ],
    );
  }

  const values = [
    context.companyId,
    name,
    localizationCountry,
    cleanText(
      input.jurisdictionCode,
      80,
    ) ||
      null,
    cleanText(
      input.taxRegistrationNumber,
      180,
    ) ||
      null,
    cleanText(
      input.defaultTaxType,
      40,
    ) ||
      'vat',
    [
      'monthly',
      'quarterly',
      'annual',
      'custom',
    ].includes(
      String(
        input.filingFrequency ||
        '',
      ),
    )
      ? String(
          input.filingFrequency,
        )
      : 'monthly',
    makeDefault,
    input.isActive !==
      false,
    JSON.stringify(
      input.config &&
      typeof input.config ===
        'object'
        ? input.config
        : {},
    ),
    context.userId,
  ];

  const result =
    localizationId
      ? await context.pool.query(
          `
            UPDATE invoicing_tax_localizations
            SET
              name = $3,
              country_code = $4,
              jurisdiction_code = $5,
              tax_registration_number = $6,
              default_tax_type = $7,
              filing_frequency = $8,
              is_default = $9,
              is_active = $10,
              config = $11::jsonb,
              updated_by = $12,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            RETURNING id
          `,
          [
            localizationId,
            ...values,
          ],
        )
      : await context.pool.query(
          `
            INSERT INTO invoicing_tax_localizations (
              company_id,
              name,
              country_code,
              jurisdiction_code,
              tax_registration_number,
              default_tax_type,
              filing_frequency,
              is_default,
              is_active,
              config,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11
            )
            RETURNING id
          `,
          values,
        );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax localization could not be saved.',
    );
  }

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}
