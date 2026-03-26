import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { matchDemoUser } from '@/lib/demo-auth';
import { getJwtSecret } from '@/lib/auth-session';
import { isDatabaseConfigured, prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/with-timeout';

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL is missing on server' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    let sessionUser:
      | {
          id: string;
          name: string | null;
          email: string;
          role: 'ADMIN' | 'EDITOR';
          roleCode: string;
          tenantId: string;
        }
      | null = null;

    if (!isDatabaseConfigured()) {
      const demoUser = matchDemoUser(email, password);
      if (!demoUser) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }
      sessionUser = {
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
        roleCode: demoUser.roleCode,
        tenantId: demoUser.tenantId,
      };
    } else {
      const user = await withTimeout(
        prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            teamRoleCode: true,
            tenantId: true,
          },
        }),
        12000,
        'Database request timed out during login'
      );

      if (!user) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      sessionUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleCode: user.role === 'ADMIN' ? 'ADMIN' : (user.teamRoleCode || 'VE').toUpperCase(),
        tenantId: user.tenantId,
      };
    }

    const token = jwt.sign(
      {
        userId: sessionUser.id,
        tenantId: sessionUser.tenantId,
        role: sessionUser.role,
        roleCode: sessionUser.roleCode,
        email: sessionUser.email,
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    const response = NextResponse.json({
      user: {
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        role: sessionUser.role,
        roleCode: sessionUser.roleCode,
        tenantId: sessionUser.tenantId,
      },
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Login API failed', error);
    const message = error instanceof Error ? error.message : 'Failed to login';
    const status = typeof message === 'string' && message.toLowerCase().includes('timed out') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
