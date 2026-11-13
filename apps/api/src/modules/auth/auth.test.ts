import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, type TestApp } from '../../test/makeTestApp.js';

describe('auth', () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await makeTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  const credentials = {
    tenantName: 'Acme Engenharia',
    email: 'admin@acme.com',
    password: 'segredo123',
  };

  it('registra empresa + admin e devolve um token', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/register').send(credentials);

    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe(credentials.email);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.tenant.name).toBe(credentials.tenantName);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejeita e-mail duplicado com 409', async () => {
    await request(ctx.app).post('/api/v1/auth/register').send(credentials);
    const res = await request(ctx.app).post('/api/v1/auth/register').send(credentials);

    expect(res.status).toBe(409);
  });

  it('faz login e acessa /me com o token', async () => {
    await request(ctx.app).post('/api/v1/auth/register').send(credentials);

    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    expect(login.status).toBe(200);

    const me = await request(ctx.app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(credentials.email);
    expect(me.body.tenant.name).toBe(credentials.tenantName);
  });

  it('recusa login com senha errada', async () => {
    await request(ctx.app).post('/api/v1/auth/register').send(credentials);

    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'senha-errada' });
    expect(res.status).toBe(401);
  });

  it('recusa /me sem token', async () => {
    const res = await request(ctx.app).get('/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('valida corpo invalido no registro com 422', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ tenantName: '', email: 'nao-e-email', password: '123' });
    expect(res.status).toBe(422);
  });
});
