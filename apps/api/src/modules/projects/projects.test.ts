import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, type TestApp } from '../../test/makeTestApp.js';
import { registerAndLogin } from '../../test/helpers.js';

describe('projects', () => {
  let ctx: TestApp;
  let token: string;

  beforeEach(async () => {
    ctx = await makeTestApp();
    token = await registerAndLogin(ctx.app, 'Acme Eng', 'admin@acme.com');
  });

  afterEach(async () => {
    await ctx.close();
  });

  const auth = () => `Bearer ${token}`;

  it('cria, lista, detalha, renomeia e remove um projeto', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/projects')
      .set('Authorization', auth())
      .send({ name: 'Edificio A' });
    expect(created.status).toBe(201);
    expect(created.body.project.name).toBe('Edificio A');
    const id = created.body.project.id as string;

    const list = await request(ctx.app).get('/api/v1/projects').set('Authorization', auth());
    expect(list.status).toBe(200);
    expect(list.body.projects).toHaveLength(1);

    const detail = await request(ctx.app)
      .get(`/api/v1/projects/${id}`)
      .set('Authorization', auth());
    expect(detail.status).toBe(200);
    expect(detail.body.project.id).toBe(id);

    const renamed = await request(ctx.app)
      .patch(`/api/v1/projects/${id}`)
      .set('Authorization', auth())
      .send({ name: 'Edificio B' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.project.name).toBe('Edificio B');

    const removed = await request(ctx.app)
      .delete(`/api/v1/projects/${id}`)
      .set('Authorization', auth());
    expect(removed.status).toBe(204);

    const gone = await request(ctx.app).get(`/api/v1/projects/${id}`).set('Authorization', auth());
    expect(gone.status).toBe(404);
  });

  it('valida o corpo com 422 e exige token', async () => {
    const invalid = await request(ctx.app)
      .post('/api/v1/projects')
      .set('Authorization', auth())
      .send({ name: '' });
    expect(invalid.status).toBe(422);

    const noAuth = await request(ctx.app).get('/api/v1/projects');
    expect(noAuth.status).toBe(401);
  });

  it('isola projetos por empresa (A nao enxerga o de B)', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/projects')
      .set('Authorization', auth())
      .send({ name: 'Projeto da Empresa A' });
    const idA = created.body.project.id as string;

    const tokenB = await registerAndLogin(ctx.app, 'Beta Eng', 'admin@beta.com');

    const asB = await request(ctx.app)
      .get(`/api/v1/projects/${idA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(asB.status).toBe(404);

    const listB = await request(ctx.app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listB.body.projects).toHaveLength(0);
  });
});
