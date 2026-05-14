/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/servers/cm3ce58i2000c2ab5suxp9y7v/ai/generate-server-tools', // Need to get actual server ID
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
req.write(JSON.stringify({ branchId: 'cm3ce58i2000c2ab5suxp9y7v' })); // Dummy ID
req.end();
