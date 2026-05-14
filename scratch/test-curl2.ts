import { execSync } from 'child_process';

const auth = Buffer.from(`Developer:`).toString('base64');
const cmd = `curl -v -X POST "https://kibiz-linux.smtech.cloud/fmi/data/v1/databases/KIB__Web/sessions" -H "Authorization: Basic ${auth}" -H "Content-Type: application/json"`;
console.log(cmd);
try {
  const out = execSync(cmd).toString();
  console.log("CURL output:", out);
} catch(e) {
  console.error("CURL error");
}
