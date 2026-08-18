import http from 'http';

const data = JSON.stringify({
  materialId: 1,
  quantityDelta: 10,
  reason: 'Test Reference',
  notes: 'Test notes'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/inventory',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
