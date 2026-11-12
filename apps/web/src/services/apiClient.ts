// Cliente da API do backend CAD-WEB (apps/api). Concentra a URL base, o token
// de acesso (guardado em localStorage) e as chamadas REST usadas pela interface.

// A URL base e configuravel por VITE_API_URL; o padrao aponta para o backend local.
const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:3333";
const API_BASE = RAW_BASE.replace(/\/+$/, "");

const TOKEN_KEY = "cad-web:auth-token";

/** Le o token de acesso guardado (ou null). */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Guarda (ou remove, com null) o token de acesso. */
export function setToken(token: string | null): void {
  try {
    if (token === null) {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    // A persistencia do token e melhor esforco.
  }
}

export interface ApiUser {
  id: string;
  email: string;
  role: string;
  tenantId: string;
}

export interface ApiTenant {
  id: string;
  name: string;
}

export interface ApiProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDrawingMeta {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDrawing extends ApiDrawingMeta {
  document: Record<string, unknown>;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
  tenant: ApiTenant;
}

/** Erro de API com o status HTTP, para a interface decidir a mensagem. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

// Faz a requisicao, injeta o token quando pedido e normaliza erros em ApiError.
async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.auth === true) {
    const token = getToken();
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "Nao foi possivel conectar ao servidor.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data: unknown = text.length > 0 ? JSON.parse(text) : null;

  if (!response.ok) {
    const record = (data ?? {}) as { message?: unknown; error?: unknown };
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record.error === "string"
          ? record.error
          : `Erro ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}

/** Operacoes da API usadas pela interface. */
export const api = {
  register(tenantName: string, email: string, password: string): Promise<AuthResponse> {
    return apiFetch<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: { tenantName, email, password },
    });
  },
  login(email: string, password: string): Promise<AuthResponse> {
    return apiFetch<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });
  },
  me(): Promise<{ user: ApiUser; tenant: ApiTenant | null }> {
    return apiFetch<{ user: ApiUser; tenant: ApiTenant | null }>("/api/v1/me", { auth: true });
  },
  listProjects(): Promise<{ projects: ApiProject[] }> {
    return apiFetch<{ projects: ApiProject[] }>("/api/v1/projects", { auth: true });
  },
  createProject(name: string): Promise<{ project: ApiProject }> {
    return apiFetch<{ project: ApiProject }>("/api/v1/projects", {
      method: "POST",
      body: { name },
      auth: true,
    });
  },
  listDrawings(projectId: string): Promise<{ drawings: ApiDrawingMeta[] }> {
    return apiFetch<{ drawings: ApiDrawingMeta[] }>(`/api/v1/projects/${projectId}/drawings`, {
      auth: true,
    });
  },
  createDrawing(
    projectId: string,
    name: string,
    document: Record<string, unknown>,
  ): Promise<{ drawing: ApiDrawing }> {
    return apiFetch<{ drawing: ApiDrawing }>(`/api/v1/projects/${projectId}/drawings`, {
      method: "POST",
      body: { name, document },
      auth: true,
    });
  },
  getDrawing(id: string): Promise<{ drawing: ApiDrawing }> {
    return apiFetch<{ drawing: ApiDrawing }>(`/api/v1/drawings/${id}`, { auth: true });
  },
  saveDrawing(
    id: string,
    name: string,
    document: Record<string, unknown>,
  ): Promise<{ drawing: ApiDrawing }> {
    return apiFetch<{ drawing: ApiDrawing }>(`/api/v1/drawings/${id}`, {
      method: "PUT",
      body: { name, document },
      auth: true,
    });
  },
};
