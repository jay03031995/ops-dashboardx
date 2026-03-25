import crypto from 'crypto';

const SECRET_ENV = 'CREDENTIALS_SECRET';

function getKey(): Buffer {
  const raw = process.env[SECRET_ENV] || process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(`${SECRET_ENV}_MISSING`);
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptCredential(value: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptCredential(payload: string): string {
  const key = getKey();
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length < 12 + 16) {
    throw new Error('INVALID_PAYLOAD');
  }
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
