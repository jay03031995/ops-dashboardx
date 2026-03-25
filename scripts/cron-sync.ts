import { prisma } from '../src/lib/prisma';
import { syncOneDriveAssignments } from '../src/lib/onedrive';

async function runCron() {
  console.log('--- Starting Daily Assignment Sync (10 AM IST) ---');
  
  try {
    const tenants = await prisma.tenant.findMany();
    
    for (const tenant of tenants) {
      console.log(`Processing tenant: ${tenant.name} (${tenant.id})`);
      const results = await syncOneDriveAssignments(tenant.id, { ignoreSchedule: false });
      console.log(`Sync complete for ${tenant.name}: ${results.length} processed.`);
    }
    
    console.log('--- Cron Job Finished Successfully ---');
  } catch (error) {
    console.error('--- Cron Job Failed ---', error);
  } finally {
    await prisma.$disconnect();
  }
}

runCron();
