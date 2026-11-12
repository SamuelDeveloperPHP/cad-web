import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, type TestApp } from '../../test/makeTestApp.js';
import { createProject, registerAndLogin } from '../../test/helpers.js';

describe('versionamento (branches e commits)', () => {
  let ctx: TestApp;
  let token: string;
  let drawingId: string;

  beforeEach(async () => {
    ctx = await makeTestApp();
    token = await registerAndLogin(ctx.app, 'Acme Eng', 'admin@acme.com');
    const projectId = await createProject(ctx.app, token, 'Edificio A');
    const created = await request(ctx.app)
      .post(`/api/v1/projects/${projectId}/drawings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Planta', document: { version: 1 } });
    drawingId = created.body.drawing.id as string;
  });

  afterEach(async () => {
    await ctx.close();
  });

  const auth = () => `Bearer ${token}`;

  async function mainBranchId(): Promise<string> {
    const res = await request(ctx.app)
      .get(`/api/v1/drawings/${drawingId}/branches`)
      .set('Authorization', auth());
    const main = res.body.branches.find((b: { name: string; id: string }) => b.name === 'main');
    return main.id as string;
  }

  function commit(branchId: string, message: string) {
    return request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/commits`)
      .set('Authorization', auth())
      .send({ branchId, message });
  }

  function saveWorking(document: Record<string, unknown>) {
    return request(ctx.app)
      .put(`/api/v1/drawings/${drawingId}`)
      .set('Authorization', auth())
      .send({ document });
  }

  it('cria a branch main junto com o desenho', async () => {
    const res = await request(ctx.app)
      .get(`/api/v1/drawings/${drawingId}/branches`)
      .set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body.branches.map((b: { name: string }) => b.name)).toContain('main');
  });

  it('commita snapshots e monta o historico com parent encadeado', async () => {
    const branchId = await mainBranchId();

    const c1 = await commit(branchId, 'inicial');
    expect(c1.status).toBe(201);
    expect(c1.body.commit.parentId).toBeNull();

    await saveWorking({ version: 2 });
    const c2 = await commit(branchId, 'segundo');
    expect(c2.status).toBe(201);
    expect(c2.body.commit.parentId).toBe(c1.body.commit.id);

    const hist = await request(ctx.app)
      .get(`/api/v1/branches/${branchId}/commits`)
      .set('Authorization', auth());
    expect(hist.body.commits.map((c: { message: string }) => c.message)).toEqual([
      'segundo',
      'inicial',
    ]);
    expect(hist.body.commits[0].authorEmail).toBe('admin@acme.com');

    // O commit guarda o snapshot imutavel daquele momento.
    const full = await request(ctx.app)
      .get(`/api/v1/commits/${c1.body.commit.id}`)
      .set('Authorization', auth());
    expect(full.body.commit.document).toEqual({ version: 1 });
  });

  it('checkout restaura o documento de trabalho para um commit antigo', async () => {
    const branchId = await mainBranchId();
    const c1 = await commit(branchId, 'v1');
    await saveWorking({ version: 999 });

    const checkout = await request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/checkout`)
      .set('Authorization', auth())
      .send({ commitId: c1.body.commit.id });

    expect(checkout.status).toBe(200);
    expect(checkout.body.drawing.document).toEqual({ version: 1 });
  });

  it('cria uma branch a partir de um commit e recusa nome duplicado', async () => {
    const branchId = await mainBranchId();
    const c1 = await commit(branchId, 'base');

    const branch = await request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/branches`)
      .set('Authorization', auth())
      .send({ name: 'revisao-2', fromCommitId: c1.body.commit.id });
    expect(branch.status).toBe(201);
    expect(branch.body.branch.headCommitId).toBe(c1.body.commit.id);

    const dup = await request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/branches`)
      .set('Authorization', auth())
      .send({ name: 'revisao-2' });
    expect(dup.status).toBe(409);
  });

  it('isola o versionamento por empresa (B nao commita nem le o de A)', async () => {
    const branchId = await mainBranchId();
    const tokenB = await registerAndLogin(ctx.app, 'Beta Eng', 'admin@beta.com');

    const commitB = await request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/commits`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ branchId, message: 'invasao' });
    expect(commitB.status).toBe(404);

    const histB = await request(ctx.app)
      .get(`/api/v1/branches/${branchId}/commits`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(histB.status).toBe(404);
  });
});
