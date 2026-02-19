# Load and Stress Testing Guide

This directory contains load and stress tests for the Haven application using k6 and Artillery.

## Test Types

### k6 Tests

Located in `k6/` directory:

1. **listings-load.js** - Load test for listings endpoints
   - Tests listing fetching, detail views, and search
   - Ramps up to 200 concurrent users
   - Targets: 95th percentile < 500ms, 99th < 1000ms

2. **matching-load.js** - Load test for matching algorithm
   - Tests match fetching and user actions (like/skip)
   - Ramps up to 60 concurrent users
   - Targets: 95th percentile < 800ms

3. **stress-test.js** - Stress test to find breaking point
   - Gradually increases load to 400 concurrent users
   - Identifies system limits and degradation points
   - Allows up to 10% failure rate at peak stress

4. **spike-test.js** - Spike test for sudden traffic bursts
   - Simulates sudden traffic spikes (20 → 500 users)
   - Tests system recovery and elasticity
   - Allows up to 15% failure during spikes

### Artillery Tests

Located in `artillery/` directory:

1. **config.yml** - Main load test configuration
   - Multi-scenario test with weighted distribution
   - Tests browsing, detail views, and authentication
   - Sustained load of 100 req/sec

2. **matches.yml** - Matching-specific load test
   - Focused on matching flow
   - 20 req/sec sustained load

## Running Tests

### Prerequisites

Install required tools:

```bash
# k6
brew install k6  # macOS
# or download from https://k6.io/docs/getting-started/installation/

# Artillery
npm install -g artillery
```

### Running k6 Tests

```bash
# Listings load test
k6 run load-tests/k6/listings-load.js

# With custom base URL
k6 run -e BASE_URL=https://staging.haven.com load-tests/k6/listings-load.js

# Matching load test (requires auth token)
k6 run -e AUTH_TOKEN=your-token load-tests/k6/matching-load.js

# Stress test
k6 run load-tests/k6/stress-test.js

# Spike test
k6 run load-tests/k6/spike-test.js

# Output results to file
k6 run --out json=results.json load-tests/k6/listings-load.js
```

### Running Artillery Tests

```bash
# Main load test
BASE_URL=http://localhost:3000 artillery run load-tests/artillery/config.yml

# Generate HTML report
BASE_URL=http://localhost:3000 artillery run --output report.json load-tests/artillery/config.yml
artillery report report.json

# Matching test (requires auth token)
BASE_URL=http://localhost:3000 AUTH_TOKEN=your-token artillery run load-tests/artillery/matches.yml
```

## Test Metrics

### k6 Metrics

- **http_req_duration**: Request duration (p95, p99)
- **http_req_failed**: Failed requests rate
- **errors**: Custom error rate
- **listings_fetch_time**: Time to fetch listings
- **listing_detail_time**: Time to fetch listing details
- **matches_fetch_time**: Time to fetch matches
- **match_action_time**: Time to record match actions

### Artillery Metrics

- **http.response_time**: Response time percentiles
- **http.codes.200**: Successful responses
- **http.request_rate**: Requests per second
- **scenarios.completed**: Completed user scenarios

## Performance Targets

### Production Targets

- 95th percentile response time: < 500ms
- 99th percentile response time: < 1000ms
- Error rate: < 1%
- Concurrent users supported: 200+
- Requests per second: 100+

### Stress Test Targets

- Maximum concurrent users: 400+
- Graceful degradation under stress
- Recovery after spike within 1 minute
- No critical failures (5xx errors)

## CI/CD Integration

Add to your CI pipeline:

```yaml
# Example GitHub Actions
- name: Run k6 load test
  run: |
    k6 run --quiet --no-color \
      -e BASE_URL=${{ secrets.STAGING_URL }} \
      load-tests/k6/listings-load.js
```

## Interpreting Results

### Good Performance
- ✅ All thresholds passing
- ✅ p95 < 500ms, p99 < 1000ms
- ✅ Error rate < 1%
- ✅ No 5xx errors

### Warning Signs
- ⚠️ p95 approaching threshold limits
- ⚠️ Error rate 1-5%
- ⚠️ Increasing response times over time

### Critical Issues
- ❌ Thresholds failing
- ❌ Error rate > 5%
- ❌ Frequent 5xx errors
- ❌ Request timeouts

## Troubleshooting

### High Response Times
- Check database query performance
- Review N+1 query issues
- Verify caching is enabled
- Check external API latency

### High Error Rates
- Review application logs
- Check database connection pool
- Verify rate limiting configuration
- Monitor resource utilization (CPU, memory)

### System Crashes
- Review memory leaks
- Check for database connection exhaustion
- Monitor disk space
- Review error logs for stack traces
