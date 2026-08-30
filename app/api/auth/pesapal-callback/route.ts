import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { provisionTenant } from '@/lib/services/tenant-provisioning';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_tracking_id, merchant_reference, status } = body;

    if (status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
    }

    const transactionResult = await queryControl(
      `SELECT * FROM payment_transactions 
       WHERE provider_transaction_id = $1 AND provider = 'pesapal'`,
      [order_tracking_id]
    );

    if (transactionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const transaction = transactionResult.rows[0];
    const tenantId = transaction.tenant_id;
    const subscriptionId = transaction.subscription_id;

    // Update transaction
    await queryControl(
      `UPDATE payment_transactions SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [transaction.id]
    );

    // Update subscription
    if (subscriptionId) {
      await queryControl(
        `UPDATE subscriptions 
         SET status = 'active', 
             trial_ends_at = NOW() + INTERVAL '15 days',
             current_period_start = NOW(),
             current_period_end = NOW() + INTERVAL '1 month'
         WHERE id = $1`,
        [subscriptionId]
      );
    }

    // Get pending apps
    const appsResult = await queryControl(
      `SELECT m.key FROM tenant_modules tm
       JOIN modules m ON tm.module_id = m.id
       WHERE tm.tenant_id = $1 AND tm.status = 'pending'`,
      [tenantId]
    );

    const selectedApps = appsResult.rows.map(row => row.key);

    // Provision tenant with all schemas
    await provisionTenant(tenantId, selectedApps);

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed and workspace provisioned'
    });

  } catch (error) {
    console.error('PesaPal callback error:', error);
    return NextResponse.json(
      { error: 'Failed to process payment callback' },
      { status: 500 }
    );
  }
}