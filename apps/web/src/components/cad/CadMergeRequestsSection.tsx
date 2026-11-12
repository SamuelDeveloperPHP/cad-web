import { useEffect, useState } from "react";
import type { CadDocument } from "@cad-web/cad-core";
import { createEmptyDocument, mergeDocuments } from "@cad-web/cad-core";
import { parseCadDocument, serializeCadDocument } from "@cad-web/cad-io";
import { Check, GitMerge, GitPullRequest, X } from "lucide-react";
import { api, type ApiBranch, type ApiMergeRequest } from "../../services/apiClient";
import type { CloudPanelCad } from "./CadCloudPanel";

type CadMergeRequestsSectionProps = Readonly<{
  cad: CloudPanelCad;
  drawingId: string;
  onError(message: string): void;
  onNotice(message: string): void;
}>;

function toPayload(document: CadDocument): Record<string, unknown> {
  return JSON.parse(serializeCadDocument(document)) as Record<string, unknown>;
}

function fromPayload(payload: Record<string, unknown>): CadDocument {
  return parseCadDocument(JSON.stringify(payload));
}

/** Secao de merge requests de um desenho aberto na nuvem. */
export function CadMergeRequestsSection({ cad, drawingId, onError, onNotice }: CadMergeRequestsSectionProps) {
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [list, setList] = useState<ApiMergeRequest[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflictMrId, setConflictMrId] = useState<string | null>(null);

  const reload = async (): Promise<void> => {
    const [branchesResult, mrResult] = await Promise.all([
      api.listBranches(drawingId),
      api.listMergeRequests(drawingId),
    ]);
    setBranches(branchesResult.branches);
    setList(mrResult.mergeRequests);
  };

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const [branchesResult, mrResult] = await Promise.all([
          api.listBranches(drawingId),
          api.listMergeRequests(drawingId),
        ]);
        if (cancelled) {
          return;
        }
        setBranches(branchesResult.branches);
        setList(mrResult.mergeRequests);
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "Erro ao carregar os merge requests.");
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

  const createMr = async (): Promise<void> => {
    if (sourceId === "" || targetId === "" || title.trim() === "") {
      onError("Preencha origem, destino e titulo.");
      return;
    }
    if (sourceId === targetId) {
      onError("Origem e destino devem ser diferentes.");
      return;
    }
    setBusy(true);
    try {
      await api.createMergeRequest(drawingId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
        title: title.trim(),
      });
      setTitle("");
      await reload();
      onNotice("Merge request aberto.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao abrir o merge request.");
    } finally {
      setBusy(false);
    }
  };

  const review = async (mr: ApiMergeRequest, decision: "approved" | "rejected"): Promise<void> => {
    setBusy(true);
    try {
      await api.reviewMergeRequest(mr.id, decision);
      await reload();
      onNotice(decision === "approved" ? "Merge request aprovado." : "Merge request rejeitado.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao revisar.");
    } finally {
      setBusy(false);
    }
  };

  const loadDoc = async (commitId: string): Promise<CadDocument> => {
    const { commit } = await api.getCommit(commitId);
    return fromPayload(commit.document);
  };

  const merge = async (mr: ApiMergeRequest, takeSource: boolean): Promise<void> => {
    setBusy(true);
    try {
      const detail = await api.getMergeRequest(mr.id);
      if (detail.sourceHeadCommitId === null) {
        onError("A branch de origem nao tem commits.");
        return;
      }
      const theirs = await loadDoc(detail.sourceHeadCommitId);

      if (takeSource) {
        await api.mergeMergeRequest(mr.id, toPayload(theirs));
        cad.importDocument(theirs, { zoomToFit: true });
        setConflictMrId(null);
        await reload();
        onNotice("Merge concluido (aceitando a origem).");
        return;
      }

      const ours =
        detail.targetHeadCommitId !== null
          ? await loadDoc(detail.targetHeadCommitId)
          : createEmptyDocument("empty");
      const base =
        detail.baseCommitId !== null
          ? await loadDoc(detail.baseCommitId)
          : createEmptyDocument("empty");

      const result = mergeDocuments(base, ours, theirs);
      if (result.merged === null) {
        setConflictMrId(mr.id);
        onError(
          `${result.conflicts.length} conflito(s) de entidade. Use "aceitar origem" para resolver.`,
        );
        return;
      }

      await api.mergeMergeRequest(mr.id, toPayload(result.merged));
      cad.importDocument(result.merged, { zoomToFit: true });
      setConflictMrId(null);
      await reload();
      onNotice("Merge concluido.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao mesclar.");
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string): string => branches.find((branch) => branch.id === id)?.name ?? "—";

  return (
    <section className="cad-cloud-section">
      <div className="cad-cloud-section-head">
        <h3>
          <GitPullRequest size={14} /> Merge requests
        </h3>
      </div>

      <div className="cad-mr-form">
        <select
          className="cad-cloud-input"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          aria-label="Branch de origem"
        >
          <option value="">Origem…</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select
          className="cad-cloud-input"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          aria-label="Branch de destino"
        >
          <option value="">Destino…</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <input
          className="cad-cloud-input"
          placeholder="Titulo do merge request"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="button" className="cad-cloud-btn primary" onClick={() => void createMr()} disabled={busy}>
          Abrir MR
        </button>
      </div>

      <div className="cad-cloud-list">
        {list.length === 0 && <p className="cad-cloud-empty">Nenhum merge request.</p>}
        {list.map((mr) => (
          <div key={mr.id} className="cad-mr-item">
            <div className="cad-mr-main">
              <span className="cad-hist-msg">{mr.title}</span>
              <span className="cad-hist-meta">
                {nameOf(mr.sourceBranchId)} → {nameOf(mr.targetBranchId)} ·{" "}
                <span className={`cad-mr-status ${mr.status}`}>{mr.status}</span>
              </span>
            </div>
            {mr.status !== "merged" && mr.status !== "rejected" && (
              <div className="cad-mr-actions">
                <button
                  type="button"
                  className="cad-cloud-ghost"
                  onClick={() => void review(mr, "approved")}
                  disabled={busy}
                  title="Aprovar"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  className="cad-cloud-ghost"
                  onClick={() => void review(mr, "rejected")}
                  disabled={busy}
                  title="Rejeitar"
                >
                  <X size={13} />
                </button>
                <button
                  type="button"
                  className="cad-cloud-ghost"
                  onClick={() => void merge(mr, false)}
                  disabled={busy}
                  title="Mesclar (3-vias)"
                >
                  <GitMerge size={13} />
                </button>
                {conflictMrId === mr.id && (
                  <button
                    type="button"
                    className="cad-cloud-ghost"
                    onClick={() => void merge(mr, true)}
                    disabled={busy}
                    title="Mesclar aceitando a origem (resolve conflitos)"
                  >
                    origem
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
