import { execSync } from 'child_process';

const auth = Buffer.from(`Developer:`).toString('base64');
const cmd = `curl -s -o /dev/null -w "%{http_code}" -X POST "https://kibiz-linux.smtech.cloud:443/fmi/data/v1/databases/KIB__Web/sessions" -H "Authorization: Basic ${auth}" -H "Content-Type: application/json" -d "{}"`;
console.log(cmd);
try {
  const out = execSync(cmd).toString();
  console.log("CURL output:", out);
} catch(e) {
  console.error("CURL error");
}
