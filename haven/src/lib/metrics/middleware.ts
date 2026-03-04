import { NextRequest, NextResponse } from 'next/server';
import { httpRequestsTotal, httpRequestDuration } from '@/app/api/metrics/route';

export function withMetrics(
  handler: (req: NextRequest, ctx: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: any) => {
    const start = Date.now();
    const path = req.nextUrl.pathname;
    const method = req.method;

    try {
      const response = await handler(req, ctx);
      const duration = (Date.now() - start) / 1000;
      const status = response.status.toString();

      httpRequestsTotal.labels(method, path, status).inc();
      httpRequestDuration.labels(method, path, status).observe(duration);

      return response;
    } catch (error) {
      const duration = (Date.now() - start) / 1000;

      httpRequestsTotal.labels(method, path, '500').inc();
      httpRequestDuration.labels(method, path, '500').observe(duration);

      throw error;
    }
  };
}
