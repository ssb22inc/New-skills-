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
// METRICS_TOKEN must be at least 32 characters to ensure sufficient entropy.
const MIN_TOKEN_LENGTH = 32;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = process.env.METRICS_TOKEN;

  if (!token || token.length < MIN_TOKEN_LENGTH || authHeader !== `Bearer ${token}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const metrics = await register.metrics();

  return new NextResponse(metrics, {
    headers: {
      'Content-Type': register.contentType,
    },
  });
}
