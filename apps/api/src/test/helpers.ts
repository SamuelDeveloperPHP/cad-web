import request from 'supertest';
import type { Express } from 'express';

/** Registra uma empresa + admin e devolve o token de acesso. */
export async function registerAndLogin(
  app: Express,
  tenantName: string,
  email: string,
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ tenantName, email, password: 'segredo123' });
  return res.body.token as string;
}

/** Cria um projeto e devolve o id. */
export async function createProject(app: Express, token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body.project.id as string;
}
