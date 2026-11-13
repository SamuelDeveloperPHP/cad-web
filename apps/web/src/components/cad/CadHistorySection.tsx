import { useEffect, useState } from "react";
import type { CadDocument } from "@cad-web/cad-core";
import { createEmptyDocument, diffDocuments } from "@cad-web/cad-core";
import { parseCadDocument } from "@cad-web/cad-io";
import { Eye, GitBranch, GitCommit, GitCompare } from "lucide-react";
import { api, type ApiBranch, type ApiCommitMeta } from "../../services/apiClient";
import type { CloudPanelCad } from "./CadCloudPanel";

type CadHistorySectionProps = Readonly<{
  cad: CloudPanelCad;
  drawingId: string;
  onError(message: string): void;
  onNotice(message: string): void;
}>;

// Converte o documento guardado no servidor de volta para o documento nativo.
function payloadToDocument(payload: Record<string, unknown>): CadDocument {
  return parseCadDocument(JSON.stringify(payload));
}

interface DiffSummary {
  commitId: string;
  added: number;
  removed: number;
  modified: number;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Secao de historico (branches e commits) de um desenho aberto na nuvem. */
export function CadHistorySection({ cad, drawingId, onError, onNotice }: CadHistorySectionProps) {
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [commits, setCommits] = useState<ApiCommitMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<DiffSummary | null>(null);

  // Carrega branches e o historico ao abrir (ou trocar de) desenho.
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setDiff(null);
    void (async () => {
      try {
        const { branches: list } = await api.listBranches(drawingId);
        if (cancelled) {
          return;
        }
        setBranches(list);
        const main = list.find((branch) => branch.name === "main") ?? list[0];
        const selected = main ? main.id : null;
        setBranchId(selected);
        if (selected !== null) {
          const { commits: history } = await api.listBranchCommits(selected);
          if (!cancelled) {
            setCommits(history);
          }
        } else {
          setCommits([]);
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "Erro ao carregar o historico.");
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
  }, [drawingId, onError]);

  const reloadCommits = async (branch: string): Promise<void> => {
    const { commits: history } = await api.listBranchCommits(branch);
    setCommits(history);
  };

  const selectBranch = async (branch: ApiBranch): Promise<void> => {
    setBranchId(branch.id);
    setDiff(null);
    setBusy(true);
    try {
      await reloadCommits(branch.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao carregar commits.");
    } finally {
      setBusy(false);
    }
  };

  const doCommit = async (): Promise<void> => {
    if (branchId === null) {
      return;
    }
    const message = window.prompt("Mensagem do commit")?.trim();
    if (!message) {
      return;
    }
    setBusy(true);
    try {
      await api.createCommit(drawingId, branchId, message);
      const { branches: list } = await api.listBranches(drawingId);
      setBranches(list);
      await reloadCommits(branchId);
      onNotice("Commit criado.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao commitar.");
    } finally {
      setBusy(false);
    }
  };

  const doNewBranch = async (): Promise<void> => {
    const name = window.prompt("Nome da nova branch")?.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    try {
      const { branch } = await api.createBranch(drawingId, name);
      const { branches: list } = await api.listBranches(drawingId);
      setBranches(list);
      await selectBranch(branch);
      onNotice(`Branch "${branch.name}" criada.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao criar a branch.");
    } finally {
      setBusy(false);
    }
  };

  const openCommit = async (commit: ApiCommitMeta): Promise<void> => {
    setBusy(true);
    try {
      const { commit: full } = await api.getCommit(commit.id);
      cad.importDocument(payloadToDocument(full.document), { zoomToFit: true });
      onNotice(`Commit aberto no editor: ${commit.message}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao abrir o commit.");
    } finally {
      setBusy(false);
    }
  };

  const showDiff = async (commit: ApiCommitMeta): Promise<void> => {
    setBusy(true);
    try {
      const { commit: full } = await api.getCommit(commit.id);
      const after = payloadToDocument(full.document);
      let before: CadDocument;
      if (full.parentId !== null) {
        const { commit: parent } = await api.getCommit(full.parentId);
        before = payloadToDocument(parent.document);
      } else {
        before = createEmptyDocument("empty");
      }
      const result = diffDocuments(before, after);
      setDiff({
        commitId: commit.id,
        added: result.added.length,
        removed: result.removed.length,
        modified: result.modified.length,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao calcular as mudancas.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cad-cloud-section">
      <div className="cad-cloud-section-head">
        <h3>Histórico</h3>
        <div className="cad-hist-actions">
          <button
            type="button"
            className="cad-cloud-ghost"
            onClick={() => void doNewBranch()}
            disabled={busy}
          >
            <GitBranch size={14} /> Branch
          </button>
          <button
            type="button"
            className="cad-cloud-ghost"
            onClick={() => void doCommit()}
            disabled={busy || branchId === null}
          >
            <GitCommit size={14} /> Commit
          </button>
        </div>
      </div>

      <div className="cad-hist-branches">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            className={`cad-hist-branch ${branch.id === branchId ? "active" : ""}`}
            onClick={() => void selectBranch(branch)}
          >
            <GitBranch size={12} /> {branch.name}
          </button>
        ))}
      </div>

      <div className="cad-cloud-list">
        {commits.length === 0 && <p className="cad-cloud-empty">Nenhum commit nesta branch.</p>}
        {commits.map((commit) => (
          <div key={commit.id} className="cad-hist-commit">
            <div className="cad-hist-commit-main">
              <span className="cad-hist-msg">{commit.message}</span>
              <span className="cad-hist-meta">
                {commit.authorEmail ?? "—"} · {formatTime(commit.createdAt)}
              </span>
              {diff !== null && diff.commitId === commit.id && (
                <span className="cad-hist-diff">
                  +{diff.added} / −{diff.removed} / ~{diff.modified}
                </span>
              )}
            </div>
            <div className="cad-hist-commit-actions">
              <button
                type="button"
                className="cad-cloud-ghost"
                onClick={() => void openCommit(commit)}
                disabled={busy}
                title="Abrir no editor"
              >
                <Eye size={13} />
              </button>
              <button
                type="button"
                className="cad-cloud-ghost"
                onClick={() => void showDiff(commit)}
                disabled={busy}
                title="Ver mudanças (vs. commit anterior)"
              >
                <GitCompare size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
