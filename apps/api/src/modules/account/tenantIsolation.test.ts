import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, type TestApp } from '../../test/makeTestApp.js';

describe('isolamento multiempresa', () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await makeTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function registerTenant(tenantName: string, email: string): Promise<string> {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ tenantName, email, password: 'segredo123' });
    return res.body.token as string;
  }

  it('cada token so enxerga os usuarios da sua propria empresa', async () => {
    const tokenA = await registerTenant('Empresa A', 'admin@a.com');
    const tokenB = await registerTenant('Empresa B', 'admin@b.com');

    const usersA = await request(ctx.app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`);
    const usersB = await request(ctx.app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(usersA.status).toBe(200);
    expect(usersA.body.users).toHaveLength(1);
    expect(usersA.body.users[0].email).toBe('admin@a.com');

    expect(usersB.body.users).toHaveLength(1);
    expect(usersB.body.users[0].email).toBe('admin@b.com');

    // Nenhum usuario da empresa B pode aparecer para a empresa A.
    const emailsA: string[] = usersA.body.users.map((u: { email: string }) => u.email);
    expect(emailsA).not.toContain('admin@b.com');
  });
});
