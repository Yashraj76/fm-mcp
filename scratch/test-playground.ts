import { prisma } from '../src/lib/prisma';
async function test() {
  const server = await prisma.mcpServer.findFirst();
  if (!server) throw new Error("No server found");

  const msg = "give the total sales of the customer 'A. & G.FOODS.'";
  console.log(`Starting playground session for server ${server.id}...`);
  
  const res = await fetch('http://localhost:3000/api/playground/ai-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverId: server.id, message: msg })
  });
  const data = await res.json();
  if (!data.success) {
    console.error("Failed to start session:", data);
    return;
  }

  const sessionId = data.data.sessionId;
  console.log(`Session started: ${sessionId}. Polling status...`);

  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`http://localhost:3000/api/playground/sessions/${sessionId}`);
    const statusData = await statusRes.json();
    if (!statusData.success) {
      console.error("Poll failed:", statusData);
      break;
    }
    
    console.log(`Status: ${statusData.data.status}`);
    if (statusData.data.status === 'done' || statusData.data.status === 'error') {
      console.log("Plan:", statusData.data.intent);
      console.log("\nSteps log:");
      console.log(JSON.stringify(statusData.data.stepLog, null, 2));
      console.log("\nFinal Result:");
      console.log(JSON.stringify(statusData.data.finalResult, null, 2));
      break;
    }
  }
}
test().catch(console.error);
