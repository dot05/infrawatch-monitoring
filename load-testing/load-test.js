import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // warm up
    { duration: '1m',  target: 50 },   // normal load
    { duration: '30s', target: 100 },  // spike
    { duration: '30s', target: 50 },   // scale back
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 2 seconds
    http_req_failed: ['rate<0.05'],    // under 5% failure
  },
};

export default function () {
  // Test 1: Health check
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health status 200': (r) => r.status === 200,
    'mongodb connected': (r) => JSON.parse(r.body).mongodb === 'connected',
  });

  // Test 2: Get metrics
  const metrics = http.get(`${BASE_URL}/api/metrics?limit=10`);
  check(metrics, {
    'metrics status 200': (r) => r.status === 200,
  });

  // Test 3: Get summary (MongoDB aggregation under load)
  const summary = http.get(`${BASE_URL}/api/metrics/summary`);
  check(summary, {
    'summary status 200': (r) => r.status === 200,
  });

  // Test 4: Push fake metrics (write load on MongoDB)
  const payload = JSON.stringify({
    agentId: `load-test-agent-${__VU}`,
    timestamp: new Date(),
    cpu: { usage: Math.random() * 100, cores: 8, userLoad: 50, systemLoad: 20 },
    memory: { total: 16000000000, used: 8000000000, free: 8000000000, usagePercent: 50 },
    disk: [],
    network: [],
    processes: { total: 200, running: 5, blocked: 0, sleeping: 195 }
  });

  const push = http.post(`${BASE_URL}/api/metrics`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(push, {
    'metrics pushed 201': (r) => r.status === 201,
  });

  sleep(1);
}