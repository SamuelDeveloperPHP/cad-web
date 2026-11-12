import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, type TestApp } from '../../test/makeTestApp.js';
import { createProject, registerAndLogin } from '../../test/helpers.js';

describe('drawings', () => {
  let ctx: TestApp;
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    ctx = await makeTestApp();
    token = await registerAndLogin(ctx.app, 'Acme Eng', 'admin@acme.com');
    projectId = await createProject(ctx.app, token, 'Edificio A');
  });

  afterEach(async () => {
    await ctx.close();
  });

  const auth = () => `Bearer ${token}`;

  it('cria, lista (sem documento), le, salva e remove um desenho', async () => {
    const doc = { version: 1, entities: [{ type: 'line', a: [0, 0], b: [10, 0] }] };

    const created = await request(ctx.app)
      .post(`/api/v1/projects/${projectId}/drawings`)
      .set('Authorization', auth())
      .send({ name: 'Planta baixa', document: doc });
    expect(created.status).toBe(201);
    expect(created.body.drawing.name).toBe('Planta baixa');
    const id = created.body.drawing.id as string;

    const list = await request(ctx.app)
      .get(`/api/v1/projects/${projectId}/drawings`)
      .set('Authorization', auth());
    expect(list.status).toBe(200);
    expect(list.body.drawings).toHaveLength(1);
    // A listagem e leve: nao traz o documento.
    expect(list.body.drawings[0]).not.toHaveProperty('document');

    const read = await request(ctx.app).get(`/api/v1/drawings/${id}`).set('Authorization', auth());
    expect(read.status).toBe(200);
    expect(read.body.drawing.document).toEqual(doc);

    const novo = { version: 2, entities: [] };
    const saved = await request(ctx.app)
      .put(`/api/v1/drawings/${id}`)
      .set('Authorization', auth())
      .send({ document: novo });
    expect(saved.status).toBe(200);

    const reread = await request(ctx.app)
      .get(`/api/v1/drawings/${id}`)
      .set('Authorization', auth());
    expect(reread.body.drawing.document).toEqual(novo);

    const removed = await request(ctx.app)
      .delete(`/api/v1/drawings/${id}`)
      .set('Authorization', auth());
    expect(removed.status).toBe(204);

    const gone = await request(ctx.app).get(`/api/v1/drawings/${id}`).set('Authorization', auth());
    expect(gone.status).toBe(404);
  });

  it('nao cria desenho em projeto inexistente', async () => {
    const fakeProject = '00000000-0000-0000-0000-000000000000';
    const res = await request(ctx.app)
      .post(`/api/v1/projects/${fakeProject}/drawings`)
      .set('Authorization', auth())
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('isola desenhos por empresa (B nao le nem salva o de A)', async () => {
    const created = await request(ctx.app)
      .post(`/api/v1/projects/${projectId}/drawings`)
      .set('Authorization', auth())
      .send({ name: 'Secreto', document: { s: 1 } });
    const idA = created.body.drawing.id as string;

    const tokenB = await registerAndLogin(ctx.app, 'Beta Eng', 'admin@beta.com');

    const readB = await request(ctx.app)
      .get(`/api/v1/drawings/${idA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(readB.status).toBe(404);

    const saveB = await request(ctx.app)
      .put(`/api/v1/drawings/${idA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ document: { hackeado: true } });
    expect(saveB.status).toBe(404);
  });
});
