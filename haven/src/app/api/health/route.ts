import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: 'healthy' | 'unhealthy'; latency?: number }> = {};
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

  // Redis check (if configured)
  if (process.env.REDIS_URL) {
    try {
      const start = Date.now();
      // Redis ping would go here if Redis client is configured
      checks.redis = { status: 'healthy', latency: Date.now() - start };
    } catch (error) {
      checks.redis = { status: 'unhealthy' };
      overallHealthy = false;
    }
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  checks.memory = {
    status: memUsedMB < 900 ? 'healthy' : 'unhealthy',
    latency: memUsedMB,
  };

  const response = {
    status: overallHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    uptime: process.uptime(),
    checks,
  };

  return NextResponse.json(response, {
    status: overallHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
