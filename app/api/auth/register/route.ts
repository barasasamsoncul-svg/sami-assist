import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';
import { createPesaPalOrder } from '@/lib/services/pesapal';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      password, 
      businessName, 
      plan, 
      selectedApps 
    } = body;

    // Validation
    if (!firstName || !lastName || !email || !password || !businessName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    if (!selectedApps || selectedApps.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one app' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await queryControl(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Determine if payment is required (more than 1 app = paid plan)
    const requiresPayment = selectedApps.length > 1;
    const finalPlan = requiresPayment ? 'standard' : plan;

    const hashedPassword = await bcrypt.hash(password, 10);
    
    try {
      // 1. Create user
      const userResult = await queryControl(
        `INSERT INTO users (
          email, 
          password_hash, 
          first_name, 
          last_name, 
          full_name, 
          phone, 
          status, 
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, email`,
        [
          email.toLowerCase(),
          hashedPassword,
          firstName,
          lastName,
          `${firstName} ${lastName}`,
          phone || null,
          'active'
        ]
      );

      const userId = userResult.rows[0].id;

      // 2. Create tenant with unique slug
      const baseSlug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      let slug = baseSlug;
      let slugCounter = 1;

      // Check if slug exists and generate unique one
      while (true) {
        const existingTenant = await queryControl(
          `SELECT id FROM tenants WHERE slug = $1 AND deleted_at IS NULL`,
          [slug]
        );
        
        if (existingTenant.rows.length === 0) {
          break;
        }
        
        slug = `${baseSlug}-${slugCounter}`;
        slugCounter++;
      }

      const tenantResult = await queryControl(
        `INSERT INTO tenants (name, slug, status, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id`,
        [
          businessName,
          slug,
          requiresPayment ? 'pending_payment' : 'provisioning'
        ]
      );

      const tenantId = tenantResult.rows[0].id;

      // 3. Link user to tenant
      await queryControl(
        `INSERT INTO tenant_users (tenant_id, user_id, status, is_owner, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [tenantId, userId, 'active', true]
      );

      // 4. Assign admin role
      const roleResult = await queryControl(
        `SELECT id FROM roles WHERE name = 'admin' AND is_system = true LIMIT 1`
      );

      if (roleResult.rows.length > 0) {
        await queryControl(
          `INSERT INTO user_roles (tenant_id, user_id, role_id, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [tenantId, userId, roleResult.rows[0].id]
        );
      }

      // 5. Get plan ID
      const planResult = await queryControl(
        `SELECT id FROM plans WHERE key = $1`,
        [finalPlan]
      );

      let subscriptionStatus = requiresPayment ? 'pending_payment' : 'active';
      let trialEndsAt = requiresPayment ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) : null;
      let subscriptionId = null;

      if (planResult.rows.length > 0) {
        const planId = planResult.rows[0].id;
        const subResult = await queryControl(
          `INSERT INTO subscriptions (
            tenant_id, 
            plan_id, 
            status, 
            started_at, 
            trial_ends_at, 
            current_period_start,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, NOW(), $4, NOW(), NOW(), NOW())
          RETURNING id`,
          [tenantId, planId, subscriptionStatus, trialEndsAt]
        );
        subscriptionId = subResult.rows[0].id;
      }

      // 6. Install selected apps (pending if payment required)
      const appStatus = requiresPayment ? 'pending' : 'installed';
      for (const appKey of selectedApps) {
        const moduleResult = await queryControl(
          `SELECT id FROM modules WHERE key = $1 AND deleted_at IS NULL`,
          [appKey]
        );

        if (moduleResult.rows.length > 0) {
          await queryControl(
            `INSERT INTO tenant_modules (tenant_id, module_id, status, installed_at)
             VALUES ($1, $2, $3, NOW())`,
            [tenantId, moduleResult.rows[0].id, appStatus]
          );
        }
      }

      // 7. Generate verification code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await queryControl(
        `INSERT INTO email_verifications (email, code_hash, expires_at, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [email.toLowerCase(), hashedCode, expiresAt]
      );

      // 8. Send verification email
      await sendVerificationEmail(email, code, firstName);

      // 9. If no payment required, provision immediately
      if (!requiresPayment) {
        // Provision tenant in background
        provisionTenant(tenantId, selectedApps)
          .then(() => console.log(`Tenant ${tenantId} provisioned successfully`))
          .catch(err => console.error(`Provisioning failed for ${tenantId}:`, err));
        
        return NextResponse.json({
          success: true,
          requiresPayment: false,
          user: { id: userId, email },
          tenant: { id: tenantId },
          message: 'Account created. Please verify your email.'
        });
      }

      // 10. Create PesaPal order for payment
      const amount = finalPlan === 'standard' ? 
        parseInt(process.env.PESAPAL_PRICE_STANDARD_MONTHLY || '2000') :
        parseInt(process.env.PESAPAL_PRICE_CUSTOM_MONTHLY || '3340');
      
      const pesapalOrder = await createPesaPalOrder({
        tenantId,
        subscriptionId,
        amount,
        email,
        firstName,
        lastName,
        businessName,
        plan: finalPlan,
        selectedApps
      });
      
      return NextResponse.json({
        success: true,
        requiresPayment: true,
        pesapalOrder,
        user: { id: userId, email },
        tenant: { id: tenantId },
        message: 'Account created. Please complete payment to activate your workspace.'
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      // Clean up on error - delete the user if registration failed
      if (error) {
        try {
          // Get the user we just created
          const userToDelete = await queryControl(
            `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
            [email.toLowerCase()]
          );
          
          if (userToDelete.rows.length > 0) {
            // Soft delete the user
            await queryControl(
              `UPDATE users SET deleted_at = NOW() WHERE id = $1`,
              [userToDelete.rows[0].id]
            );
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
      
      return NextResponse.json(
        { error: 'Registration failed. Please try again.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    );
  }
}