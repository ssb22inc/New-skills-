import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Redis } from '@upstash/redis';
import { stripe } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

type CheckResult = { status: 'healthy' | 'unhealthy'; latencyMs?: number; detail?: string };

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

export async function GET() {
  const checks: Record<string, CheckResult> = {};
  let overallHealthy = true;

  // --- Database ---
  try {
    const start = Date.now();
    const supabase = await createServerSupabaseClient();
    await withTimeout(supabase.from('profiles').select('id').limit(1), 3000);
    checks.database = { status: 'healthy', latencyMs: Date.now() - start };
  } catch {
    checks.database = { status: 'unhealthy', detail: 'database unreachable' };
    overallHealthy = false;
  }

  // --- Redis ---
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const start = Date.now();
      const redis = Redis.fromEnv();
      const pong = await withTimeout(redis.ping(), 2000);
      if (pong !== 'PONG') throw new Error('Unexpected PING response');
      checks.redis = { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      checks.redis = { status: 'unhealthy', detail: 'redis unreachable' };
      overallHealthy = false;
    }
  }

  // --- Stripe ---
  try {
    const start = Date.now();
    await withTimeout(stripe.balance.retrieve(), 3000);
    checks.stripe = { status: 'healthy', latencyMs: Date.now() - start };
  } catch {
    // Stripe being unreachable is critical for payment flows but shouldn't
    // entirely block traffic — mark as unhealthy for alerting but keep running.
    checks.stripe = { status: 'unhealthy', detail: 'stripe unreachable' };
    overallHealthy = false;
  }

  // --- OpenAI (lightweight HEAD / models list) ---
  if (process.env.OPENAI_API_KEY) {
    try {
      const start = Date.now();
      const response = await withTimeout(
        fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          // Only fetch headers to minimise response size
          signal: AbortSignal.timeout(3000),
        }),
        3500
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      checks.openai = { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      checks.openai = { status: 'unhealthy', detail: 'openai unreachable' };
      // OpenAI being down degrades AI features but doesn't break core app
    }
  }

  // --- Memory ---
  const memUsage = process.memoryUsage();
  const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  checks.memory = {
    status: memUsedMB < 900 ? 'healthy' : 'unhealthy',
    detail: `${memUsedMB} MB heap used`,
  };

  const response = {
    status: overallHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || 'unknown',
    checks,
  };

  return NextResponse.json(response, {
    status: overallHealthy ? 200 : 503,
  });
}
