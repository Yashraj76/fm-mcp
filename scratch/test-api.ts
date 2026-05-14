async function test() {
  const res = await fetch('http://localhost:3000/api/connections/cmp0yyllz0004v0dg1bxzmdds/test', { method: 'POST' });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test().catch(console.error);
