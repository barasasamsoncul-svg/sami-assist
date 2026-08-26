import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { provisionBusinessDatabase } from '@/lib/services/provisioning';

export async function POST(request: NextRequest) {
  try {
    const { businessId, businessName, appKeys } = await request.json();

    if (!businessId || !businessName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Check if database already exists
    const existingDb = await queryControl(
      `SELECT id FROM database_registry WHERE business_id = $1`,
      [businessId]
    );

    if (existingDb.rows.length > 0) {
      return NextResponse.json({ success: true, message: 'Database already exists' });
    }

    // Provision database with selected apps
    const result = await provisionBusinessDatabase(
      businessId,
      businessName,
      appKeys || []
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Database provisioning failed' }, { status: 500 });
    }

    // Update subscription status
    await queryControl(
      `UPDATE subscriptions SET status = 'active', updated_at = NOW()
       WHERE business_id = $1`,
      [businessId]
    );

    return NextResponse.json({ success: true, message: 'Database provisioned' });

  } catch (error) {
    console.error('Provision database error:', error);
    return NextResponse.json({ error: 'Failed to provision database' }, { status: 500 });
  }
}