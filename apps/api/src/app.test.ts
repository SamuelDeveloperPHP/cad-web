import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, type TestApp } from './test/makeTestApp.js';

// Garante o contrato basico da aplicacao: saude, readiness e rota inexistente.
describe('app', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await makeTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('responde 200 e status ok em GET /health', async () => {
    const res = await request(ctx.app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('responde 200 e status ready em GET /health/ready (banco acessivel)', async () => {
    const res = await request(ctx.app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('responde 404 em JSON para uma rota desconhecida', async () => {
    const res = await request(ctx.app).get('/rota-que-nao-existe');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
