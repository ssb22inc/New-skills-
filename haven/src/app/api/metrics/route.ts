import { NextResponse } from 'next/server';
import { register } from '@/lib/metrics/registry';

// Re-export metrics so existing imports from this file continue to work.
export {
  httpRequestsTotal,
  httpRequestDuration,
  activeConnections,
  listingsCreated,
  matchesCreated,
  matchScore,
  bookingsCreated,
  userSignups,
  listingViews,
  matchActions,
  authAttempts,
  rateLimitHits,
  aiRequestDuration,
  paymentAmount,
  funnelStep,
} from '@/lib/metrics/registry';

// Metrics endpoint — protected with bearer token to prevent info leakage.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = process.env.METRICS_TOKEN;

  if (!token || authHeader !== `Bearer ${token}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const metrics = await register.metrics();

  return new NextResponse(metrics, {
    headers: {
      'Content-Type': register.contentType,
    },
  });
}
