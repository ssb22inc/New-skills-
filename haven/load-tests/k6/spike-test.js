import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Spike test - sudden traffic burst
export const options = {
  stages: [
    { duration: '1m', target: 20 }, // Normal load
    { duration: '10s', target: 500 }, // Spike!
    { duration: '3m', target: 500 }, // Hold spike
    { duration: '10s', target: 20 }, // Drop back
    { duration: '3m', target: 20 }, // Recovery
    { duration: '10s', target: 500 }, // Second spike
    { duration: '3m', target: 500 }, // Hold
    { duration: '1m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.15'], // Allow 15% failure during spikes
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/listings?page=1&limit=20`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 5000,
  }) || errorRate.add(1);

  sleep(0.5);
}
