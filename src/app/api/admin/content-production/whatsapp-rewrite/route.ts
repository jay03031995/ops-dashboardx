import { NextResponse } from 'next/server';
import { getSession } from '@/lib/middleware';
import { prisma, isDatabaseConfigured } from '@/lib/prisma';
import { resolveEffectiveModuleAccess } from '@/lib/team-role-store';

async function canAccess(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return false;
  if (session.role === 'ADMIN') return true;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { teamRoleCode: true, role: true, userModuleAccess: true },
  });
  const roleCode =
    user?.role === 'ADMIN' ? 'ADMIN' : (user?.teamRoleCode || session.roleCode || 'VE').toUpperCase();
  return resolveEffectiveModuleAccess(session.tenantId, roleCode, user?.userModuleAccess).includes('content_production');
}

function extractGeminiText(payload: any): string {
  const parts =
    payload?.candidates?.flatMap((candidate: any) =>
      Array.isArray(candidate?.content?.parts)
        ? candidate.content.parts
            .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .filter(Boolean)
        : []
    ) || [];
  return parts.join('\n').trim();
}

function styleInstruction(style: string) {
  const value = style.toUpperCase();
  if (value === 'SHORT') {
    return 'Rewrite it as a short, client-facing social media work update for WhatsApp while preserving every link and time exactly.';
  }
  if (value === 'FRIENDLY') {
    return 'Rewrite it as a friendly, polished client-facing WhatsApp update while preserving every link and time exactly.';
  }
  return 'Rewrite it as a professional, polite client-facing WhatsApp update while preserving every link and time exactly.';
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!(await canAccess(session))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'AI rewrite is unavailable in demo mode' }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const style = typeof body.style === 'string' ? body.style.trim() : 'PROFESSIONAL';
    const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const model = process.env.GEMINI_REWRITE_MODEL || 'gemini-2.5-flash';
    const prompt =
      `${styleInstruction(style)}\n\n` +
      'Rules:\n' +
      `- Address the message to the client in a polite way${clientName ? ` using the name "${clientName}"` : ''}.\n` +
      '- Treat this as a social media work update being shared with the client.\n' +
      '- Do not change any URL.\n' +
      '- Do not change any time.\n' +
      '- Do not invent extra deliverables or status details.\n' +
      '- Keep the message ready for copy-paste in WhatsApp.\n' +
      '- Preserve line breaks where useful.\n\n' +
      `Original message:\n${text}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || 'Failed to rewrite WhatsApp update';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const rewritten = extractGeminiText(payload);
    if (!rewritten) {
      return NextResponse.json({ error: 'Gemini returned an empty rewrite' }, { status: 500 });
    }

    return NextResponse.json({ text: rewritten });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rewrite WhatsApp update';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
