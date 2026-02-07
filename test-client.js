#!/usr/bin/env node

/**
 * Simple Poker Game API Test Client
 * Run with: node test-client.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🎰 POKER GAME API TEST CLIENT\n');

  try {
    // 1. Health Check
    console.log('1️⃣  Testing Health Endpoint...');
    let res = await makeRequest('GET', '/health');
    console.log(`   Status: ${res.status}`);
    console.log(`   Response: ${JSON.stringify(res.body)}\n`);

    // 2. Get Metrics
    console.log('2️⃣  Testing Metrics Endpoint...');
    res = await makeRequest('GET', '/metrics');
    console.log(`   Status: ${res.status}`);
    const metricsLines = (res.body || '').split('\n').slice(0, 5);
    console.log(`   Metrics sample:\n   ${metricsLines.join('\n   ')}\n`);

    // 3. Get Admin Metrics
    console.log('3️⃣  Testing Admin Metrics...');
    res = await makeRequest('GET', '/admin/metrics');
    console.log(`   Status: ${res.status}`);
    console.log(`   Response keys: ${Object.keys(res.body || {}).join(', ')}\n`);

    // 4. Test Security Headers
    console.log('4️⃣  Checking Security Headers...');
    res = await makeRequest('GET', '/health');
    const headers = res.headers;
    console.log(`   Content-Security-Policy: ${headers['content-security-policy'] ? '✅' : '❌'}`);
    console.log(`   Strict-Transport-Security: ${headers['strict-transport-security'] ? '✅' : '❌'}`);
    console.log(`   X-Frame-Options: ${headers['x-frame-options'] ? '✅' : '❌'}`);
    console.log(`   X-Content-Type-Options: ${headers['x-content-type-options'] ? '✅' : '❌'}\n`);

    // 5. Test API Routes
    console.log('5️⃣  Testing API Routes...');
    const testRoutes = [
      { method: 'GET', path: '/api/v1/users', name: 'List Users (protected)' },
      { method: 'GET', path: '/api/v1/tables', name: 'List Tables' },
      { method: 'GET', path: '/api/game', name: 'Game Routes' },
      { method: 'GET', path: '/api/security', name: 'Security Routes' },
    ];

    for (const route of testRoutes) {
      res = await makeRequest(route.method, route.path);
      const status = res.status === 401 ? '✅ Protected' : 
                     res.status === 400 ? '✅ Valid' :
                     res.status === 404 ? '❌ Not Found' : `⚠️ ${res.status}`;
      console.log(`   ${route.name}: ${status}`);
    }
    console.log();

    console.log('✅ All tests completed!');
    console.log('\n📊 View Metrics Dashboard:');
    console.log('   http://localhost:3000/metrics');
    console.log('   http://localhost:3000/admin/metrics\n');
    console.log('📝 View Logs:');
    console.log('   docker logs poker_backend -f\n');
    console.log('🔗 Postman Collection:');
    console.log('   Import: Poker_Game_API.postman_collection.json\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n⚠️  Make sure Docker services are running:');
    console.error('   cd deployment/aws && docker-compose up -d');
  }
}

runTests();
