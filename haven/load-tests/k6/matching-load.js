import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const matchesFetchTime = new Trend('matches_fetch_time');
const matchActionTime = new Trend('match_action_time');

export const options = {
  stages: [
    { duration: '1m', target: 30 },
    { duration: '3m', target: 30 },
    { duration: '2m', target: 60 },
    { duration: '5m', target: 60 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    errors: ['rate<0.02'],
    matches_fetch_time: ['p(95)<700'],
    match_action_time: ['p(95)<400'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

export default function () {
  group('Matching Flow', () => {
    group('Fetch Matches', () => {
      const matchesRes = http.get(`${BASE_URL}/api/matches?limit=20&minScore=40`, { headers });
      
      matchesFetchTime.add(matchesRes.timings.duration);
      
      check(matchesRes, {
        'matches status is 200': (r) => r.status === 200,
        'matches has array': (r) => {
          const body = JSON.parse(r.body);
          return body.matches && Array.isArray(body.matches);
        },
        'matches have scores': (r) => {
          const body = JSON.parse(r.body);
          return body.matches.length === 0 || body.matches[0].scores;
        },
      }) || errorRate.add(1);

      sleep(2);

      if (matchesRes.status === 200) {
        const matches = JSON.parse(matchesRes.body).matches;
        
        for (let i = 0; i < Math.min(3, matches.length); i++) {
          const match = matches[i];
          const action = Math.random() > 0.3 ? 'liked' : 'skipped';
          
          const actionRes = http.post(
            `${BASE_URL}/api/matches`,
            JSON.stringify({
              listing_id: match.listing.id,
              action: action,
            }),
            { headers }
          );
          
          matchActionTime.add(actionRes.timings.duration);
          
          check(actionRes, {
            'action recorded': (r) => r.status === 200,
            'action response time < 400ms': (r) => r.timings.duration < 400,
          }) || errorRate.add(1);
          
          sleep(Math.random() * 2 + 1);
        }
      }
    });
  });
}
