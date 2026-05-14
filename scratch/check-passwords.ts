import { prisma } from '../src/lib/prisma';
import { decrypt } from '../src/lib/crypto';
async function run() {
  const conns = await prisma.fMConnection.findMany();
  for (const c of conns) {
    try {
      console.log(c.id, c.name, c.database, c.username, decrypt(c.passwordEncrypted));
    } catch(e) {
      console.log(c.id, 'decrypt error');
    }
  }
}
run().catch(console.error);
