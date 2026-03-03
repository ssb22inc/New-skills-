import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const chatResponseTime = new Trend('chat_response_time');
const photoAnalysisTime = new Trend('photo_analysis_time');

// AI endpoints are more resource-intensive, lower concurrency
export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 10 },
    { duration: '2m', target: 20 },
    { duration: '5m', target: 20 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    errors: ['rate<0.05'],
    chat_response_time: ['p(95)<2500'],
    photo_analysis_time: ['p(95)<4000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

export default function () {
  group('AI Endpoints', () => {
    group('Chat', () => {
      const chatRes = http.post(
        `${BASE_URL}/api/ai/chat`,
        JSON.stringify({
          message: 'I am looking for a 2 bedroom apartment in Houston under $2500',
          type: 'onboarding',
          conversation: null,
        }),
        { headers, timeout: '10s' }
      );
      
      chatResponseTime.add(chatRes.timings.duration);
      
      check(chatRes, {
        'chat status is 200': (r) => r.status === 200,
        'chat has response': (r) => {
          const body = JSON.parse(r.body);
          return body.messages && body.messages.length > 0;
        },
        'chat extracts data': (r) => {
          const body = JSON.parse(r.body);
          return body.extracted_data !== undefined;
        },
      }) || errorRate.add(1);

      sleep(3);
    });

    group('Listing Generation', () => {
      const genRes = http.post(
        `${BASE_URL}/api/ai/generate-listing`,
        JSON.stringify({
          property_type: 'apartment',
          bedrooms: 2,
          bathrooms: 1,
          city: 'Houston',
          state: 'TX',
          amenities: ['wifi', 'parking', 'washer_dryer'],
          landlord_notes: 'Beautiful apartment near Texas Medical Center',
        }),
        { headers, timeout: '15s' }
      );
      
      check(genRes, {
        'generation status is 200': (r) => r.status === 200,
        'generation has listing': (r) => {
          const body = JSON.parse(r.body);
          return body.listing && body.listing.title;
        },
      }) || errorRate.add(1);

      sleep(5);
    });
  });
}
