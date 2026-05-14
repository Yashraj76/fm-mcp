/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/connections/cmp1bbu3f000iv0wy8z03v996/browse-schema', // Need connection ID
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
});
req.on('error', console.error);
req.end();
