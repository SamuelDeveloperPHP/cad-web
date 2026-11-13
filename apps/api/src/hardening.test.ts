import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { makeTestApp, type TestApp } from './test/makeTestApp.js';

// Exercita os middlewares de producao: helmet, x-powered-by e rate limit.
describe('hardening', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await makeTestApp({ rateLimit: true, logger: pino({ level: 'silent' }) });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('aplica cabecalhos de seguranca do helmet e esconde x-powered-by', async () => {
    const res = await request(ctx.app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('expoe cabecalhos de rate limit nas rotas de auth', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send({});

    const hasRateLimitHeader = Object.keys(res.headers).some((header) =>
      header.startsWith('ratelimit'),
    );
    expect(hasRateLimitHeader).toBe(true);
  });
});
