import 'server-only';

import {
  createHash,
  randomUUID,
} from 'node:crypto';
import type {
  PoolClient,
} from 'pg';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';
import {
  postBalancedLedgerJournal,
  reversePostedLedgerJournal,
} from './ledger-engine';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
} from './validation';
import {
  financingDayCountDays,
  financingForeignDecimal,
  financingRateScaled,
  financingSignedRateScaled,
  financingRateDecimal,
  type FinancingDayCount,
  type FinancingFrequency,
  type FinancingRepaymentStructure,
} from './financing-rules';
import {
  assertFinancingFunds,
  assertFinancingFxRevaluationCleared,
  assertFinancingSettlementCurrency,
  calculateFinancingInterest,
  financingAccount,
  financingBaseAmount,
  financingBody,
  financingBool,
  financingChoice,
  financingCurrency,
  financingDirection,
  financingEffectiveRate,
  financingFacilityForUpdate,
  financingFinancialAccountForUpdate,
  financingFxAccounts,
  financingInterestCarryingCents,
  financingOptionalId,
  financingOutstandingInterestUnits,
  financingOutstandingPrincipalUnits,
  financingPrincipalBuckets,
  financingProportionalCents,
  financingPositiveUnits,
  financingRate,
  financingRateToBase,
  financingText,
  rebuildFinancingSchedule,
  recordFinancingFxMovement,
  signedForeignUnits,
  type FinancingDirection,
  type FinancingFacilityRow,
} from './financing-helpers';

type Context =
  Awaited<
    ReturnType<
      typeof requireEnterpriseModuleTableContext
    >
  >;

const FACILITY_TYPES =
  [
    'term_loan',
    'revolving_credit',
    'overdraft',
    'note',
    'shareholder_loan',
    'other',
  ] as const;

const DAY_COUNTS =
  [
    'actual_365',
    'actual_360',
    'thirty_360',
  ] as const;

const REPAYMENT_STRUCTURES =
  [
    'annuity',
    'equal_principal',
    'interest_only',
    'bullet',
    'custom',
  ] as const;

const PAYMENT_FREQUENCIES =
  [
    'monthly',
    'quarterly',
    'semiannual',
    'annual',
    'bullet',
    'custom',
  ] as const;

function hashPayload(
  value:
    unknown,
) {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify(
        value,
      ),
    )
    .digest(
      'hex',
    );
}

async function audit(
  context:
    Context,
  action:
    string,
  resourceType:
    string,
  resourceId:
    string,
  summary:
    string,
  metadata:
    Record<
      string,
      unknown
    > = {},
) {
  await recordWorkspaceAuditEvent({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      'accounting.financing.' +
      action,
    module:
      'accounting',
    resourceType,
    resourceId,
    summary,
    result:
      'success',
    metadata,
  }).catch(
    error =>
      console.error(
        '[Accounting] Financing audit failed',
        error,
      ),
  );
}

async function financingSettingsForUpdate(
  client:
    PoolClient,
  companyId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM accounting_financing_settings
        WHERE company_id =
              $1
          AND deleted_at
              IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        companyId,
      ],
    );

  return result.rows[0] ||
    null;
}

function defaultAccountKeys(
  direction:
    FinancingDirection,
) {
  return direction ===
      'borrowing'
    ? {
        principal:
          'default_borrowing_principal_account_id',
        currentPrincipal:
          'default_current_borrowing_account_id',
        interest:
          'default_interest_expense_account_id',
        accruedInterest:
          'default_accrued_interest_liability_account_id',
        fee:
          'default_financing_fee_expense_account_id',
      }
    : {
        principal:
          'default_lending_principal_account_id',
        currentPrincipal:
          'default_current_lending_account_id',
        interest:
          'default_interest_income_account_id',
        accruedInterest:
          'default_accrued_interest_asset_account_id',
        fee:
          'default_financing_fee_income_account_id',
      };
}

function accountRoles(
  direction:
    FinancingDirection,
) {
  return direction ===
      'borrowing'
    ? {
        principal:
          'liability' as const,
        currentPrincipal:
          'liability' as const,
        interest:
          'expense' as const,
        accruedInterest:
          'liability' as const,
        fee:
          'expense' as const,
      }
    : {
        principal:
          'asset' as const,
        currentPrincipal:
          'asset' as const,
        interest:
          'income' as const,
        accruedInterest:
          'asset' as const,
        fee:
          'income' as const,
      };
}

function settingsAccount(
  settings:
    Record<
      string,
      unknown
    > |
    null,
  key:
    string,
) {
  return settings &&
      settings[
        key
      ]
    ? String(
        settings[
          key
        ],
      )
    : null;
}

export async function saveFinancingSettings(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_settings',
      'edit',
    );
  const body =
    financingBody(
      input,
    );

  if (
    accountingId(
      body.expectedCompanyId,
    ) !==
    context.companyId
  ) {
    throw new AccountingInputError(
      'The active company changed. Reload Accounting before saving financing settings.',
    );
  }

  const mappings = {
    borrowingPrincipal:
      financingOptionalId(
        body.defaultBorrowingPrincipalAccountId,
      ),
    currentBorrowing:
      financingOptionalId(
        body.defaultCurrentBorrowingAccountId,
      ),
    lendingPrincipal:
      financingOptionalId(
        body.defaultLendingPrincipalAccountId,
      ),
    currentLending:
      financingOptionalId(
        body.defaultCurrentLendingAccountId,
      ),
    interestExpense:
      financingOptionalId(
        body.defaultInterestExpenseAccountId,
      ),
    interestIncome:
      financingOptionalId(
        body.defaultInterestIncomeAccountId,
      ),
    accruedInterestLiability:
      financingOptionalId(
        body.defaultAccruedInterestLiabilityAccountId,
      ),
    accruedInterestAsset:
      financingOptionalId(
        body.defaultAccruedInterestAssetAccountId,
      ),
    feeExpense:
      financingOptionalId(
        body.defaultFinancingFeeExpenseAccountId,
      ),
    feeIncome:
      financingOptionalId(
        body.defaultFinancingFeeIncomeAccountId,
      ),
  };
  const dayCount =
    financingChoice(
      body.defaultDayCount ||
      'actual_365',
      DAY_COUNTS,
      'day-count convention',
    );
  const repayment =
    financingChoice(
      body.defaultRepaymentStructure ||
      'annuity',
      REPAYMENT_STRUCTURES,
      'repayment structure',
    );
  const classificationDays =
    Number(
      body.currentClassificationDays ??
      365,
    );

  if (
    !Number.isInteger(
      classificationDays,
    ) ||
    classificationDays <
      1 ||
    classificationDays >
      730
  ) {
    throw new AccountingInputError(
      'Current-classification days must be between 1 and 730.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const checks:
      Array<
        [
          string |
          null,
          string,
          'asset' |
          'liability' |
          'expense' |
          'income',
        ]
      > = [
      [
        mappings.borrowingPrincipal,
        'Default borrowing principal account',
        'liability',
      ],
      [
        mappings.currentBorrowing,
        'Default current borrowing account',
        'liability',
      ],
      [
        mappings.lendingPrincipal,
        'Default lending principal account',
        'asset',
      ],
      [
        mappings.currentLending,
        'Default current lending account',
        'asset',
      ],
      [
        mappings.interestExpense,
        'Default interest expense account',
        'expense',
      ],
      [
        mappings.interestIncome,
        'Default interest income account',
        'income',
      ],
      [
        mappings.accruedInterestLiability,
        'Default accrued-interest liability account',
        'liability',
      ],
      [
        mappings.accruedInterestAsset,
        'Default accrued-interest asset account',
        'asset',
      ],
      [
        mappings.feeExpense,
        'Default financing fee expense account',
        'expense',
      ],
      [
        mappings.feeIncome,
        'Default financing fee income account',
        'income',
      ],
    ];

    for (
      const [
        id,
        label,
        role,
      ]
      of checks
    ) {
      if (
        id
      ) {
        await financingAccount(
          client,
          context.companyId,
          id,
          label,
          role,
        );
      }
    }

    await client.query(
      `
        INSERT INTO accounting_financing_settings (
          company_id,
          enabled,
          default_borrowing_principal_account_id,
          default_current_borrowing_account_id,
          default_lending_principal_account_id,
          default_current_lending_account_id,
          default_interest_expense_account_id,
          default_interest_income_account_id,
          default_accrued_interest_liability_account_id,
          default_accrued_interest_asset_account_id,
          default_financing_fee_expense_account_id,
          default_financing_fee_income_account_id,
          default_day_count,
          default_repayment_structure,
          current_classification_days,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$16
        )
        ON CONFLICT (company_id)
        DO UPDATE
        SET
          enabled =
            EXCLUDED.enabled,
          default_borrowing_principal_account_id =
            EXCLUDED.default_borrowing_principal_account_id,
          default_current_borrowing_account_id =
            EXCLUDED.default_current_borrowing_account_id,
          default_lending_principal_account_id =
            EXCLUDED.default_lending_principal_account_id,
          default_current_lending_account_id =
            EXCLUDED.default_current_lending_account_id,
          default_interest_expense_account_id =
            EXCLUDED.default_interest_expense_account_id,
          default_interest_income_account_id =
            EXCLUDED.default_interest_income_account_id,
          default_accrued_interest_liability_account_id =
            EXCLUDED.default_accrued_interest_liability_account_id,
          default_accrued_interest_asset_account_id =
            EXCLUDED.default_accrued_interest_asset_account_id,
          default_financing_fee_expense_account_id =
            EXCLUDED.default_financing_fee_expense_account_id,
          default_financing_fee_income_account_id =
            EXCLUDED.default_financing_fee_income_account_id,
          default_day_count =
            EXCLUDED.default_day_count,
          default_repayment_structure =
            EXCLUDED.default_repayment_structure,
          current_classification_days =
            EXCLUDED.current_classification_days,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW(),
          deleted_at =
            NULL
      `,
      [
        context.companyId,
        financingBool(
          body.enabled,
          true,
        ),
        mappings.borrowingPrincipal,
        mappings.currentBorrowing,
        mappings.lendingPrincipal,
        mappings.currentLending,
        mappings.interestExpense,
        mappings.interestIncome,
        mappings.accruedInterestLiability,
        mappings.accruedInterestAsset,
        mappings.feeExpense,
        mappings.feeIncome,
        dayCount,
        repayment,
        classificationDays,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'settings.saved',
      'accounting_financing_settings',
      context.companyId,
      'Loans and financing settings saved',
    );

    return {
      saved:
        true,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function createFinancingFacility(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_facilities',
      'create',
    );
  const body =
    financingBody(
      input,
    );
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const direction =
    financingDirection(
      body.direction,
    );
  const facilityType =
    financingChoice(
      body.facilityType ||
      'term_loan',
      FACILITY_TYPES,
      'facility type',
    );
  const name =
    financingText(
      body.name,
      255,
      'Facility name',
      true,
    );
  const counterpartyName =
    financingText(
      body.counterpartyName,
      255,
      'Counterparty',
      true,
    );
  const currency =
    financingCurrency(
      body.currency ||
      context.company
        .currentCompany
        .currency,
    );
  const principalLimit =
    financingPositiveUnits(
      body.principalLimit,
      'Principal limit',
    );
  const startDate =
    accountingDate(
      body.startDate,
    );
  const maturityDate =
    accountingDate(
      body.maturityDate,
    );

  if (
    maturityDate <
    startDate
  ) {
    throw new AccountingInputError(
      'Facility maturity cannot be before its start date.',
    );
  }

  const rateType =
    financingChoice(
      body.rateType ||
      'fixed',
      [
        'fixed',
        'variable',
      ] as const,
      'rate type',
    );
  const fixedRate =
    rateType ===
      'fixed'
      ? financingRate(
          body.annualRate,
        )
      : null;
  const referenceRateName =
    rateType ===
      'variable'
      ? financingText(
          body.referenceRateName,
          120,
          'Reference rate',
          true,
        )
      : null;
  const marginScaled =
    financingSignedRateScaled(
      body.marginRate ??
      '0',
      'Margin rate',
    );
  const marginRate =
    financingRateDecimal(
      marginScaled,
    );
  const initialReferenceRate =
    rateType ===
        'variable' &&
      body.initialReferenceRate !=
        null &&
      body.initialReferenceRate !==
        ''
      ? financingRate(
          body.initialReferenceRate,
          'Initial reference rate',
        )
      : null;
  const dayCount =
    financingChoice(
      body.dayCount ||
      'actual_365',
      DAY_COUNTS,
      'day-count convention',
    );
  const repaymentStructure =
    financingChoice(
      body.repaymentStructure ||
      'annuity',
      REPAYMENT_STRUCTURES,
      'repayment structure',
    );
  const paymentFrequency =
    financingChoice(
      body.paymentFrequency ||
      'monthly',
      PAYMENT_FREQUENCIES,
      'payment frequency',
    );
  const notes =
    financingText(
      body.notes,
      4000,
      'Notes',
    );
  const counterpartyReference =
    financingText(
      body.counterpartyReference,
      160,
      'Counterparty reference',
    );

  if (
    repaymentStructure ===
      'custom' &&
    paymentFrequency !==
      'custom'
  ) {
    throw new AccountingInputError(
      'Custom repayment structures must use custom payment frequency.',
    );
  }

  if (
    paymentFrequency ===
      'custom' &&
    repaymentStructure !==
      'custom'
  ) {
    throw new AccountingInputError(
      'Custom payment frequency requires a custom repayment structure.',
    );
  }

  const requestHash =
    hashPayload({
      direction,
      facilityType,
      name,
      counterpartyName,
      counterpartyReference,
      currency,
      principalLimit:
        financingForeignDecimal(
          principalLimit,
        ),
      startDate,
      maturityDate,
      rateType,
      fixedRate,
      referenceRateName,
      marginRate,
      initialReferenceRate,
      dayCount,
      repaymentStructure,
      paymentFrequency,
      principalAccountId:
        body.principalAccountId ||
        null,
      currentPrincipalAccountId:
        body.currentPrincipalAccountId ||
        null,
      interestAccountId:
        body.interestAccountId ||
        null,
      accruedInterestAccountId:
        body.accruedInterestAccountId ||
        null,
      feeAccountId:
        body.feeAccountId ||
        null,
      notes,
    });

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        context.companyId +
        ':financing-facility:' +
        requestKey,
      ],
    );

    const replay =
      await client.query(
        `
          SELECT
            id::text,
            facility_number,
            request_hash
          FROM accounting_financing_facilities
          WHERE company_id =
                $1
            AND request_key =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE
        `,
        [
          context.companyId,
          requestKey,
        ],
      );

    if (
      replay.rows[0]
    ) {
      if (
        String(
          replay.rows[0]
            .request_hash,
        ) !==
        requestHash
      ) {
        throw new AccountingInputError(
          'This request key was already used for different financing data.',
        );
      }

      await client.query(
        'COMMIT',
      );

      return {
        id:
          String(
            replay.rows[0].id,
          ),
        facilityNumber:
          String(
            replay.rows[0]
              .facility_number,
          ),
        replayed:
          true,
      };
    }

    const settings =
      await financingSettingsForUpdate(
        client,
        context.companyId,
      );

    if (
      settings &&
      settings.enabled ===
        false
    ) {
      throw new AccountingInputError(
        'Enable Loans and Financing before creating a facility.',
      );
    }

    const keys =
      defaultAccountKeys(
        direction,
      );
    const roles =
      accountRoles(
        direction,
      );

    const principalAccountId =
      financingOptionalId(
        body.principalAccountId,
      ) ||
      settingsAccount(
        settings,
        keys.principal,
      );
    const currentPrincipalAccountId =
      financingOptionalId(
        body.currentPrincipalAccountId,
      ) ||
      settingsAccount(
        settings,
        keys.currentPrincipal,
      );
    const interestAccountId =
      financingOptionalId(
        body.interestAccountId,
      ) ||
      settingsAccount(
        settings,
        keys.interest,
      );
    const accruedInterestAccountId =
      financingOptionalId(
        body.accruedInterestAccountId,
      ) ||
      settingsAccount(
        settings,
        keys.accruedInterest,
      );
    const feeAccountId =
      financingOptionalId(
        body.feeAccountId,
      ) ||
      settingsAccount(
        settings,
        keys.fee,
      );

    if (
      !principalAccountId ||
      !interestAccountId ||
      !accruedInterestAccountId
    ) {
      throw new AccountingInputError(
        'Map principal, interest and accrued-interest accounts for this financing direction before creating the facility.',
      );
    }

    const accountChecks:
      Array<
        [
          string |
          null,
          string,
          'asset' |
          'liability' |
          'expense' |
          'income',
        ]
      > = [
      [
        principalAccountId,
        'Principal account',
        roles.principal,
      ],
      [
        currentPrincipalAccountId,
        'Current principal account',
        roles.currentPrincipal,
      ],
      [
        interestAccountId,
        'Interest account',
        roles.interest,
      ],
      [
        accruedInterestAccountId,
        'Accrued-interest account',
        roles.accruedInterest,
      ],
      [
        feeAccountId,
        'Financing fee account',
        roles.fee,
      ],
    ];

    for (
      const [
        id,
        label,
        role,
      ]
      of accountChecks
    ) {
      if (
        id
      ) {
        await financingAccount(
          client,
          context.companyId,
          id,
          label,
          role,
        );
      }
    }

    const id =
      randomUUID();
    const facilityNumber =
      (
        direction ===
          'borrowing'
          ? 'BOR-'
          : 'LND-'
      ) +
      startDate.slice(
        0,
        4,
      ) +
      '-' +
      id.slice(
        0,
        8,
      ).toUpperCase();

    await client.query(
      `
        INSERT INTO accounting_financing_facilities (
          id,
          company_id,
          facility_number,
          name,
          direction,
          facility_type,
          counterparty_name,
          counterparty_reference,
          currency,
          principal_limit,
          start_date,
          maturity_date,
          rate_type,
          annual_rate,
          reference_rate_name,
          margin_rate,
          day_count,
          repayment_structure,
          payment_frequency,
          principal_account_id,
          current_principal_account_id,
          interest_account_id,
          accrued_interest_account_id,
          fee_account_id,
          request_key,
          request_hash,
          notes,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$28
        )
      `,
      [
        id,
        context.companyId,
        facilityNumber,
        name,
        direction,
        facilityType,
        counterpartyName,
        counterpartyReference ||
          null,
        currency,
        financingForeignDecimal(
          principalLimit,
        ),
        startDate,
        maturityDate,
        rateType,
        fixedRate,
        referenceRateName,
        marginRate,
        dayCount,
        repaymentStructure,
        paymentFrequency,
        principalAccountId,
        currentPrincipalAccountId,
        interestAccountId,
        accruedInterestAccountId,
        feeAccountId,
        requestKey,
        requestHash,
        notes ||
          null,
        context.userId,
      ],
    );

    if (
      rateType ===
        'variable' &&
      initialReferenceRate
    ) {
      const effectiveRateScaled =
        financingRateScaled(
          initialReferenceRate,
        ) +
        marginScaled;

      if (
        effectiveRateScaled <
        BigInt(
          0,
        )
      ) {
        throw new AccountingInputError(
          'Initial effective annual rate cannot be negative.',
        );
      }

      const effectiveRate =
        financingRateDecimal(
          effectiveRateScaled,
        );

      await client.query(
        `
          INSERT INTO accounting_financing_rate_periods (
            company_id,
            facility_id,
            effective_date,
            reference_rate,
            margin_rate,
            effective_annual_rate,
            source,
            request_key,
            request_hash,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,'facility_creation',$7,$8,$9,$9
          )
        `,
        [
          context.companyId,
          id,
          startDate,
          initialReferenceRate,
          marginRate,
          effectiveRate,
          randomUUID(),
          hashPayload({
            id,
            startDate,
            initialReferenceRate,
            marginRate,
            effectiveRate,
          }),
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'facility.created',
      'accounting_financing_facilities',
      id,
      'Financing facility created',
      {
        facilityNumber,
        direction,
        currency,
        principalLimit:
          financingForeignDecimal(
            principalLimit,
          ),
      },
    );

    return {
      id,
      facilityNumber,
      replayed:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function activateFinancingFacility(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_facilities',
      'edit',
    );
  const body =
    financingBody(
      input,
    );
  const facilityId =
    accountingId(
      body.facilityId,
    );
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const settings =
      await financingSettingsForUpdate(
        client,
        context.companyId,
      );

    if (
      settings &&
      settings.enabled ===
        false
    ) {
      throw new AccountingInputError(
        'Enable Loans and Financing before activating a facility.',
      );
    }

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        facilityId,
      );

    if (
      facility.status ===
        'active' &&
      facility
        .repayment_structure !==
        'custom'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          facilityId,
        replayed:
          true,
      };
    }

    if (
      facility.status !==
        'draft'
    ) {
      throw new AccountingInputError(
        'Only a draft financing facility can be activated.',
      );
    }

    await financingEffectiveRate(
      client,
      facility,
      String(
        facility.start_date,
      ).slice(
        0,
        10,
      ),
    );

    let schedule = {
      revision:
        Number(
          facility
            .schedule_revision ||
          1,
        ),
      periods:
        0,
    };

    if (
      facility
        .repayment_structure ===
        'custom'
    ) {
      schedule = {
        revision:
          Number(
            facility
              .schedule_revision ||
            1,
          ),
        periods:
          0,
      };
    } else {
      const principal =
        financingPositiveUnits(
          facility.principal_limit,
          'Principal limit',
        );

      schedule =
        await rebuildFinancingSchedule(
          client,
          {
            companyId:
              context.companyId,
            userId:
              context.userId,
            facility,
            principalUnits:
              principal,
            startDate:
              String(
                facility.start_date,
              ).slice(
                0,
                10,
              ),
          },
        );
    }

    await client.query(
      `
        UPDATE accounting_financing_facilities
        SET
          status =
            'active',
          activated_at =
            NOW(),
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        facilityId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'facility.activated',
      'accounting_financing_facilities',
      facilityId,
      'Financing facility activated',
      {
        revision:
          schedule.revision,
        periods:
          schedule.periods,
      },
    );

    return {
      id:
        facilityId,
      revision:
        schedule.revision,
      periods:
        schedule.periods,
      replayed:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function addFinancingRatePeriod(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_rate_periods',
      'edit',
    );
  const body =
    financingBody(
      input,
    );
  const facilityId =
    accountingId(
      body.facilityId,
    );
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const effectiveDate =
    accountingDate(
      body.effectiveDate,
    );
  const referenceRate =
    financingRate(
      body.referenceRate,
      'Reference rate',
    );
  const marginScaled =
    financingSignedRateScaled(
      body.marginRate ??
      '0',
      'Margin rate',
    );
  const marginRate =
    financingRateDecimal(
      marginScaled,
    );
  const effectiveRateScaled =
    financingRateScaled(
      referenceRate,
    ) +
    marginScaled;

  if (
    effectiveRateScaled <
    BigInt(
      0,
    )
  ) {
    throw new AccountingInputError(
      'Effective annual rate cannot be negative.',
    );
  }

  const effectiveRate =
    financingRateDecimal(
      effectiveRateScaled,
    );
  const source =
    financingText(
      body.source,
      120,
      'Rate source',
    );
  const externalReference =
    financingText(
      body.externalReference,
      255,
      'External rate reference',
    );
  const requestHash =
    hashPayload({
      facilityId,
      effectiveDate,
      referenceRate,
      marginRate,
      effectiveRate,
      source,
      externalReference,
    });
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        context.companyId +
        ':financing-rate:' +
        facilityId +
        ':' +
        requestKey,
      ],
    );

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        facilityId,
      );

    if (
      facility.rate_type !==
        'variable'
    ) {
      throw new AccountingInputError(
        'Rate periods are only used by variable-rate facilities.',
      );
    }

    if (
      effectiveDate <
        String(
          facility.start_date,
        ).slice(
          0,
          10,
        ) ||
      effectiveDate >
        String(
          facility.maturity_date,
        ).slice(
          0,
          10,
        )
    ) {
      throw new AccountingInputError(
        'The rate effective date must fall within the facility term.',
      );
    }

    const replay =
      await client.query(
        `
          SELECT
            id::text,
            request_hash
          FROM accounting_financing_rate_periods
          WHERE company_id =
                $1
            AND facility_id =
                $2
            AND request_key =
                $3
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE
        `,
        [
          context.companyId,
          facilityId,
          requestKey,
        ],
      );

    if (
      replay.rows[0]
    ) {
      if (
        String(
          replay.rows[0]
            .request_hash,
        ) !==
        requestHash
      ) {
        throw new AccountingInputError(
          'This rate request key was already used with different values.',
        );
      }

      await client.query(
        'COMMIT',
      );

      return {
        id:
          String(
            replay.rows[0].id,
          ),
        replayed:
          true,
      };
    }

    await client.query(
      `
        UPDATE accounting_financing_rate_periods
        SET
          status =
            'superseded',
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND facility_id =
              $2
          AND effective_date =
              $3::date
          AND deleted_at
              IS NULL
          AND status =
              'active'
      `,
      [
        context.companyId,
        facilityId,
        effectiveDate,
        context.userId,
      ],
    );

    const id =
      randomUUID();

    await client.query(
      `
        INSERT INTO accounting_financing_rate_periods (
          id,
          company_id,
          facility_id,
          effective_date,
          reference_rate,
          margin_rate,
          effective_annual_rate,
          source,
          external_reference,
          request_key,
          request_hash,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12
        )
      `,
      [
        id,
        context.companyId,
        facilityId,
        effectiveDate,
        referenceRate,
        marginRate,
        effectiveRate,
        source ||
          null,
        externalReference ||
          null,
        requestKey,
        requestHash,
        context.userId,
      ],
    );

    if (
      facility.status ===
        'active'
    ) {
      const outstanding =
        await financingOutstandingPrincipalUnits(
          client,
          context.companyId,
          facilityId,
          effectiveDate,
        );

      await rebuildFinancingSchedule(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          facility,
          principalUnits:
            outstanding >
              BigInt(
                0,
              )
              ? outstanding
              : financingPositiveUnits(
                  facility.principal_limit,
                  'Principal limit',
                ),
          startDate:
            effectiveDate,
        },
      );
    }

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'rate.added',
      'accounting_financing_rate_periods',
      id,
      'Variable financing rate added',
      {
        facilityId,
        effectiveDate,
        effectiveRate,
      },
    );

    return {
      id,
      effectiveRate,
      replayed:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

function transactionJournalLines(
  input: {
    direction:
      FinancingDirection;
    kind:
      'drawdown' |
      'repayment';
    financialLedgerAccountId:
      string;
    principalAccountId:
      string;
    accruedInterestAccountId:
      string;
    feeAccountId:
      string |
      null;
    principalBase:
      string;
    interestBase:
      string;
    feeBase:
      string;
    totalBase:
      string;
  },
) {
  if (
    input.kind ===
      'drawdown'
  ) {
    return input.direction ===
        'borrowing'
      ? [
          {
            accountId:
              input.financialLedgerAccountId,
            description:
              'Financing drawdown received',
            debit:
              input.totalBase,
            credit:
              '0.00',
          },
          {
            accountId:
              input.principalAccountId,
            description:
              'Borrowing principal',
            debit:
              '0.00',
            credit:
              input.principalBase,
          },
        ]
      : [
          {
            accountId:
              input.principalAccountId,
            description:
              'Loan principal advanced',
            debit:
              input.principalBase,
            credit:
              '0.00',
          },
          {
            accountId:
              input.financialLedgerAccountId,
            description:
              'Loan drawdown funded',
            debit:
              '0.00',
            credit:
              input.totalBase,
          },
        ];
  }

  const lines:
    Array<{
      accountId:
        string;
      description:
        string;
      debit:
        string;
      credit:
        string;
    }> = [];

  if (
    input.direction ===
      'borrowing'
  ) {
    if (
      input.principalBase !==
        '0.00'
    ) {
      lines.push({
        accountId:
          input.principalAccountId,
        description:
          'Borrowing principal repaid',
        debit:
          input.principalBase,
        credit:
          '0.00',
      });
    }

    if (
      input.interestBase !==
        '0.00'
    ) {
      lines.push({
        accountId:
          input.accruedInterestAccountId,
        description:
          'Accrued financing interest paid',
        debit:
          input.interestBase,
        credit:
          '0.00',
      });
    }

    if (
      input.feeBase !==
        '0.00' &&
      input.feeAccountId
    ) {
      lines.push({
        accountId:
          input.feeAccountId,
        description:
          'Financing fee paid',
        debit:
          input.feeBase,
        credit:
          '0.00',
      });
    }

    lines.push({
      accountId:
        input.financialLedgerAccountId,
      description:
        'Financing payment',
      debit:
        '0.00',
      credit:
        input.totalBase,
    });

    return lines;
  }

  lines.push({
    accountId:
      input.financialLedgerAccountId,
    description:
      'Loan repayment received',
    debit:
      input.totalBase,
    credit:
      '0.00',
  });

  if (
    input.principalBase !==
      '0.00'
  ) {
    lines.push({
      accountId:
        input.principalAccountId,
      description:
        'Loan principal recovered',
      debit:
        '0.00',
      credit:
        input.principalBase,
    });
  }

  if (
    input.interestBase !==
      '0.00'
  ) {
    lines.push({
      accountId:
        input.accruedInterestAccountId,
      description:
        'Accrued financing interest collected',
      debit:
        '0.00',
      credit:
        input.interestBase,
    });
  }

  if (
    input.feeBase !==
      '0.00' &&
    input.feeAccountId
  ) {
    lines.push({
      accountId:
        input.feeAccountId,
      description:
        'Financing fee income',
      debit:
        '0.00',
      credit:
        input.feeBase,
    });
  }

  return lines;
}

export async function postFinancingDrawdown(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_transactions',
      'create',
    );
  const body =
    financingBody(
      input,
    );
  const facilityId =
    accountingId(
      body.facilityId,
    );
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const transactionDate =
    accountingDate(
      body.transactionDate,
    );
  const financialAccountId =
    accountingId(
      body.financialAccountId,
    );
  const amount =
    financingPositiveUnits(
      body.amount,
      'Drawdown amount',
    );
  const reference =
    financingText(
      body.reference,
      255,
      'Reference',
    );
  const notes =
    financingText(
      body.notes,
      4000,
      'Notes',
    );
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        context.companyId +
        ':financing-transaction:' +
        requestKey,
      ],
    );

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        facilityId,
      );

    if (
      facility.status !==
        'active'
    ) {
      throw new AccountingInputError(
        'Only an active financing facility can receive a drawdown.',
      );
    }

    if (
      transactionDate <
        String(
          facility.start_date,
        ).slice(
          0,
          10,
        ) ||
      transactionDate >
        String(
          facility.maturity_date,
        ).slice(
          0,
          10,
        )
    ) {
      throw new AccountingInputError(
        'Drawdown date must fall within the facility term.',
      );
    }

    const baseCurrency =
      String(
        context.company
          .currentCompany
          .currency,
      ).toUpperCase();
    const facilityCurrency =
      String(
        facility.currency,
      ).toUpperCase();
    const fx =
      await financingRateToBase(
        client,
        {
          companyId:
            context.companyId,
          foreignCurrency:
            facilityCurrency,
          baseCurrency,
          date:
            transactionDate,
          rateType:
            'spot',
        },
      );
    const baseAmount =
      financingBaseAmount(
        amount,
        fx.rate,
      );
    const financial =
      await financingFinancialAccountForUpdate(
        client,
        context.companyId,
        financialAccountId,
      );

    assertFinancingSettlementCurrency(
      financial,
      facilityCurrency,
      baseCurrency,
    );

    if (
      facility.direction ===
        'lending'
    ) {
      assertFinancingFunds(
        financial,
        {
          foreignAmount:
            amount,
          baseAmount,
          facilityCurrency,
          baseCurrency,
        },
      );
    }

    const requestHash =
      hashPayload({
        facilityId,
        transactionDate,
        financialAccountId,
        amount:
          financingForeignDecimal(
            amount,
          ),
        reference,
        notes,
      });

    const replay =
      await client.query(
        `
          SELECT
            id::text,
            request_hash,
            journal_id::text
          FROM accounting_financing_transactions
          WHERE company_id =
                $1
            AND facility_id =
                $2
            AND request_key =
                $3
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE
        `,
        [
          context.companyId,
          facilityId,
          requestKey,
        ],
      );

    if (
      replay.rows[0]
    ) {
      if (
        String(
          replay.rows[0]
            .request_hash,
        ) !==
        requestHash
      ) {
        throw new AccountingInputError(
          'This drawdown request key was already used with different values.',
        );
      }

      await client.query(
        'COMMIT',
      );

      return {
        id:
          String(
            replay.rows[0].id,
          ),
        journalId:
          String(
            replay.rows[0]
              .journal_id,
          ),
        replayed:
          true,
      };
    }

    const outstanding =
      await financingOutstandingPrincipalUnits(
        client,
        context.companyId,
        facilityId,
      );
    const limit =
      financingPositiveUnits(
        facility.principal_limit,
        'Principal limit',
      );

    if (
      outstanding +
        amount >
      limit
    ) {
      throw new AccountingInputError(
        'This drawdown would exceed the facility principal limit.',
      );
    }

    const amountBase =
      decimalAmount(
        baseAmount,
      );
    const journal =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            transactionDate,
          description:
            'Financing drawdown · ' +
            String(
              facility.facility_number,
            ) +
            ' · ' +
            String(
              facility.name,
            ),
          reference:
            reference ||
            String(
              facility.facility_number,
            ),
          sourceModule:
            'accounting',
          sourceType:
            'financing_drawdown',
          sourceId:
            facilityId,
          sourceEventKey:
            'accounting:financing:drawdown:' +
            requestKey,
          postingKind:
            'system',
          lines:
            transactionJournalLines({
              direction:
                String(
                  facility.direction,
                ) as
                  FinancingDirection,
              kind:
                'drawdown',
              financialLedgerAccountId:
                String(
                  financial
                    .ledger_account_id,
                ),
              principalAccountId:
                String(
                  facility
                    .principal_account_id,
                ),
              accruedInterestAccountId:
                String(
                  facility
                    .accrued_interest_account_id,
                ),
              feeAccountId:
                facility
                  .fee_account_id
                  ? String(
                      facility
                        .fee_account_id,
                    )
                  : null,
              principalBase:
                amountBase,
              interestBase:
                '0.00',
              feeBase:
                '0.00',
              totalBase:
                amountBase,
            }),
        },
      );

    const id =
      randomUUID();

    await client.query(
      `
        INSERT INTO accounting_financing_transactions (
          id,
          company_id,
          facility_id,
          transaction_type,
          transaction_date,
          currency,
          foreign_amount,
          base_amount,
          exchange_rate,
          principal_foreign,
          principal_base,
          financial_account_id,
          journal_id,
          request_key,
          request_hash,
          status,
          reference,
          notes,
          metadata,
          posted_at,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,'drawdown',$4,$5,$6,$7,$8,$6,
          $7,$9,$10,$11,$12,'posted',$13,$14,$15::jsonb,
          NOW(),$16,$16
        )
      `,
      [
        id,
        context.companyId,
        facilityId,
        transactionDate,
        facilityCurrency,
        financingForeignDecimal(
          amount,
        ),
        amountBase,
        fx.rate,
        financialAccountId,
        journal.journalId,
        requestKey,
        requestHash,
        reference ||
          null,
        notes ||
          null,
        JSON.stringify({
          fxSourceType:
            fx.sourceType,
          fxSourceName:
            fx.sourceName,
          fxRateDate:
            fx.effectiveDate,
        }),
        context.userId,
      ],
    );

    const accountCurrency =
      String(
        financial.currency,
      ).toUpperCase();
    const bankForeignAmount =
      accountCurrency ===
        baseCurrency
        ? BigInt(
            0,
          )
        : amount;
    const bankBaseAmount =
      facility.direction ===
        'borrowing'
        ? baseAmount
        : -baseAmount;
    const bankForeignSigned =
      facility.direction ===
        'borrowing'
        ? bankForeignAmount
        : -bankForeignAmount;

    await recordFinancingFxMovement(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        bankAccountId:
          financialAccountId,
        baseCurrency,
        accountCurrency,
        sourceType:
          'financing_drawdown',
        sourceId:
          id,
        eventKey:
          'financing-drawdown:' +
          id,
        date:
          transactionDate,
        foreignAmountUnits:
          bankForeignSigned,
        baseAmountCents:
          bankBaseAmount,
        rate:
          fx.rate,
        metadata: {
          facilityId,
          facilityNumber:
            facility.facility_number,
        },
      },
    );

    const newOutstanding =
      outstanding +
      amount;

    if (
      facility
        .repayment_structure !==
        'custom'
    ) {
      if (
        facility
          .repayment_structure !==
          'custom'
      ) {
        await rebuildFinancingSchedule(
          client,
          {
            companyId:
              context.companyId,
            userId:
              context.userId,
            facility,
            principalUnits:
              newOutstanding,
            startDate:
              transactionDate,
          },
        );
      }
    }

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'drawdown.posted',
      'accounting_financing_transactions',
      id,
      'Financing drawdown posted',
      {
        facilityId,
        journalId:
          journal.journalId,
        foreignAmount:
          financingForeignDecimal(
            amount,
          ),
        baseAmount:
          amountBase,
        currency:
          facilityCurrency,
      },
    );

    return {
      id,
      journalId:
        journal.journalId,
      replayed:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}


export async function postFinancingRepayment(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_transactions',
      'create',
    );
  const body =
    financingBody(
      input,
    );
  const facilityId =
    accountingId(
      body.facilityId,
    );
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const transactionDate =
    accountingDate(
      body.transactionDate,
    );
  const financialAccountId =
    accountingId(
      body.financialAccountId,
    );
  const principal =
    body.principalAmount ===
        undefined ||
      body.principalAmount ===
        null ||
      body.principalAmount ===
        ''
      ? BigInt(
          0,
        )
      : financingPositiveUnits(
          body.principalAmount,
          'Principal repayment',
        );
  const interest =
    body.interestAmount ===
        undefined ||
      body.interestAmount ===
        null ||
      body.interestAmount ===
        ''
      ? BigInt(
          0,
        )
      : financingPositiveUnits(
          body.interestAmount,
          'Interest payment',
        );
  const fee =
    body.feeAmount ===
        undefined ||
      body.feeAmount ===
        null ||
      body.feeAmount ===
        ''
      ? BigInt(
          0,
        )
      : financingPositiveUnits(
          body.feeAmount,
          'Financing fee',
        );

  if (
    principal ===
      BigInt(
        0,
      ) &&
    interest ===
      BigInt(
        0,
      ) &&
    fee ===
      BigInt(
        0,
      )
  ) {
    throw new AccountingInputError(
      'Enter principal, interest or a financing fee to post.',
    );
  }

  const reference =
    financingText(
      body.reference,
      255,
      'Reference',
    );
  const notes =
    financingText(
      body.notes,
      4000,
      'Notes',
    );
  const requestHash =
    hashPayload({
      facilityId,
      transactionDate,
      financialAccountId,
      principal:
        principal ===
          BigInt(
            0,
          )
          ? '0.0000'
          : financingForeignDecimal(
              principal,
            ),
      interest:
        interest ===
          BigInt(
            0,
          )
          ? '0.0000'
          : financingForeignDecimal(
              interest,
            ),
      fee:
        fee ===
          BigInt(
            0,
          )
          ? '0.0000'
          : financingForeignDecimal(
              fee,
            ),
      reference,
      notes,
    });
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        context.companyId +
        ':financing-transaction:' +
        requestKey,
      ],
    );

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        facilityId,
      );

    if (
      facility.status !==
        'active'
    ) {
      throw new AccountingInputError(
        'Only an active financing facility can receive a repayment.',
      );
    }

    const replay =
      await client.query(
        `
          SELECT
            id::text,
            request_hash,
            journal_id::text
          FROM accounting_financing_transactions
          WHERE company_id =
                $1
            AND facility_id =
                $2
            AND request_key =
                $3
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE
        `,
        [
          context.companyId,
          facilityId,
          requestKey,
        ],
      );

    if (
      replay.rows[0]
    ) {
      if (
        String(
          replay.rows[0]
            .request_hash,
        ) !==
        requestHash
      ) {
        throw new AccountingInputError(
          'This repayment request key was already used with different values.',
        );
      }

      await client.query(
        'COMMIT',
      );

      return {
        id:
          String(
            replay.rows[0].id,
          ),
        journalId:
          String(
            replay.rows[0]
              .journal_id,
          ),
        replayed:
          true,
      };
    }

    if (
      transactionDate <
        String(
          facility.start_date,
        ).slice(
          0,
          10,
        )
    ) {
      throw new AccountingInputError(
        'Repayment date cannot be before the facility start date.',
      );
    }

    const outstandingPrincipal =
      await financingOutstandingPrincipalUnits(
        client,
        context.companyId,
        facilityId,
      );
    const outstandingInterest =
      await financingOutstandingInterestUnits(
        client,
        context.companyId,
        facilityId,
      );

    if (
      principal >
      outstandingPrincipal
    ) {
      throw new AccountingInputError(
        'Principal repayment exceeds the outstanding financing principal.',
      );
    }

    if (
      interest >
      outstandingInterest
    ) {
      throw new AccountingInputError(
        'Interest payment exceeds posted accrued interest. Run interest accrual first or reduce the payment.',
      );
    }

    if (
      fee >
        BigInt(
          0,
        ) &&
      !facility
        .fee_account_id
    ) {
      throw new AccountingInputError(
        'Map a financing fee account before posting a fee.',
      );
    }

    const baseCurrency =
      String(
        context.company
          .currentCompany
          .currency,
      ).toUpperCase();
    const facilityCurrency =
      String(
        facility.currency,
      ).toUpperCase();
    const fx =
      await financingRateToBase(
        client,
        {
          companyId:
            context.companyId,
          foreignCurrency:
            facilityCurrency,
          baseCurrency,
          date:
            transactionDate,
          rateType:
            'spot',
        },
      );
    const principalBase =
      principal ===
        BigInt(
          0,
        )
        ? BigInt(
            0,
          )
        : financingBaseAmount(
            principal,
            fx.rate,
          );
    const interestBase =
      interest ===
        BigInt(
          0,
        )
        ? BigInt(
            0,
          )
        : financingBaseAmount(
            interest,
            fx.rate,
          );
    const feeBase =
      fee ===
        BigInt(
          0,
        )
        ? BigInt(
            0,
          )
        : financingBaseAmount(
            fee,
            fx.rate,
          );
    const total =
      principal +
      interest +
      fee;
    const totalBase =
      principalBase +
      interestBase +
      feeBase;
    const financial =
      await financingFinancialAccountForUpdate(
        client,
        context.companyId,
        financialAccountId,
      );

    assertFinancingSettlementCurrency(
      financial,
      facilityCurrency,
      baseCurrency,
    );

    if (
      facility.direction ===
        'borrowing'
    ) {
      assertFinancingFunds(
        financial,
        {
          foreignAmount:
            total,
          baseAmount:
            totalBase,
          facilityCurrency,
          baseCurrency,
        },
      );
    }

    const journal =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            transactionDate,
          description:
            'Financing repayment · ' +
            String(
              facility.facility_number,
            ) +
            ' · ' +
            String(
              facility.name,
            ),
          reference:
            reference ||
            String(
              facility.facility_number,
            ),
          sourceModule:
            'accounting',
          sourceType:
            'financing_repayment',
          sourceId:
            facilityId,
          sourceEventKey:
            'accounting:financing:repayment:' +
            requestKey,
          postingKind:
            'system',
          lines:
            transactionJournalLines({
              direction:
                String(
                  facility.direction,
                ) as
                  FinancingDirection,
              kind:
                'repayment',
              financialLedgerAccountId:
                String(
                  financial
                    .ledger_account_id,
                ),
              principalAccountId:
                String(
                  facility
                    .principal_account_id,
                ),
              accruedInterestAccountId:
                String(
                  facility
                    .accrued_interest_account_id,
                ),
              feeAccountId:
                facility
                  .fee_account_id
                  ? String(
                      facility
                        .fee_account_id,
                    )
                  : null,
              principalBase:
                decimalAmount(
                  principalBase,
                ),
              interestBase:
                decimalAmount(
                  interestBase,
                ),
              feeBase:
                decimalAmount(
                  feeBase,
                ),
              totalBase:
                decimalAmount(
                  totalBase,
                ),
            }),
        },
      );

    const id =
      randomUUID();
    const transactionType =
      principal >
        BigInt(
          0,
        )
        ? 'principal_repayment'
        : interest >
            BigInt(
              0,
            )
          ? 'interest_payment'
          : 'fee_payment';

    await client.query(
      `
        INSERT INTO accounting_financing_transactions (
          id,
          company_id,
          facility_id,
          transaction_type,
          transaction_date,
          currency,
          foreign_amount,
          base_amount,
          exchange_rate,
          principal_foreign,
          principal_base,
          interest_foreign,
          interest_base,
          fee_foreign,
          fee_base,
          financial_account_id,
          journal_id,
          request_key,
          request_hash,
          status,
          reference,
          notes,
          metadata,
          posted_at,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,'posted',
          $20,$21,$22::jsonb,NOW(),$23,$23
        )
      `,
      [
        id,
        context.companyId,
        facilityId,
        transactionType,
        transactionDate,
        facilityCurrency,
        financingForeignDecimal(
          total,
        ),
        decimalAmount(
          totalBase,
        ),
        fx.rate,
        principal ===
          BigInt(
            0,
          )
          ? '0.0000'
          : financingForeignDecimal(
              principal,
            ),
        decimalAmount(
          principalBase,
        ),
        interest ===
          BigInt(
            0,
          )
          ? '0.0000'
          : financingForeignDecimal(
              interest,
            ),
        decimalAmount(
          interestBase,
        ),
        fee ===
          BigInt(
            0,
          )
          ? '0.0000'
          : financingForeignDecimal(
              fee,
            ),
        decimalAmount(
          feeBase,
        ),
        financialAccountId,
        journal.journalId,
        requestKey,
        requestHash,
        reference ||
          null,
        notes ||
          null,
        JSON.stringify({
          fxSourceType:
            fx.sourceType,
          fxSourceName:
            fx.sourceName,
          fxRateDate:
            fx.effectiveDate,
        }),
        context.userId,
      ],
    );

    const accountCurrency =
      String(
        financial.currency,
      ).toUpperCase();
    const bankForeign =
      accountCurrency ===
        baseCurrency
        ? BigInt(
            0,
          )
        : total;
    const incoming =
      facility.direction ===
        'lending';

    await recordFinancingFxMovement(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        bankAccountId:
          financialAccountId,
        baseCurrency,
        accountCurrency,
        sourceType:
          'financing_repayment',
        sourceId:
          id,
        eventKey:
          'financing-repayment:' +
          id,
        date:
          transactionDate,
        foreignAmountUnits:
          incoming
            ? bankForeign
            : -bankForeign,
        baseAmountCents:
          incoming
            ? totalBase
            : -totalBase,
        rate:
          fx.rate,
        metadata: {
          facilityId,
          facilityNumber:
            facility.facility_number,
        },
      },
    );

    if (
      principal >
      BigInt(
        0,
      )
    ) {
      const newOutstanding =
        outstandingPrincipal -
        principal;

      await rebuildFinancingSchedule(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          facility,
          principalUnits:
            newOutstanding,
          startDate:
            transactionDate,
        },
      );
    }

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'repayment.posted',
      'accounting_financing_transactions',
      id,
      'Financing repayment posted',
      {
        facilityId,
        journalId:
          journal.journalId,
        principal:
          principal ===
            BigInt(
              0,
            )
            ? '0.0000'
            : financingForeignDecimal(
                principal,
              ),
        interest:
          interest ===
            BigInt(
              0,
            )
            ? '0.0000'
            : financingForeignDecimal(
                interest,
              ),
        fee:
          fee ===
            BigInt(
              0,
            )
            ? '0.0000'
            : financingForeignDecimal(
                fee,
              ),
      },
    );

    return {
      id,
      journalId:
        journal.journalId,
      replayed:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

function interestJournalLines(
  facility:
    FinancingFacilityRow,
  baseAmount:
    string,
) {
  return facility.direction ===
      'borrowing'
    ? [
        {
          accountId:
            String(
              facility
                .interest_account_id,
            ),
          description:
            'Financing interest expense',
          debit:
            baseAmount,
          credit:
            '0.00',
        },
        {
          accountId:
            String(
              facility
                .accrued_interest_account_id,
            ),
          description:
            'Accrued financing interest',
          debit:
            '0.00',
          credit:
            baseAmount,
        },
      ]
    : [
        {
          accountId:
            String(
              facility
                .accrued_interest_account_id,
            ),
          description:
            'Accrued loan interest receivable',
          debit:
            baseAmount,
          credit:
            '0.00',
        },
        {
          accountId:
            String(
              facility
                .interest_account_id,
            ),
          description:
            'Financing interest income',
          debit:
            '0.00',
          credit:
            baseAmount,
        },
      ];
}

export async function runFinancingInterestAccrual(
  input:
    unknown = {},
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_runs',
      'edit',
    );
  const body =
    financingBody(
      input,
    );
  const asOf =
    accountingDate(
      body.asOf ||
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        ),
    );
  const client =
    await context.pool.connect();
  let runId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const settings =
      await financingSettingsForUpdate(
        client,
        context.companyId,
      );

    if (
      settings &&
      settings.enabled ===
        false
    ) {
      throw new AccountingInputError(
        'Enable Loans and Financing before running interest accrual.',
      );
    }

    const created =
      await client.query(
        `
          INSERT INTO accounting_financing_runs (
            company_id,
            as_of_date,
            generated_by,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$3,$3
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          asOf,
          context.userId,
        ],
      );
    runId =
      String(
        created.rows[0].id,
      );

    const facilities =
      await client.query(
        `
          SELECT *
          FROM accounting_financing_facilities
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
            AND status =
                'active'
            AND start_date <
                $2::date
          ORDER BY
            facility_number,
            id
          FOR UPDATE
          SKIP LOCKED
        `,
        [
          context.companyId,
          asOf,
        ],
      );

    let accrued =
      0;
    let skipped =
      0;
    let failed =
      0;

    for (
      const facility
      of facilities.rows
    ) {
      const savepoint =
        'fin_accrual_' +
        String(
          facility.id,
        ).replace(
          /-/g,
          '',
        ).slice(
          0,
          12,
        );

      await client.query(
        'SAVEPOINT ' +
        savepoint,
      );

      try {
        const firstDrawdown =
          await client.query(
            `
              SELECT MIN(
                transaction_date
              )::text
                AS first_drawdown
              FROM accounting_financing_transactions
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND deleted_at
                    IS NULL
                AND status =
                    'posted'
                AND transaction_type =
                    'drawdown'
            `,
            [
              context.companyId,
              facility.id,
            ],
          );
        const firstDate =
          firstDrawdown
            .rows[0]
            ?.first_drawdown
            ? String(
                firstDrawdown
                  .rows[0]
                  .first_drawdown,
              ).slice(
                0,
                10,
              )
            : null;

        if (
          !firstDate ||
          firstDate >=
            asOf
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const lastAccrual =
          await client.query(
            `
              SELECT MAX(
                period_end
              )::text
                AS last_end
              FROM accounting_financing_interest_accruals
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND deleted_at
                    IS NULL
                AND status =
                    'posted'
            `,
            [
              context.companyId,
              facility.id,
            ],
          );
        const startDate =
          lastAccrual
            .rows[0]
            ?.last_end
            ? String(
                lastAccrual
                  .rows[0]
                  .last_end,
              ).slice(
                0,
                10,
              )
            : firstDate;

        if (
          startDate >=
          asOf
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const duplicate =
          await client.query(
            `
              SELECT id::text
              FROM accounting_financing_interest_accruals
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND period_start =
                    $3::date
                AND period_end =
                    $4::date
                AND deleted_at
                    IS NULL
                AND status =
                    'posted'
              LIMIT 1
            `,
            [
              context.companyId,
              facility.id,
              startDate,
              asOf,
            ],
          );

        if (
          duplicate.rows[0]
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const calculation =
          await calculateFinancingInterest(
            client,
            {
              companyId:
                context.companyId,
              facility,
              startDate,
              endDate:
                asOf,
            },
          );

        if (
          calculation
            .interestUnits <=
          BigInt(
            0,
          )
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const baseCurrency =
          String(
            context.company
              .currentCompany
              .currency,
          ).toUpperCase();
        const facilityCurrency =
          String(
            facility.currency,
          ).toUpperCase();
        const fx =
          await financingRateToBase(
            client,
            {
              companyId:
                context.companyId,
              foreignCurrency:
                facilityCurrency,
              baseCurrency,
              date:
                asOf,
              rateType:
                'spot',
            },
          );
        const baseInterest =
          financingBaseAmount(
            calculation
              .interestUnits,
            fx.rate,
          );
        const baseInterestText =
          decimalAmount(
            baseInterest,
          );
        const sourceKey =
          'accounting:financing:interest:' +
          String(
            facility.id,
          ) +
          ':' +
          startDate +
          ':' +
          asOf;
        const journal =
          await postBalancedLedgerJournal(
            client,
            {
              companyId:
                context.companyId,
              userId:
                context.userId,
              journalDate:
                asOf,
              description:
                'Financing interest accrual · ' +
                String(
                  facility
                    .facility_number,
                ) +
                ' · ' +
                startDate +
                ' to ' +
                asOf,
              reference:
                String(
                  facility
                    .facility_number,
                ),
              sourceModule:
                'accounting',
              sourceType:
                'financing_interest_accrual',
              sourceId:
                String(
                  facility.id,
                ),
              sourceEventKey:
                sourceKey,
              postingKind:
                'system',
              lines:
                interestJournalLines(
                  facility,
                  baseInterestText,
                ),
            },
          );
        const id =
          randomUUID();
        const requestKey =
          randomUUID();
        const requestHash =
          hashPayload({
            facilityId:
              facility.id,
            startDate,
            asOf,
            foreignInterest:
              financingForeignDecimal(
                calculation
                  .interestUnits,
              ),
            baseInterest:
              baseInterestText,
            fxRate:
              fx.rate,
            segments:
              calculation
                .segments,
          });

        await client.query(
          `
            INSERT INTO accounting_financing_interest_accruals (
              id,
              company_id,
              facility_id,
              period_start,
              period_end,
              currency,
              principal_foreign,
              annual_rate,
              day_count,
              day_count_days,
              foreign_interest_amount,
              base_interest_amount,
              exchange_rate,
              journal_id,
              request_key,
              request_hash,
              status,
              metadata,
              posted_at,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,'posted',$17::jsonb,
              NOW(),$18,$18
            )
          `,
          [
            id,
            context.companyId,
            facility.id,
            startDate,
            asOf,
            facilityCurrency,
            calculation
              .principalUnits >
              BigInt(
                0,
              )
              ? financingForeignDecimal(
                  calculation
                    .principalUnits,
                )
              : '0.0000',
            calculation
              .endRate,
            facility
              .day_count,
            financingDayCountDays(
              startDate,
              asOf,
              String(
                facility.day_count,
              ) as
                FinancingDayCount,
            ),
            financingForeignDecimal(
              calculation
                .interestUnits,
            ),
            baseInterestText,
            fx.rate,
            journal.journalId,
            requestKey,
            requestHash,
            JSON.stringify({
              segments:
                calculation
                  .segments,
              fxSourceType:
                fx.sourceType,
              fxSourceName:
                fx.sourceName,
              fxRateDate:
                fx.effectiveDate,
            }),
            context.userId,
          ],
        );

        accrued +=
          1;

        await client.query(
          'RELEASE SAVEPOINT ' +
          savepoint,
        );
      } catch (
        error
      ) {
        await client.query(
          'ROLLBACK TO SAVEPOINT ' +
          savepoint,
        );
        failed +=
          1;
        await client.query(
          'RELEASE SAVEPOINT ' +
          savepoint,
        );
      }
    }

    const status =
      failed >
        0
        ? 'completed_with_errors'
        : 'completed';

    await client.query(
      `
        UPDATE accounting_financing_runs
        SET
          status =
            $3,
          facility_count =
            $4,
          accrued_count =
            $5,
          skipped_count =
            $6,
          failed_count =
            $7,
          completed_at =
            NOW(),
          updated_by =
            $8,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        runId,
        status,
        facilities.rows.length,
        accrued,
        skipped,
        failed,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'interest_run.completed',
      'accounting_financing_runs',
      runId,
      'Financing interest accrual run completed',
      {
        asOf,
        facilities:
          facilities.rows.length,
        accrued,
        skipped,
        failed,
      },
    );

    return {
      id:
        runId,
      asOf,
      facilities:
        facilities.rows.length,
      accrued,
      skipped,
      failed,
      status,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );

    if (
      runId
    ) {
      await context.pool.query(
        `
          UPDATE accounting_financing_runs
          SET
            status =
              'failed',
            completed_at =
              NOW(),
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE company_id =
                $1
            AND id =
                $2
        `,
        [
          context.companyId,
          runId,
          context.userId,
        ],
      ).catch(
        () =>
          undefined,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function reverseFinancingInterestAccrual(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_interest_accruals',
      'edit',
    );
  const body =
    financingBody(
      input,
    );
  const accrualId =
    accountingId(
      body.accrualId,
    );
  const reversalDate =
    accountingDate(
      body.reversalDate,
    );
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            accrual.*,
            facility.facility_number
          FROM accounting_financing_interest_accruals accrual
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               accrual.facility_id
           AND facility.company_id =
               accrual.company_id
           AND facility.deleted_at
               IS NULL
          WHERE accrual.company_id =
                $1
            AND accrual.id =
                $2
            AND accrual.deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE OF accrual, facility
        `,
        [
          context.companyId,
          accrualId,
        ],
      );
    const accrual =
      result.rows[0];

    if (
      !accrual ||
      !accrual.journal_id
    ) {
      throw new AccountingInputError(
        'Financing interest accrual not found.',
      );
    }

    if (
      accrual.status ===
        'reversed' &&
      accrual
        .reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        journalId:
          String(
            accrual
              .reversal_journal_id,
          ),
        replayed:
          true,
      };
    }

    if (
      accrual.status !==
        'posted'
    ) {
      throw new AccountingInputError(
        'Only a posted financing interest accrual can be reversed.',
      );
    }

    if (
      reversalDate <
      String(
        accrual.period_end,
      ).slice(
        0,
        10,
      )
    ) {
      throw new AccountingInputError(
        'Interest reversal date cannot be before the accrual period end.',
      );
    }

    const later =
      await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM accounting_financing_interest_accruals
            WHERE company_id =
                  $1
              AND facility_id =
                  $2
              AND deleted_at
                  IS NULL
              AND status =
                  'posted'
              AND (
                period_end >
                  $3::date
                OR (
                  period_end =
                    $3::date
                  AND created_at >
                    $4
                )
              )
          ) AS later_posted
        `,
        [
          context.companyId,
          accrual.facility_id,
          accrual.period_end,
          accrual.created_at,
        ],
      );

    if (
      later.rows[0]
        ?.later_posted
    ) {
      throw new AccountingInputError(
        'Reverse later interest accruals for this facility first.',
      );
    }

    const paid =
      await client.query(
        `
          SELECT COALESCE(
            SUM(
              interest_foreign
            ),
            0
          )::numeric(19,4)::text
            AS paid
          FROM accounting_financing_transactions
          WHERE company_id =
                $1
            AND facility_id =
                $2
            AND deleted_at
                IS NULL
            AND status =
                'posted'
            AND interest_foreign >
                0
            AND transaction_date >
                $3::date
        `,
        [
          context.companyId,
          accrual.facility_id,
          accrual.period_end,
        ],
      );

    if (
      signedForeignUnits(
        paid.rows[0]
          ?.paid ||
        '0',
      ) >
      BigInt(
        0,
      )
    ) {
      throw new AccountingInputError(
        'Reverse later financing payments before reversing this interest accrual.',
      );
    }

    const reversal =
      await reversePostedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          originalJournalId:
            String(
              accrual.journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse financing interest · ' +
            String(
              accrual
                .facility_number,
            ) +
            ' · ' +
            String(
              accrual.period_start,
            ).slice(
              0,
              10,
            ) +
            ' to ' +
            String(
              accrual.period_end,
            ).slice(
              0,
              10,
            ),
          sourceModule:
            'accounting',
          sourceType:
            'financing_interest_reversal',
          sourceId:
            accrualId,
          sourceEventKey:
            'accounting:financing:interest-reversal:' +
            accrualId,
        },
      );

    await client.query(
      `
        UPDATE accounting_financing_interest_accruals
        SET
          status =
            'reversed',
          reversal_journal_id =
            $3,
          reversed_at =
            NOW(),
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        accrualId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'interest.reversed',
      'accounting_financing_interest_accruals',
      accrualId,
      'Financing interest accrual reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      journalId:
        reversal.journalId,
      replayed:
        reversal.reused,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}
