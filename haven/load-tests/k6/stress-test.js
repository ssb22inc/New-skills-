import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Stress test - find breaking point
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 },
    { duration: '5m', target: 300 },
    { duration: '2m', target: 400 },
    { duration: '5m', target: 400 }, // stress point
    { duration: '5m', target: 0 },   // recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const endpoints = [
    { url: '/api/listings?page=1&limit=20', weight: 40 },
    { url: '/api/listings?city=Houston', weight: 20 },
    { url: '/api/matches', weight: 20 },
    { url: '/', weight: 20 },
  ];

  // Weighted random selection
  const random = Math.random() * 100;
  let cumulative = 0;
  let selectedEndpoint;
  
  for (const endpoint of endpoints) {
    cumulative += endpoint.weight;
    if (random < cumulative) {
      selectedEndpoint = endpoint;
      break;
    }
  }

  const res = http.get(`${BASE_URL}${selectedEndpoint.url}`);
  
  check(res, {
    'status is not 5xx': (r) => r.status < 500,
  }) || errorRate.add(1);

  sleep(Math.random() * 2);
}
