import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

// Garante o contrato minimo do backend recem-criado.
describe('app', () => {
  const app = createApp();

  it('responde 200 e status ok em GET /health', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('responde 404 em JSON para uma rota desconhecida', async () => {
    const res = await request(app).get('/rota-que-nao-existe');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
