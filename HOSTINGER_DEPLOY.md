# Hostinger Deployment (Supabase)

## 1) Environment variables (set in Hostinger)

Required:

- `DATABASE_URL` = your Supabase Postgres connection string
- `JWT_SECRET` = strong random secret
- `CREDENTIALS_SECRET` = strong random secret

Optional (required only if OneDrive sync is used):

- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- `ONEDRIVE_TENANT_ID`
- `ONEDRIVE_USER_ID`
- `ONEDRIVE_DRIVE_ID`

Important:

- Keep `CREDENTIALS_SECRET` stable between deployments, otherwise previously saved encrypted credentials cannot be decrypted.
- If `CREDENTIALS_SECRET` is not set, the app falls back to `JWT_SECRET` for credential encryption key derivation. For production, set both explicitly.
- This project is configured to use Prisma's JavaScript engine with the Postgres driver adapter. After pulling changes, install dependencies again so `@prisma/adapter-pg`, `pg`, and the Prisma 6 client are available.
- The Prisma adapter is configured with SSL enabled and relaxed certificate validation to support hosts that surface `self-signed certificate in certificate chain` errors when connecting to Supabase.

## 2) Install and build commands

```bash
npm install
npx prisma generate
npm run build
```

## 3) Database schema sync (Prisma)

This project currently has no Prisma migration folder, so apply schema with:

```bash
npx prisma db push
```

Run this whenever `prisma/schema.prisma` changes.

## 4) Start command

```bash
npm run start
```
