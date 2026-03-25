import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/lib/prisma';
import { getSession } from '@/lib/middleware';
import { syncOneDriveAssignments } from '@/lib/onedrive';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      message: 'Demo mode: sync skipped because DATABASE_URL is missing',
      results: [],
      skipped: true,
    });
  }

  if (!process.env.ONEDRIVE_CLIENT_ID || !process.env.ONEDRIVE_CLIENT_SECRET) {
    return NextResponse.json({
      message: 'Sync skipped: OneDrive credentials are missing',
      results: [],
      skipped: true,
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const manual = Boolean(body?.manual);
    const results = await syncOneDriveAssignments(session.tenantId, { ignoreSchedule: manual });
    if (!results.length) {
      return NextResponse.json({
        message: 'No pending calendar entries found for sync',
        results: [],
        skipped: false,
      });
    }

    const firstIssue = results.find((r: any) => r.status === 'ERROR' || r.status === 'SKIPPED');
    const message = firstIssue
      ? `Sync complete with issues: ${firstIssue.message || firstIssue.status}`
      : 'Sync complete';

    return NextResponse.json({ message, results, skipped: false });
  } catch (error: any) {
    console.error('Sync failed, returning safe response:', error?.message || error);
    return NextResponse.json({
      message: `Sync skipped due to runtime issue: ${error?.message || 'unknown error'}`,
      results: [],
      skipped: true,
    });
  }
}
