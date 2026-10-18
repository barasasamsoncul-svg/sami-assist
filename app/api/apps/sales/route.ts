import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  MAX_BODY_BYTES,
  parseSalesRequestBody,
  SalesRequestBodyError,
} from '@/lib/apps/sales/request-body';

import {
  CompanyContextError,
} from '@/lib/auth/company-context';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  applySalesOrderDeposit,
  applySalesQuoteTemplate,
  approveSalesReturn,
  cancelSalesOrder,
  cancelSalesQuoteApproval,
  changeSalesQuoteStatus,
  convertSalesQuoteToInvoice,
  createSalesCatalogItem,
  createSalesProductVariant,
  updateSalesProductVariant,
  archiveSalesProductVariant,
  bulkImportSalesCatalogItems,
  createSalesOrderFromQuote,
  createSalesOrderInvoice,
  createSalesCustomer,
  createSalesQuote,
  createSalesQuoteRevision,
  createSalesReturn,
  createSalesShipment,
  createSalesOrderPortalLink,
  revokeSalesOrderPortalLink,
  duplicateSalesQuote,
  getSalesCommercialData,
  getSalesCurrencyData,
  getSalesOperationsData,
  getSalesPipelineData,
  getSalesLeadAssignmentHistory,
  createSalesPipeline,
  createSalesPipelineStage,
  updateSalesPipelineStage,
  archiveSalesPipelineStage,
  reorderSalesPipelineStages,
  createSalesLead,
  bulkReassignSalesLeads,
  bulkCreateSalesLeadActivities,
  bulkUpdateSalesLeadStatus,
  updateSalesLead,
  disqualifySalesLead,
  reopenSalesLead,
  createSalesLeadActivity,
  updateSalesLeadActivity,
  editSalesLeadActivity,
  createSalesOpportunityActivity,
  updateSalesOpportunityActivity,
  editSalesOpportunityActivity,
  convertSalesLeadToOpportunity,
  createBillingCustomerForOpportunity,
  updateSalesOpportunity,
  moveSalesOpportunity,
  getSalesOrderDetail,
  getSalesOrganizationData,
  getSalesQuoteDetail,
  getSalesQuoteRevisionDiff,
  getSalesQuoteApprovalData,
  getSalesSavedQuoteViews,
  saveSalesSavedQuoteView,
  deleteSalesSavedQuoteView,
  getSalesSavedOrderViews,
  saveSalesSavedOrderView,
  deleteSalesSavedOrderView,
  getSalesSavedPipelineViews,
  saveSalesSavedPipelineView,
  deleteSalesSavedPipelineView,
  getSalesLeadAssignmentRules,
  saveSalesLeadAssignmentRule,
  deleteSalesLeadAssignmentRule,
  bulkSendSalesQuotes,
  bulkInvoiceSalesOrders,
  getSalesWorkspaceData,
  getSalesQuoteRegisterPage,
  getSalesOrderRegisterPage,
  issueSalesReturnCredit,
  markSalesCommissionPaid,
  receiveSalesReturn,
  recordSalesOrderDeposit,
  refundSalesReturnCredit,
  requestSalesQuoteApproval,
  reviewSalesQuoteApproval,
  SalesError,
  saveSalesCommissionPlan,
  saveSalesCurrency,
  saveSalesExchangeRate,
  saveSalesPricelist,
  saveSalesQuoteOptionalItems,
  saveSalesQuoteTemplate,
  deleteSalesQuoteTemplate,
  saveSalesQuoteApprovalPolicy,
  saveSalesTarget,
  saveSalesTeam,
  saveSalesTerritory,
  sendSalesQuote,
  setSalesOrderDepositRequirement,
  updateSalesCustomer,
  updateSalesCatalogItem,
  updateSalesOrderFulfillment,
  updateSalesQuoteDraft,
  updateSalesSettings,
  updateSalesShipmentStatus,
} from '@/lib/apps/sales/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

function json(
  body:
    Record<string, unknown>,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
        Pragma:
          'no-cache',
      },
    },
  );
}


function sameOrigin(
  request:
    NextRequest,
) {
  const site =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.toLowerCase();

  if (
    site ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin',
    );

  if (
    !origin
  ) {
    return true;
  }

  try {
    return (
      new URL(
        origin,
      ).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}


function handleError(
  error:
    unknown,
) {
  if (
    error instanceof CompanyContextError ||
    error instanceof TenantContextError
  ) {
    const contextErrorStatuses: Record<string, number> = {
      UNAUTHENTICATED: 401,
      NO_WORKSPACE_SELECTED: 409,
      WORKSPACE_ACCESS_DENIED: 403,
      WORKSPACE_DATABASE_UNAVAILABLE: 503,
      NO_COMPANY_ACCESS: 403,
      INVALID_COMPANY_ID: 400,
      COMPANY_ACCESS_DENIED: 403,
      EMPTY_COMPANY_SELECTION: 400,
      TOO_MANY_COMPANIES: 400,
      SESSION_UPDATE_FAILED: 500,
    };

    return json(
      {
        success: false,
        code: error.code,
        error: error.message,
      },
      contextErrorStatuses[error.code] ?? 500,
    );
  }

  if (
    error instanceof
    SalesError
  ) {
    const status =
      error.code ===
        'SALES_PERMISSION_REQUIRED'
        ? 403
        : error.code ===
            'SALES_WORKSPACE_SUSPENDED'
          ? 402
          : error.code ===
              'SALES_NOT_INSTALLED' ||
            error.code ===
              'QUOTE_NOT_FOUND' ||
            error.code ===
              'OPPORTUNITY_NOT_FOUND' ||
            error.code ===
              'ORDER_NOT_FOUND'
            ? 404
            : error.code ===
                'QUOTE_STATE_INVALID' ||
            error.code ===
              'INVALID_OPPORTUNITY_STAGE'
              ? 409
              : 400;

    return json(
      {
        success:
          false,
        code:
          error.code,
        error:
          error.message,
        ...error.details,
      },
      status,
    );
  }

  console.error(
    '[SaMi Sales] request failed:',
    error,
  );

  return json(
    {
      success:
        false,
      code:
        'SALES_REQUEST_FAILED',
      error:
        'SaMi could not complete the Sales request.',
    },
    500,
  );
}


export async function GET(
  request:
    NextRequest,
) {
  try {
    const revisionDiff = request.nextUrl.searchParams.get('revisionDiff');
    if (revisionDiff === '1') {
      return json({
        success: true,
        revisionDiff: await getSalesQuoteRevisionDiff({
          quoteId: request.nextUrl.searchParams.get('quoteId'),
          revisionNumber: request.nextUrl.searchParams.get('revisionNumber'),
        }),
      });
    }

    const savedViews = request.nextUrl.searchParams.get('savedViews');
    if (savedViews === '1') {
      return json({
        success: true,
        savedViews: await getSalesSavedQuoteViews(),
      });
    }

    const savedOrderViews = request.nextUrl.searchParams.get('savedOrderViews');
    if (savedOrderViews === '1') {
      return json({
        success: true,
        savedOrderViews: await getSalesSavedOrderViews(),
      });
    }

    const leadAssignmentHistory = request.nextUrl.searchParams.get('leadAssignmentHistory');
    if (leadAssignmentHistory === '1') {
      const leadId = request.nextUrl.searchParams.get('leadId');
      return json({
        success: true,
        leadAssignmentHistory: await getSalesLeadAssignmentHistory({ leadId }),
      });
    }

    const leadAssignmentRules = request.nextUrl.searchParams.get('leadAssignmentRules');
    if (leadAssignmentRules === '1') {
      return json({
        success: true,
        leadAssignmentRules: await getSalesLeadAssignmentRules(),
      });
    }

    const pipelineViews = request.nextUrl.searchParams.get('pipelineViews');
    if (pipelineViews === '1') {
      return json({
        success: true,
        savedPipelineViews: await getSalesSavedPipelineViews(),
      });
    }

    const approvals = request.nextUrl.searchParams.get('approvals');
    if (approvals === '1') {
      return json({
        success: true,
        approvals: await getSalesQuoteApprovalData({
          offset: request.nextUrl.searchParams.get('offset'),
          limit: request.nextUrl.searchParams.get('limit'),
        }),
      });
    }

    const register = request.nextUrl.searchParams.get('register');
    if (register === 'quotes') {
      const page = await getSalesQuoteRegisterPage({
        offset: request.nextUrl.searchParams.get('offset'),
        limit: request.nextUrl.searchParams.get('limit'),
        search: request.nextUrl.searchParams.get('search'),
        statusView: request.nextUrl.searchParams.get('statusView'),
      });
      return json({ success: true, register: page });
    }
    if (register === 'orders') {
      const page = await getSalesOrderRegisterPage({
        offset: request.nextUrl.searchParams.get('offset'),
        limit: request.nextUrl.searchParams.get('limit'),
        search: request.nextUrl.searchParams.get('search'),
        statusView: request.nextUrl.searchParams.get('statusView'),
        sortBy: request.nextUrl.searchParams.get('sortBy'),
      });
      return json({ success: true, register: page });
    }

    const pipeline = request.nextUrl.searchParams.get('pipeline');
    if (pipeline === '1') return json({success:true,pipeline:await getSalesPipelineData(request.nextUrl.searchParams.get('pipelineId'))});

    const operations =
      request.nextUrl
        .searchParams
        .get(
          'operations',
        );

    if (
      operations ===
        '1'
    ) {
      return json({
        success:
          true,
        operations:
          await getSalesOperationsData(
            request.nextUrl
              .searchParams
              .get(
                'horizon',
              ),
          ),
      });
    }

    const organization =
      request.nextUrl
        .searchParams
        .get(
          'organization',
        );

    if (
      organization ===
        '1'
    ) {
      return json({
        success:
          true,
        organization:
          await getSalesOrganizationData(),
      });
    }

    const commercial =
      request.nextUrl
        .searchParams
        .get(
          'commercial',
        );

    if (
      commercial ===
        '1'
    ) {
      return json({
        success:
          true,
        commercial:
          await getSalesCommercialData(),
      });
    }

    const currencies =
      request.nextUrl
        .searchParams
        .get(
          'currencies',
        );

    if (
      currencies ===
        '1'
    ) {
      return json({
        success:
          true,
        currencies:
          await getSalesCurrencyData(),
      });
    }

    const quoteId =
      request.nextUrl
        .searchParams
        .get(
          'quoteId',
        );

    if (
      quoteId
    ) {
      const quote =
        await getSalesQuoteDetail(
          quoteId,
        );

      return quote
        ? json({
            success:
              true,
            quote,
          })
        : json(
            {
              success:
                false,
              error:
                'Quotation was not found.',
            },
            404,
          );
    }

    const orderId =
      request.nextUrl
        .searchParams
        .get(
          'orderId',
        );

    if (
      orderId
    ) {
      const order =
        await getSalesOrderDetail(
          orderId,
        );

      return order
        ? json({
            success:
              true,
            order,
          })
        : json(
            {
              success:
                false,
              error:
                'Sales order was not found.',
            },
            404,
          );
    }

    return json({
      success:
        true,
      data:
        await getSalesWorkspaceData(),
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


export async function POST(
  request:
    NextRequest,
) {
  if (
    !sameOrigin(
      request,
    )
  ) {
    return json(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This request could not be verified.',
      },
      403,
    );
  }

  try {
    const body =
      await parseSalesRequestBody(request);

    if (
      !body ||
      typeof body !==
        'object' ||
      Array.isArray(
        body,
      )
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_REQUEST',
          error:
            'A valid Sales request is required.',
        },
        400,
      );
    }

    const payload =
      body as
        Record<string, unknown>;

    const action =
      typeof payload.action ===
        'string'
        ? payload.action
            .trim()
            .toLowerCase()
        : '';

    const handlers:
      Record<
        string,
        (
          value:
            Record<
              string,
              unknown
            >,
        ) =>
          Promise<unknown>
      > = {
        create_pipeline:
          createSalesPipeline,
        create_pipeline_stage:
          createSalesPipelineStage,
        update_pipeline_stage:
          updateSalesPipelineStage,
        archive_pipeline_stage:
          archiveSalesPipelineStage,
        reorder_pipeline_stages:
          reorderSalesPipelineStages,
        create_lead:
          createSalesLead,
        bulk_reassign_leads:
          bulkReassignSalesLeads,
        bulk_create_lead_activities:
          bulkCreateSalesLeadActivities,
        bulk_update_lead_status:
          bulkUpdateSalesLeadStatus,
        update_lead:
          updateSalesLead,
        disqualify_lead:
          disqualifySalesLead,
        reopen_lead:
          reopenSalesLead,
        create_lead_activity:
          createSalesLeadActivity,
        update_lead_activity:
          updateSalesLeadActivity,
        edit_lead_activity:
          editSalesLeadActivity,
        create_opportunity_activity:
          createSalesOpportunityActivity,
        update_opportunity_activity:
          updateSalesOpportunityActivity,
        edit_opportunity_activity:
          editSalesOpportunityActivity,
        convert_lead:
          convertSalesLeadToOpportunity,
        create_billing_customer_for_opportunity:
          createBillingCustomerForOpportunity,
        update_opportunity:
          updateSalesOpportunity,
        move_opportunity:
          moveSalesOpportunity,
        create_customer:
          createSalesCustomer,
        update_customer:
          updateSalesCustomer,
        create_catalog_item:
          createSalesCatalogItem,
        create_product_variant:
          createSalesProductVariant,
        update_product_variant:
          updateSalesProductVariant,
        archive_product_variant:
          archiveSalesProductVariant,
        bulk_import_catalog_items:
          bulkImportSalesCatalogItems,
        update_catalog_item:
          updateSalesCatalogItem,
        apply_quote_template:
          applySalesQuoteTemplate,
        create_quote:
          createSalesQuote,
        update_quote:
          updateSalesQuoteDraft,
        duplicate_quote:
          duplicateSalesQuote,
        revise_quote:
          createSalesQuoteRevision,
        save_optional_items:
          saveSalesQuoteOptionalItems,
        save_pricelist:
          saveSalesPricelist,
        save_currency:
          saveSalesCurrency,
        save_exchange_rate:
          saveSalesExchangeRate,
        save_sales_territory:
          saveSalesTerritory,
        save_sales_team:
          saveSalesTeam,
        save_sales_target:
          saveSalesTarget,
        save_commission_plan:
          saveSalesCommissionPlan,
        mark_commission_paid:
          markSalesCommissionPaid,
        set_deposit_requirement:
          setSalesOrderDepositRequirement,
        record_order_deposit:
          recordSalesOrderDeposit,
        apply_order_deposit:
          applySalesOrderDeposit,
        create_shipment:
          createSalesShipment,
        create_order_portal_link:
          createSalesOrderPortalLink,
        revoke_order_portal_link:
          revokeSalesOrderPortalLink,
        update_shipment_status:
          updateSalesShipmentStatus,
        create_return:
          createSalesReturn,
        approve_return:
          approveSalesReturn,
        receive_return:
          receiveSalesReturn,
        issue_return_credit:
          issueSalesReturnCredit,
        refund_return_credit:
          refundSalesReturnCredit,
        bulk_send_quotes:
          bulkSendSalesQuotes,
        bulk_invoice_orders:
          bulkInvoiceSalesOrders,
        send_quote:
          sendSalesQuote,
        cancel_quote_approval:
          cancelSalesQuoteApproval,
        change_quote_status:
          changeSalesQuoteStatus,
        request_quote_approval:
          requestSalesQuoteApproval,
        review_quote_approval:
          reviewSalesQuoteApproval,
        quote_to_order:
          createSalesOrderFromQuote,
        quote_to_invoice:
          convertSalesQuoteToInvoice,
        update_fulfillment:
          updateSalesOrderFulfillment,
        create_order_invoice:
          createSalesOrderInvoice,
        cancel_order:
          cancelSalesOrder,
        update_settings:
          updateSalesSettings,
        save_template:
          saveSalesQuoteTemplate,
        delete_template:
          deleteSalesQuoteTemplate,
        save_quote_view:
          saveSalesSavedQuoteView,
        delete_quote_view:
          deleteSalesSavedQuoteView,
        save_order_view:
          saveSalesSavedOrderView,
        delete_order_view:
          deleteSalesSavedOrderView,
        save_pipeline_view:
          saveSalesSavedPipelineView,
        delete_pipeline_view:
          deleteSalesSavedPipelineView,
        save_lead_assignment_rule:
          saveSalesLeadAssignmentRule,
        delete_lead_assignment_rule:
          deleteSalesLeadAssignmentRule,
        save_approval_policy:
          saveSalesQuoteApprovalPolicy,
      };

    const handler =
      handlers[
        action
      ];

    if (
      !handler
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_ACTION',
          error:
            'Choose a valid Sales action.',
        },
        400,
      );
    }

    return json({
      success:
        true,
      result:
        await handler(
          payload,
        ) as
          Record<
            string,
            unknown
          >,
    });
  } catch (
    error
  ) {
    if (error instanceof SalesRequestBodyError) {
      return json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        error.status,
      );
    }

    return handleError(
      error,
    );
  }
}
