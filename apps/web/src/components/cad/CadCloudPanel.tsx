import { useEffect, useState, type FormEvent } from "react";
import type { CadDocument } from "@cad-web/cad-core";
import { parseCadDocument, serializeCadDocument } from "@cad-web/cad-io";
import { Cloud, FolderPlus, LogOut, RefreshCw, Save, UploadCloud, X } from "lucide-react";
import {
  api,
  ApiError,
  getToken,
  setToken,
  type ApiDrawingMeta,
  type ApiProject,
  type ApiTenant,
  type ApiUser,
} from "../../services/apiClient";
import { CadHistorySection } from "./CadHistorySection";
import { CadMergeRequestsSection } from "./CadMergeRequestsSection";

// Parte do store usada pelo painel: ler o documento atual e carregar outro.
export interface CloudPanelCad {
  document: CadDocument;
  importDocument(document: CadDocument, options?: Readonly<{ zoomToFit?: boolean }>): void;
}

type CadCloudPanelProps = Readonly<{
  cad: CloudPanelCad;
  open: boolean;
  onClose(): void;
}>;

// Converte o documento nativo em objeto JSON para enviar ao servidor.
function documentToPayload(document: CadDocument): Record<string, unknown> {
  return JSON.parse(serializeCadDocument(document)) as Record<string, unknown>;
}

// Converte o documento guardado no servidor de volta para o documento nativo.
function payloadToDocument(payload: Record<string, unknown>): CadDocument {
  return parseCadDocument(JSON.stringify(payload));
}

export function CadCloudPanel({ cad, open, onClose }: CadCloudPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");

  const [session, setSession] = useState<{ user: ApiUser; tenant: ApiTenant | null } | null>(null);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<ApiDrawingMeta[]>([]);
  const [currentDrawing, setCurrentDrawing] = useState<{ id: string; name: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Ao abrir com um token guardado, valida a sessao e carrega os projetos.
  useEffect(() => {
    if (!open || session !== null || getToken() === null) {
      return;
    }

    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const me = await api.me();
        const { projects: list } = await api.listProjects();
        if (cancelled) {
          return;
        }
        setSession(me);
        setProjects(list);
      } catch (err) {
        if (!cancelled) {
          // Token invalido/expirado: limpa e volta ao login.
          if (err instanceof ApiError && err.status === 401) {
            setToken(null);
          }
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, session]);

  if (!open) {
    return null;
  }

  const fail = (err: unknown): void => {
    setError(err instanceof Error ? err.message : "Erro inesperado.");
    setNotice(null);
  };

  const refreshProjects = async (): Promise<void> => {
    const { projects: list } = await api.listProjects();
    setProjects(list);
  };

  const loadDrawings = async (projectId: string): Promise<void> => {
    setSelectedProjectId(projectId);
    const { drawings: list } = await api.listDrawings(projectId);
    setDrawings(list);
  };

  const handleAuth = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result =
        mode === "register"
          ? await api.register(tenantName, email, password)
          : await api.login(email, password);
      setToken(result.token);
      setSession({ user: result.user, tenant: result.tenant });
      setPassword("");
      await refreshProjects();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = (): void => {
    setToken(null);
    setSession(null);
    setProjects([]);
    setDrawings([]);
    setSelectedProjectId(null);
    setCurrentDrawing(null);
    setNotice(null);
    setError(null);
  };

  const handleCreateProject = async (): Promise<void> => {
    const name = window.prompt("Nome do novo projeto")?.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.createProject(name);
      await refreshProjects();
      await loadDrawings(project.id);
      setNotice(`Projeto "${project.name}" criado.`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDrawing = async (drawing: ApiDrawingMeta): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { drawing: full } = await api.getDrawing(drawing.id);
      cad.importDocument(payloadToDocument(full.document), { zoomToFit: true });
      setCurrentDrawing({ id: full.id, name: full.name });
      setNotice(`Desenho "${full.name}" aberto.`);
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAsNew = async (): Promise<void> => {
    if (selectedProjectId === null) {
      setError("Selecione um projeto antes de salvar.");
      return;
    }
    const name = window.prompt("Nome do desenho")?.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { drawing } = await api.createDrawing(
        selectedProjectId,
        name,
        documentToPayload(cad.document),
      );
      setCurrentDrawing({ id: drawing.id, name: drawing.name });
      await loadDrawings(selectedProjectId);
      setNotice(`Desenho "${drawing.name}" salvo no servidor.`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCurrent = async (): Promise<void> => {
    if (currentDrawing === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveDrawing(currentDrawing.id, currentDrawing.name, documentToPayload(cad.document));
      setNotice(`Desenho "${currentDrawing.name}" atualizado.`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cad-cloud-overlay" role="dialog" aria-modal="true" aria-label="Desenhos na nuvem">
      <div className="cad-cloud-panel">
        <header className="cad-cloud-header">
          <span className="cad-cloud-title">
            <Cloud size={16} /> Nuvem
          </span>
          <button type="button" className="cad-cloud-icon" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="cad-cloud-body">
          {error !== null && <p className="cad-cloud-msg error">{error}</p>}
          {notice !== null && <p className="cad-cloud-msg notice">{notice}</p>}

          {session === null ? (
            <form className="cad-cloud-form" onSubmit={handleAuth}>
              <div className="cad-cloud-tabs">
                <button
                  type="button"
                  className={mode === "login" ? "active" : ""}
                  onClick={() => setMode("login")}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={mode === "register" ? "active" : ""}
                  onClick={() => setMode("register")}
                >
                  Criar empresa
                </button>
              </div>

              {mode === "register" && (
                <label className="cad-cloud-field">
                  Empresa
                  <input
                    className="cad-cloud-input"
                    value={tenantName}
                    onChange={(event) => setTenantName(event.target.value)}
                    required
                  />
                </label>
              )}
              <label className="cad-cloud-field">
                E-mail
                <input
                  className="cad-cloud-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="cad-cloud-field">
                Senha
                <input
                  className="cad-cloud-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={mode === "register" ? 8 : 1}
                />
              </label>

              <button type="submit" className="cad-cloud-btn primary" disabled={busy}>
                {mode === "register" ? "Criar e entrar" : "Entrar"}
              </button>
            </form>
          ) : (
            <>
              <div className="cad-cloud-account">
                <span>
                  {session.user.email}
                  {session.tenant !== null && <em> · {session.tenant.name}</em>}
                </span>
                <button type="button" className="cad-cloud-ghost" onClick={handleLogout}>
                  <LogOut size={14} /> Sair
                </button>
              </div>

              <section className="cad-cloud-section">
                <div className="cad-cloud-section-head">
                  <h3>Projetos</h3>
                  <button type="button" className="cad-cloud-ghost" onClick={handleCreateProject} disabled={busy}>
                    <FolderPlus size={14} /> Novo
                  </button>
                </div>
                <div className="cad-cloud-list">
                  {projects.length === 0 && <p className="cad-cloud-empty">Nenhum projeto ainda.</p>}
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className={`cad-cloud-item ${project.id === selectedProjectId ? "active" : ""}`}
                      onClick={() => void loadDrawings(project.id)}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              </section>

              {selectedProjectId !== null && (
                <section className="cad-cloud-section">
                  <div className="cad-cloud-section-head">
                    <h3>Desenhos</h3>
                    <button
                      type="button"
                      className="cad-cloud-ghost"
                      onClick={() => void loadDrawings(selectedProjectId)}
                      disabled={busy}
                    >
                      <RefreshCw size={14} /> Atualizar
                    </button>
                  </div>
                  <div className="cad-cloud-list">
                    {drawings.length === 0 && <p className="cad-cloud-empty">Nenhum desenho neste projeto.</p>}
                    {drawings.map((drawing) => (
                      <button
                        key={drawing.id}
                        type="button"
                        className={`cad-cloud-item ${drawing.id === currentDrawing?.id ? "active" : ""}`}
                        onClick={() => void handleOpenDrawing(drawing)}
                      >
                        {drawing.name}
                      </button>
                    ))}
                  </div>

                  <div className="cad-cloud-actions">
                    <button type="button" className="cad-cloud-btn primary" onClick={() => void handleSaveAsNew()} disabled={busy}>
                      <UploadCloud size={14} /> Salvar como novo
                    </button>
                    <button
                      type="button"
                      className="cad-cloud-btn"
                      onClick={() => void handleSaveCurrent()}
                      disabled={busy || currentDrawing === null}
                      title={currentDrawing === null ? "Abra ou salve um desenho primeiro" : `Atualizar "${currentDrawing.name}"`}
                    >
                      <Save size={14} /> Salvar {currentDrawing !== null ? `"${currentDrawing.name}"` : ""}
                    </button>
                  </div>
                </section>
              )}

              {currentDrawing !== null && (
                <CadHistorySection
                  cad={cad}
                  drawingId={currentDrawing.id}
                  onError={setError}
                  onNotice={setNotice}
                />
              )}

              {currentDrawing !== null && (
                <CadMergeRequestsSection
                  cad={cad}
                  drawingId={currentDrawing.id}
                  onError={setError}
                  onNotice={setNotice}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
