import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';
import * as msal from '@azure/msal-node';
import { prisma } from './prisma';
import { syncContentProductionFromCalendar } from './taskboard-content-sync';

const msalConfig = {
    auth: {
        clientId: process.env.ONEDRIVE_CLIENT_ID || 'placeholder',
        authority: `https://login.microsoftonline.com/${process.env.ONEDRIVE_TENANT_ID || 'common'}`,
        clientSecret: process.env.ONEDRIVE_CLIENT_SECRET || 'placeholder',
    }
};

const tokenRequest = {
    scopes: ['https://graph.microsoft.com/.default'],
};

// Lazy initialization to avoid build-time errors when env vars are missing
let cca: msal.ConfidentialClientApplication | null = null;

function getCCA() {
    if (!cca) {
        cca = new msal.ConfidentialClientApplication(msalConfig);
    }
    return cca;
}

async function getAccessToken() {
    try {
        const clientApp = getCCA();
        const response = await clientApp.acquireTokenByClientCredential(tokenRequest);
        return response?.accessToken;
    } catch (error) {
        console.error('Error acquiring access token:', error);
        return null;
    }
}

export async function getGraphClient() {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Could not get access token');

    return Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        },
    });
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type SyncOptions = {
    ignoreSchedule?: boolean;
    now?: Date;
};

function isShareUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

function encodeSharingUrl(url: string) {
    const base64 = Buffer.from(url, 'utf8').toString('base64');
    const base64Url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `u!${base64Url}`;
}

function normalizePath(path: string) {
    return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

function getFolderChildrenEndpoint(folder: string) {
    if (isShareUrl(folder)) {
        const shareId = encodeSharingUrl(folder);
        return `/shares/${shareId}/driveItem/children`;
    }

    const safePath = normalizePath(folder);
    if (process.env.ONEDRIVE_DRIVE_ID) {
        return `/drives/${process.env.ONEDRIVE_DRIVE_ID}/root:/${safePath}:/children`;
    }
    if (process.env.ONEDRIVE_USER_ID) {
        return `/users/${process.env.ONEDRIVE_USER_ID}/drive/root:/${safePath}:/children`;
    }
    return `/me/drive/root:/${safePath}:/children`;
}

async function renameDriveItem(client: Client, item: any, newName: string) {
    const driveId = item?.parentReference?.driveId;
    const endpoint = driveId ? `/drives/${driveId}/items/${item.id}` : `/me/drive/items/${item.id}`;
    await client.api(endpoint).patch({ name: newName });
}

function getISTDateInfo(now: Date) {
    const istClock = new Date(now.getTime() + IST_OFFSET_MS);
    const y = istClock.getUTCFullYear();
    const m = istClock.getUTCMonth();
    const d = istClock.getUTCDate();
    const hour = istClock.getUTCHours();

    const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
    const endUtc = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0) - IST_OFFSET_MS - 1);
    const dateLabel = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    return { hour, startUtc, endUtc, dateLabel };
}

export async function syncOneDriveAssignments(tenantId: string, options: SyncOptions = {}) {
    const now = options.now || new Date();
    const { hour: istHour, startUtc, endUtc, dateLabel } = getISTDateInfo(now);
    const isBeforeTenAMIST = istHour < 10;

    if (!options.ignoreSchedule && !isBeforeTenAMIST) {
        console.log(`[${tenantId}] Skipping sync: current IST hour is ${istHour}, allowed before 10:00 IST.`);
        return [];
    }

    // Check if configured
    if (!process.env.ONEDRIVE_CLIENT_ID || !process.env.ONEDRIVE_CLIENT_SECRET) {
        console.warn('OneDrive is not configured. Skipping sync.');
        return [];
    }

    const client = await getGraphClient();

    const pendingWhere: any = {
        tenantId,
        status: 'PENDING'
    };
    if (!options.ignoreSchedule) {
        pendingWhere.date = { gte: startUtc, lte: endUtc };
    }

    const pending = await prisma.contentCalendar.findMany({
        where: pendingWhere,
        include: {
            client: {
                include: { editor: true }
            }
        }
    });

    const results = [];

    for (const entry of pending) {
        if (!entry.client.oneDriveFolder || !entry.client.editor) {
            results.push({ entryId: entry.id, status: 'SKIPPED', message: 'Client folder or editor mapping missing' });
            continue;
        }

        try {
            const childrenEndpoint = getFolderChildrenEndpoint(entry.client.oneDriveFolder);
            const children = await client.api(childrenEndpoint).get();
            const videos = children.value.filter((f: any) => f.file && !f.name.startsWith('Assigned-'));

            if (videos.length > 0) {
                const videoToAssign = videos[0];
                const newName = `Assigned-${entry.client.editor.name?.replace(/\s+/g, '') || 'Editor'}-${videoToAssign.name}`;

                await renameDriveItem(client, videoToAssign, newName);

                await prisma.contentCalendar.update({
                    where: { id: entry.id },
                    data: {
                        status: 'ASSIGNED',
                        videoUrl: videoToAssign.webUrl
                    }
                });
                await syncContentProductionFromCalendar({
                    id: entry.id,
                    tenantId,
                    clientId: entry.clientId,
                    date: entry.date,
                    platform: entry.platform,
                    topic: entry.videoTopic,
                    status: 'ASSIGNED',
                    assignedEditorId: entry.assignedEditorId || entry.client.editorId || null,
                });

                results.push({ entryId: entry.id, status: 'SUCCESS', fileName: newName });
            } else {
                results.push({ entryId: entry.id, status: 'SKIPPED', message: 'No unassigned video found in OneDrive folder' });
            }
        } catch (error: any) {
            console.error(`Error processing entry ${entry.id}:`, error);
            results.push({ entryId: entry.id, status: 'ERROR', message: error.message });
        }
    }

    const dayEntries = await prisma.contentCalendar.findMany({
        where: {
            tenantId,
            date: { gte: startUtc, lte: endUtc },
        },
        select: { id: true, status: true },
    });
    const allProcessed = dayEntries.length > 0 && dayEntries.every((entry) => entry.status !== 'PENDING');
    if (allProcessed && (options.ignoreSchedule || isBeforeTenAMIST)) {
        console.log(`[${tenantId}] Content Assignment Over for IST date ${dateLabel}`);
    }

    return results;
}
