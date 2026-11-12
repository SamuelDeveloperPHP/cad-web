import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, type TestApp } from '../../test/makeTestApp.js';
import { createProject, registerAndLogin } from '../../test/helpers.js';

describe('merge requests', () => {
  let ctx: TestApp;
  let token: string;
  let drawingId: string;
  let mainId: string;

  beforeEach(async () => {
    ctx = await makeTestApp();
    token = await registerAndLogin(ctx.app, 'Acme Eng', 'admin@acme.com');
    const projectId = await createProject(ctx.app, token, 'Edificio A');
    const drawing = await request(ctx.app)
      .post(`/api/v1/projects/${projectId}/drawings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Planta', document: { version: 1 } });
    drawingId = drawing.body.drawing.id as string;
    const branches = await request(ctx.app)
      .get(`/api/v1/drawings/${drawingId}/branches`)
      .set('Authorization', `Bearer ${token}`);
    mainId = branches.body.branches.find((b: { name: string; id: string }) => b.name === 'main').id;
  });

  afterEach(async () => {
    await ctx.close();
  });

  const bearer = () => `Bearer ${token}`;

  function commit(branchId: string, message: string) {
    return request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/commits`)
      .set('Authorization', bearer())
      .send({ branchId, message });
  }

  // Prepara main com um commit, uma branch feature e um commit divergente nela.
  async function setupFeature(): Promise<{ c1: string; c2: string; featureId: string }> {
    const c1 = (await commit(mainId, 'base')).body.commit.id as string;
    const feature = await request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/branches`)
      .set('Authorization', bearer())
      .send({ name: 'feature', fromCommitId: c1 });
    const featureId = feature.body.branch.id as string;
    await request(ctx.app)
      .put(`/api/v1/drawings/${drawingId}`)
      .set('Authorization', bearer())
      .send({ document: { version: 2 } });
    const c2 = (await commit(featureId, 'feature change')).body.commit.id as string;
    return { c1, c2, featureId };
  }

  function openMr(featureId: string) {
    return request(ctx.app)
      .post(`/api/v1/drawings/${drawingId}/merge-requests`)
      .set('Authorization', bearer())
      .send({ sourceBranchId: featureId, targetBranchId: mainId, title: 'Traz a feature' });
  }

  it('calcula a base de merge (LCA) e os heads no detalhe', async () => {
    const { c1, c2, featureId } = await setupFeature();
    const mr = await openMr(featureId);
    expect(mr.status).toBe(201);

    const detail = await request(ctx.app)
      .get(`/api/v1/merge-requests/${mr.body.mergeRequest.id}`)
      .set('Authorization', bearer());
    expect(detail.status).toBe(200);
    expect(detail.body.sourceHeadCommitId).toBe(c2);
    expect(detail.body.targetHeadCommitId).toBe(c1);
    expect(detail.body.baseCommitId).toBe(c1);
  });

  it('aprova e mescla: cria um commit de merge com dois pais no destino', async () => {
    const { c1, c2, featureId } = await setupFeature();
    const mr = (await openMr(featureId)).body.mergeRequest;

    const review = await request(ctx.app)
      .post(`/api/v1/merge-requests/${mr.id}/reviews`)
      .set('Authorization', bearer())
      .send({ decision: 'approved' });
    expect(review.status).toBe(201);
    expect(review.body.status).toBe('approved');

    const merged = await request(ctx.app)
      .post(`/api/v1/merge-requests/${mr.id}/merge`)
      .set('Authorization', bearer())
      .send({ document: { version: 'merged' } });
    expect(merged.status).toBe(200);
    expect(merged.body.mergeRequest.status).toBe('merged');

    const mergeCommitId = merged.body.mergeRequest.mergeCommitId as string;
    const full = await request(ctx.app)
      .get(`/api/v1/commits/${mergeCommitId}`)
      .set('Authorization', bearer());
    expect(full.body.commit.parentId).toBe(c1);
    expect(full.body.commit.mergeParentId).toBe(c2);

    // A main agora aponta para o commit de merge.
    const history = await request(ctx.app)
      .get(`/api/v1/branches/${mainId}/commits`)
      .set('Authorization', bearer());
    expect(history.body.commits[0].id).toBe(mergeCommitId);
    expect(history.body.commits[0].message).toContain('Merge');
  });

  it('rejeicao impede o merge', async () => {
    const { featureId } = await setupFeature();
    const mr = (await openMr(featureId)).body.mergeRequest;

    await request(ctx.app)
      .post(`/api/v1/merge-requests/${mr.id}/reviews`)
      .set('Authorization', bearer())
      .send({ decision: 'rejected' });

    const merged = await request(ctx.app)
      .post(`/api/v1/merge-requests/${mr.id}/merge`)
      .set('Authorization', bearer())
      .send({ document: { version: 'x' } });
    expect(merged.status).toBe(409);
  });

  it('isola merge requests por empresa', async () => {
    const { featureId } = await setupFeature();
    const mr = (await openMr(featureId)).body.mergeRequest;
    const tokenB = await registerAndLogin(ctx.app, 'Beta Eng', 'admin@beta.com');

    const asB = await request(ctx.app)
      .get(`/api/v1/merge-requests/${mr.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(asB.status).toBe(404);
  });
});
