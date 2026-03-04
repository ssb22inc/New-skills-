import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: 'healthy' | 'unhealthy'; latency?: number; memoryMB?: number }> = {};
  let overallHealthy = true;

  // Database check
  try {
    const start = Date.now();
    const supabase = await createServerSupabaseClient();
    await supabase.from('profiles').select('id').limit(1);
    checks.database = { status: 'healthy', latency: Date.now() - start };
  } catch (error) {
    checks.database = { status: 'unhealthy' };
    overallHealthy = false;
  }

  // Redis check (if configured via Upstash env vars)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const start = Date.now();
      const redis = Redis.fromEnv();
      const pong = await redis.ping();
      if (pong !== 'PONG') throw new Error('Unexpected PING response');
      checks.redis = { status: 'healthy', latency: Date.now() - start };
    } catch {
      checks.redis = { status: 'unhealthy' };
      overallHealthy = false;
    }
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  checks.memory = {
    status: memUsedMB < 900 ? 'healthy' : 'unhealthy',
    memoryMB: memUsedMB,
  };

  const response = {
    status: overallHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    checks,
  };

  return NextResponse.json(response, {
    status: overallHealthy ? 200 : 503,
  });
}
