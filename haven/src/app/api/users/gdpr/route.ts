/**
 * GDPR Data Subject Rights API
 *
 * GET  /api/users/gdpr          → Article 15: Right to Access (data export)
 * DELETE /api/users/gdpr        → Article 17: Right to Erasure
 * PATCH /api/users/gdpr/consent → Article 7: Consent management (see below)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportDataPortable, deleteUserData } from '@/lib/privacy/gdpr';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { stripe } from '@/lib/stripe/client';

const deleteSchema = z.object({
  confirm: z.literal('DELETE MY ACCOUNT'),
  hard_delete: z.boolean().optional().default(false),
  preserve_audit_logs: z.boolean().optional().default(true),
});

/** Article 15 — Right to Access: export all personal data as JSON. */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await exportDataPortable(user.id);

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="haven-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    logger.error({ event: 'gdpr_export_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Data export failed' }, { status: 500 });
  }
}

/** Article 17 — Right to Erasure: delete all personal data. */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed. Send { "confirm": "DELETE MY ACCOUNT" }.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { hard_delete, preserve_audit_logs } = parsed.data;

    // Cancel and purge Stripe customer data before deleting application records
    try {
      // Find stripe customer ID from subscriptions
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id, status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (subscription?.stripe_customer_id) {
        // Cancel active subscription before deleting customer
        if (subscription.stripe_subscription_id && subscription.status === 'active') {
          await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
        }
        // Delete Stripe customer (removes payment methods, invoices, etc.)
        await stripe.customers.del(subscription.stripe_customer_id);
      }
    } catch (stripeErr) {
      logger.warn({
        event: 'gdpr_stripe_cleanup_partial',
        userId: user.id,
        error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
      });
      // Continue with application data deletion even if Stripe cleanup partially fails
    }

    // Delete application data (calls supabase.auth.admin.deleteUser if hard_delete)
    const result = await deleteUserData(user.id, {
      hardDelete: hard_delete,
      preserveAuditLogs: preserve_audit_logs,
    });

    logger.info({ event: 'gdpr_deletion_complete', userId: user.id, hardDelete: hard_delete, deletedRecords: result.deletedRecords });

    return NextResponse.json({
      success: true,
      message: hard_delete
        ? 'Your account and all personal data have been permanently deleted.'
        : 'Your personal data has been anonymised.',
      deletedRecords: result.deletedRecords,
    });
  } catch (error) {
    logger.error({ event: 'gdpr_delete_error', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Account deletion failed. Please contact support.' }, { status: 500 });
  }
}
