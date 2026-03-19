import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WhisperModelInfo,
  ModelDownloadProgress,
} from "../../shared/types.js";
import SummarySettings from "./SummarySettings.js";
import { useTheme, type ThemePreference } from "../hooks/useTheme.js";

interface ModelSelectorProps {
  onClose: () => void;
}

type SettingsTab = "engine" | "summarization" | "appearance";

export default function ModelSelector({ onClose }: ModelSelectorProps) {
  const [tab, setTab] = useState<SettingsTab>("engine");
  const [models, setModels] = useState<WhisperModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [downloadProgress, setDownloadProgress] =
    useState<ModelDownloadProgress | null>(null);
  const [whisperInstalled, setWhisperInstalled] = useState<boolean | null>(
    null,
  );
  const [whisperInstalling, setWhisperInstalling] = useState(false);
  const [whisperInstallProgress, setWhisperInstallProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { preference, setTheme } = useTheme();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap: focus the panel on mount
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const loadState = useCallback(async () => {
    const [modelList, selected, whisperStatus] = await Promise.all([
      window.scribe.listModels(),
      window.scribe.getSelectedModel(),
      window.scribe.getWhisperStatus(),
    ]);
    setModels(modelList);
    setSelectedModel(selected);
    setWhisperInstalled(whisperStatus.installed);
  }, []);

  useEffect(() => {
    loadState();

    const unsub1 = window.scribe.onModelDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    const unsub2 = window.scribe.onWhisperInstallProgress((progress) => {
      setWhisperInstallProgress(progress.status);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [loadState]);

  const handleSelectModel = async (name: string) => {
    await window.scribe.setSelectedModel(name);
    setSelectedModel(name);
  };

  const handleDownload = async (name: string) => {
    setError(null);
    setDownloadProgress({ model: name, percent: 0, downloadedBytes: 0, totalBytes: 0 });
    const result = await window.scribe.downloadModel(name);
    setDownloadProgress(null);

    if (!result.ok) {
      setError(result.error ?? "Download failed");
    } else {
      await loadState();
      if (!selectedModel) {
        await handleSelectModel(name);
      }
    }
  };

  const handleCancelDownload = async () => {
    await window.scribe.cancelModelDownload();
    setDownloadProgress(null);
  };

  const handleDelete = async (name: string) => {
    const result = await window.scribe.deleteModel(name);
    setDeletingModel(null);
    if (result.ok) {
      await loadState();
    } else {
      setError(result.error ?? "Delete failed");
    }
  };

  const handleInstallWhisper = async () => {
    setError(null);
    setWhisperInstalling(true);
    setWhisperInstallProgress("Starting...");
    const result = await window.scribe.installWhisper();
    setWhisperInstalling(false);
    setWhisperInstallProgress("");

    if (!result.ok) {
      setError(result.error ?? "Installation failed");
    } else {
      setWhisperInstalled(true);
    }
  };

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "engine", label: "Transcription" },
    { key: "summarization", label: "Summarization" },
    { key: "appearance", label: "Appearance" },
  ];

  const themeOptions: { key: ThemePreference; label: string }[] = [
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "system", label: "System" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl bg-bg-secondary shadow-2xl outline-none"
      >
        {/* Header with tabs */}
        <div className="flex items-center justify-between border-b border-border-default px-4 pt-4 pb-0">
          <div className="flex">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setError(null); }}
                className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "border-blue-500 text-text-primary"
                    : "border-transparent text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="mb-2 rounded-lg p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {tab === "engine" && (
            <div className="space-y-4">
              {/* Whisper status */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-text-primary">Transcription Engine</h3>
                  <p className="text-xs text-text-tertiary">
                    {whisperInstalled === null
                      ? "Checking status..."
                      : whisperInstalled
                        ? "Installed and ready"
                        : "Needed to convert audio to text"}
                  </p>
                </div>
                {whisperInstalled === false && (
                  <button
                    onClick={handleInstallWhisper}
                    disabled={whisperInstalling}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {whisperInstalling
                      ? whisperInstallProgress || "Installing..."
                      : "Install"}
                  </button>
                )}
                {whisperInstalled === true && (
                  <span className="text-xs text-green-400">Ready</span>
                )}
              </div>

              {/* Models */}
              <div>
                <h3 className="mb-2 text-sm font-medium text-text-primary">Transcription Model</h3>
                <div className="space-y-1.5">
                  {models.map((model) => {
                    const isDownloading =
                      downloadProgress?.model === model.name;
                    const isSelected = selectedModel === model.name;
                    const isConfirmingDelete = deletingModel === model.name;

                    return (
                      <div
                        key={model.name}
                        className={`group flex items-center justify-between rounded-lg px-3 py-2 ${
                          isSelected
                            ? "bg-blue-500/10"
                            : "hover:bg-bg-hover/50"
                        }`}
                      >
                        <button
                          onClick={() => model.downloaded && handleSelectModel(model.name)}
                          disabled={!model.downloaded}
                          className="flex items-center gap-3"
                        >
                          {model.downloaded && (
                            <span
                              className={`h-3.5 w-3.5 rounded-full border-2 ${
                                isSelected
                                  ? "border-blue-500 bg-blue-500"
                                  : "border-text-tertiary"
                              }`}
                            />
                          )}
                          <div className="text-left">
                            <span className="text-sm text-text-secondary">
                              {model.name}
                            </span>
                            <span className="ml-2 text-xs text-text-tertiary">
                              {model.size}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          {isDownloading ? (
                            <>
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-active">
                                <div
                                  className="h-full rounded-full bg-blue-500 transition-all"
                                  style={{
                                    width: `${downloadProgress.percent}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-text-secondary">
                                {downloadProgress.percent}%
                              </span>
                              <button
                                onClick={handleCancelDownload}
                                className="text-xs text-red-400 hover:text-red-300"
                              >
                                Cancel
                              </button>
                            </>
                          ) : model.downloaded ? (
                            isConfirmingDelete ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleDelete(model.name)}
                                  className="text-xs text-red-400 hover:text-red-300"
                                >
                                  Remove model
                                </button>
                                <button
                                  onClick={() => setDeletingModel(null)}
                                  className="text-xs text-text-tertiary hover:text-text-secondary"
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeletingModel(model.name)}
                                className="text-xs text-text-secondary opacity-0 hover:text-red-400 group-hover:opacity-100"
                              >
                                Delete
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => handleDownload(model.name)}
                              disabled={downloadProgress !== null}
                              className="rounded-lg bg-bg-active px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-50"
                            >
                              Download
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>
          )}

          {tab === "summarization" && (
            <SummarySettings onClose={onClose} />
          )}

          {tab === "appearance" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-text-primary">Theme</h3>
                <p className="mt-1 text-xs text-text-tertiary">
                  Choose how Scribe looks. System follows your macOS appearance.
                </p>
              </div>
              <div className="flex rounded-lg border border-border-default bg-bg-primary p-0.5">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setTheme(opt.key)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      preference === opt.key
                        ? "bg-bg-active text-text-primary"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
