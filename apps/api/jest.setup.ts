process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/saltenanga';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
