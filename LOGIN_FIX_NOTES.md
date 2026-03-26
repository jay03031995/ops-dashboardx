# Login Fix Notes

## What changed

- Upgraded Prisma from `5.22.0` to `6.16.0`.
- Switched Prisma to the JavaScript engine with `engineType = "client"` in `prisma/schema.prisma`.
- Added PostgreSQL driver adapter support with `@prisma/adapter-pg` and `pg`.
- Updated `src/lib/prisma.ts` to initialize Prisma lazily with the Postgres adapter.
- Added an SSL override for hosts that fail with `self-signed certificate in certificate chain`.
- Added request timeouts to the login flow so the UI no longer hangs forever on `Signing in...`.
- Locked down session handling so production no longer accepts header-based auth fallbacks, and production JWT handling now requires `JWT_SECRET`.

## Why this fixes the issue

The previous login flow depended on Prisma's Rust query engine, which was panicking on the deployment host during `prisma.user.findUnique()`. The new setup uses Prisma's JavaScript engine with the Postgres adapter, which avoids that engine path.

## Files changed

- `package.json`
- `package-lock.json`
- `prisma/schema.prisma`
- `src/lib/prisma.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/admin/login/page.tsx`
- `HOSTINGER_DEPLOY.md`

## Deploy steps

```bash
npm install
npx prisma generate
npx prisma db push
npm run build
npm run start
```

## Required environment variables

- `DATABASE_URL`
- `JWT_SECRET`
- `CREDENTIALS_SECRET`
