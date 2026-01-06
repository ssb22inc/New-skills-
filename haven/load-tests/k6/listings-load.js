import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const listingsFetchTime = new Trend('listings_fetch_time');
const listingDetailTime = new Trend('listing_detail_time');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 50 }, // Ramp up to 50 users
    { duration: '3m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users (stress)
    { duration: '2m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    errors: ['rate<0.01'], // Error rate under 1%
    listings_fetch_time: ['p(95)<400'],
    listing_detail_time: ['p(95)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  group('Listings Flow', () => {
    // Fetch listings page
    group('Fetch Listings', () => {
      const listingsRes = http.get(`${BASE_URL}/api/listings?page=1&limit=20`);

      listingsFetchTime.add(listingsRes.timings.duration);

      check(listingsRes, {
        'listings status is 200': (r) => r.status === 200,
        'listings response has data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.listings && Array.isArray(body.listings);
          } catch {
            return false;
          }
        },
        'listings response time < 500ms': (r) => r.timings.duration < 500,
      }) || errorRate.add(1);

      sleep(1);

      // If listings exist, fetch a detail page
      if (listingsRes.status === 200) {
        try {
          const listings = JSON.parse(listingsRes.body).listings;
          if (listings.length > 0) {
            const randomListing = listings[Math.floor(Math.random() * listings.length)];

            const detailRes = http.get(`${BASE_URL}/api/listings/${randomListing.id}`);

            listingDetailTime.add(detailRes.timings.duration);

            check(detailRes, {
              'detail status is 200': (r) => r.status === 200,
              'detail has listing data': (r) => {
                try {
                  const body = JSON.parse(r.body);
                  return body.id && body.title;
                } catch {
                  return false;
                }
              },
              'detail response time < 300ms': (r) => r.timings.duration < 300,
            }) || errorRate.add(1);
          }
        } catch (e) {
          errorRate.add(1);
        }
      }
    });

    // Search with filters
    group('Search Listings', () => {
      const searchRes = http.get(
        `${BASE_URL}/api/listings?city=Houston&minPrice=1500&maxPrice=3000&bedrooms=2`
      );

      check(searchRes, {
        'search status is 200': (r) => r.status === 200,
        'search response time < 600ms': (r) => r.timings.duration < 600,
      }) || errorRate.add(1);
    });

    sleep(Math.random() * 3 + 1); // Random sleep 1-4 seconds
  });
}
