import { useEffect, useId, useRef, useState } from "react";
import { KeyRound, RefreshCw, Save, Server } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  configureSemanticSearch,
  getSemanticSearchStatus,
  listSemanticSearchModels,
  reindexSemanticSearch,
  setSemanticSearchEnabled,
  type GatewayModel,
  type SemanticSearchStatus,
} from "@/services/search/semanticSearchRuntime";
import { runSemanticSearchIndexer } from "@/services/search/semanticSearchIndexer";
import { useI18n } from "@/i18n";

type Action = "enable" | "disable" | "configure" | "reindex" | "refresh";

const ACTION_KEYS: Record<Action, string> = {
  enable: "semantic.actionEnable",
  disable: "semantic.actionDisable",
  configure: "semantic.actionConfigure",
  reindex: "semantic.actionReindex",
  refresh: "semantic.actionRefresh",
};

// Agreed native state literals; unknown values are shown in the details below.
const STATE_KEYS: Record<string, string> = {
  disabled: "semantic.stateDisabled",
  connecting: "semantic.stateConnecting",
  indexing: "semantic.stateIndexing",
  ready: "semantic.stateReady",
  no_gateway: "semantic.stateNoGateway",
  conflict: "semantic.stateConflict",
  error: "semantic.stateError",
};

const MODEL_KEYS: Record<string, string> = {
  ready: "semantic.modelReady",
  error: "semantic.modelError",
  missing: "semantic.modelMissing",
};

const DATASET_OPTIONS: Array<{ id: string; labelKey: string }> = [
  { id: "messages", labelKey: "semantic.datasetMessages" },
  { id: "attachments", labelKey: "semantic.datasetAttachments" },
  { id: "calendar", labelKey: "semantic.datasetCalendar" },
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) || "Unknown native error";
  } catch {
    return "Unknown native error";
  }
}

export function SemanticSearchSettings() {
  const id = useId();
  const { t } = useI18n();
  const [status, setStatus] = useState<SemanticSearchStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const requestRef = useRef<((next: Action) => void) | null>(null);
  // Local form state; seeded from the first status snapshot.
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [datasets, setDatasets] = useState<string[]>(["messages", "attachments", "calendar"]);
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const autoIndexedRef = useRef(false);
  const loadModelsRef = useRef<() => void>(() => {});

  // Seed form fields once the first status arrives (do not fight the user
  // while they type: only fill empty fields).
  useEffect(() => {
    if (!status) return;
    setUrl((current) => (current || status?.dataPath || "").trim() === "" ? status.dataPath : current);
    setModel((current) => current || status.modelId);
    setDatasets((current) => {
      const saved = status?.datasets?.filter((d) => DATASET_OPTIONS.some((o) => o.id === d));
      return saved && saved.length > 0 ? saved : current;
    });
  }, [status]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let mutating = false;
    let pending: Action | null = null;

    async function loadModels() {
      try {
        const list = await listSemanticSearchModels();
        if (signal.aborted) return;
        setModels(list);
        setModelsError(null);
        const embedding = list.find((m) => m.kind === "embedding");
        if (embedding) {
          setModel((current) => current || embedding.id);
        }
      } catch (error) {
        if (signal.aborted) return;
        setModelsError(t("semantic.modelsListFailed").replace("{err}", errorMessage(error)));
      }
    }
    loadModelsRef.current = loadModels;

    async function run() {
      if (signal.aborted || running) return;
      running = true;
      const next = pending;
      pending = null;
      mutating = next !== null;
      try {
        let result: SemanticSearchStatus;
        switch (next) {
          case "enable":
          case "disable":
            result = await setSemanticSearchEnabled(next === "enable", signal);
            break;
          case "configure":
            result = await configureSemanticSearch(url, apiKey, model, datasets, signal);
            setApiKey("");
            setModelsError(null);
            void loadModels();
            break;
          case "reindex":
            result = await reindexSemanticSearch(signal);
            break;
          default:
            result = await getSemanticSearchStatus(signal);
        }
        if (signal.aborted) return;
        setStatus(result);
        setStatusError(null);
        if (next && next !== "refresh") setActionError(null);
        // Auto-index once the gateway is ready: after enabling, after
        // configuring, or when the app was started with search enabled and
        // the user opens Settings before the startup timer fired.
        if (result.enabled && result.state === "ready" && !autoIndexedRef.current) {
          autoIndexedRef.current = true;
          void runSemanticSearchIndexer();
        }
      } catch (error) {
        if (signal.aborted) return;
        if (next && next !== "refresh") {
          setActionError(t("semantic.actionFailed").replace("{action}", t(ACTION_KEYS[next]).replace(/\.\.\.$/, "")).replace("{err}", errorMessage(error)));
        } else {
          setStatusError(t("semantic.statusReadFailed").replace("{err}", errorMessage(error)));
        }
      } finally {
        running = false;
        mutating = false;
        if (!signal.aborted) {
          if (next) setAction(null);
          // A click during a status read runs immediately after that read.
          // Otherwise schedule from completion, never with an overlapping interval.
          if (pending) void run();
          else timer = setTimeout(() => void run(), 3000);
        }
      }
    }

    requestRef.current = (next) => {
      if (signal.aborted || pending || mutating) return;
      if (timer !== undefined) clearTimeout(timer);
      pending = next;
      setAction(next);
      void run();
    };
    void run();

    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      requestRef.current = null;
    };
    // url/apiKey/model/datasets are read at click time inside run(); the loop
    // itself must not restart when the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = status?.state === "ready";
  const indexing = status?.state === "indexing";
  const connecting = status?.state === "connecting";
  const failed = status?.state === "error" || status?.state === "conflict" || status?.modelState === "error";
  const enabled = status?.enabled ?? false;
  const busy = action !== null;
  const canReindex = ready && enabled && !busy && !statusError;
  const toggleDisabled = busy || !status || (!enabled && (!status.supported || statusError !== null));
  const statusLabel = action
    ? t(ACTION_KEYS[action])
    : !status
      ? statusError ? t("semantic.statusUnavailable") : t("semantic.checking")
      : connecting
        ? t("semantic.stateConnecting")
        : t(STATE_KEYS[status.state] ?? "semantic.stateUnknown");

  const embeddingModels = models.filter((m) => m.kind === "embedding");
  const hasModels = embeddingModels.length > 0;

  return (
    <section aria-labelledby={`${id}-heading`} className="mb-6 space-y-3">
      <h3 id={`${id}-heading`} className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {t("semantic.title")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {t("semantic.description")}
      </p>

      <div className="space-y-3 rounded-lg border border-border-primary bg-bg-secondary p-4">
        <div className="flex items-center gap-2">
          <Server size={14} aria-hidden="true" className="text-text-tertiary" />
          <p className="text-sm text-text-secondary">{t("semantic.gatewayConnection")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-text-tertiary">{t("semantic.gatewayUrl")}</span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8010"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-border-primary bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </label>
          <label className="block">
            <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
              <KeyRound size={12} aria-hidden="true" /> {t("semantic.apiKey")} {status?.hasApiKey ? t("semantic.saved") : t("semantic.optional")}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.hasApiKey ? t("semantic.keepSavedKey") : t("semantic.noKeySet")}
              spellCheck={false}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-border-primary bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-text-tertiary">{t("semantic.embeddingModel")}</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!hasModels}
              className="mt-1 w-full rounded-md border border-border-primary bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-50"
            >
              {hasModels ? (
                embeddingModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}{m.maxLength ? ` (${m.maxLength} tokens)` : ""}
                  </option>
                ))
              ) : (
                <option value={model || ""}>{model || t("semantic.connectToListModels")}</option>
              )}
            </select>
          </label>
          <fieldset className="block">
            <legend className="text-xs text-text-tertiary">{t("semantic.datasetsToIndex")}</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {DATASET_OPTIONS.map((option) => (
                <label key={option.id} className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={datasets.includes(option.id)}
                    onChange={(e) => {
                      setDatasets((current) =>
                        e.target.checked
                          ? [...current, option.id]
                          : current.filter((d) => d !== option.id),
                      );
                    }}
                    className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                  />
                  {t(option.labelKey)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {modelsError ? (
          <p role="alert" className="break-words text-xs text-danger">{modelsError}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            icon={<Save size={14} aria-hidden="true" />}
            disabled={busy || url.trim() === ""}
            onClick={() => requestRef.current?.("configure")}
          >
            {action === "configure" ? t("semantic.saving") : t("semantic.saveAndTest")}
          </Button>
          {modelsError ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadModelsRef.current?.()}>
              {t("semantic.retryModelList")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <span id={`${id}-label`} className="text-sm text-text-secondary">{t("semantic.enable")}</span>
          <p id={`${id}-description`} className="mt-0.5 text-xs text-text-tertiary">
            {t("semantic.enableDesc")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-description ${id}-enable-help`}
          disabled={toggleDisabled}
          onClick={() => requestRef.current?.(enabled ? "disable" : "enable")}
          className={`relative h-5 w-10 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? "bg-accent" : "bg-bg-tertiary"}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
        </button>
      </div>
      <p id={`${id}-enable-help`} className="text-xs text-text-tertiary">
        {t("semantic.gatewayMustRun")}
      </p>

      <div className="space-y-3 rounded-lg border border-border-primary bg-bg-secondary p-4">
        <div role="status" aria-live="polite" className={`flex items-center gap-2 text-sm font-medium ${failed ? "text-danger" : "text-text-primary"}`}>
          {busy || indexing || connecting || (!status && !statusError)
            ? <Spinner size={14} label={statusLabel} />
            : null}
          <span>{statusLabel}</span>
        </div>
        {status?.message ? (
          <p role={failed ? "alert" : undefined} className={`break-words text-xs ${failed ? "text-danger" : "text-text-secondary"}`}>
            {status.message}
          </p>
        ) : null}
        {statusError ? (
          <div role="alert" className="space-y-2">
            <p className="break-words text-xs text-danger">{statusError} {status ? t("semantic.showingLastStatus") : ""}</p>
            <Button type="button" disabled={busy} onClick={() => requestRef.current?.("refresh")}>{t("semantic.retryStatus")}</Button>
          </div>
        ) : null}
        {actionError ? <p role="alert" className="break-words text-xs text-danger">{actionError}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-text-secondary">{t("semantic.gateway")}</p>
            <p className="text-xs text-text-tertiary">
              {status ? t(MODEL_KEYS[status.modelState] ?? "semantic.modelUnknown").replace("{state}", status.modelState) : t("semantic.waitingForStatus")}
              {status ? ` at ${status.dataPath}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-primary pt-3">
          <div>
            <p className="text-sm text-text-secondary">{t("semantic.mailIndex")}</p>
            <p className="text-xs text-text-tertiary">
              {status?.indexedDocuments != null
                ? t("semantic.documentsIndexed").replace("{count}", status.indexedDocuments.toLocaleString())
                : t("semantic.indexCountUnknown")}
              {indexing ? t("semantic.indexingInProgress") : !enabled ? t("semantic.indexerStopped") : ""}
            </p>
          </div>
          <Button
            type="button"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            disabled={!canReindex}
            aria-describedby={`${id}-reindex-help`}
            onClick={() => requestRef.current?.("reindex")}
          >
            {indexing ? t("semantic.updatingIndex") : t("semantic.updateIndex")}
          </Button>
        </div>
        <p id={`${id}-reindex-help`} className="text-xs text-text-tertiary">
          {t("semantic.reindexHelp")}
        </p>
      </div>

      {status ? (
        <details className="text-xs text-text-tertiary">
          <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-accent">{t("semantic.details")}</summary>
          <dl className="mt-2 space-y-1 break-all">
            <div><dt className="inline font-medium">{t("semantic.modelLabel")} </dt><dd className="inline">{status.modelId || t("semantic.notReported")}</dd></div>
            <div><dt className="inline font-medium">{t("semantic.gatewayLabel")} </dt><dd className="inline">{status.dataPath || t("semantic.notReported")}</dd></div>
            <div><dt className="inline font-medium">{t("semantic.datasetsLabel")} </dt><dd className="inline">{(status.datasets ?? []).join(", ") || t("semantic.none")}</dd></div>
            <div><dt className="inline font-medium">{t("semantic.runtimeStateLabel")} </dt><dd className="inline">{status.state}</dd></div>
            <div><dt className="inline font-medium">{t("semantic.modelStateLabel")} </dt><dd className="inline">{status.modelState}</dd></div>
          </dl>
        </details>
      ) : null}
    </section>
  );
}