export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'development-secret';
  }

  throw new Error('JWT_SECRET is missing on server');
}

export function allowHeaderSessionFallback() {
  return process.env.NODE_ENV !== 'production';
}
