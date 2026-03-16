import { useCallback, useEffect, useState } from "react";
import type {
  WhisperModelInfo,
  ModelDownloadProgress,
} from "../../shared/types.js";

interface ModelSelectorProps {
  onClose: () => void;
}

export default function ModelSelector({ onClose }: ModelSelectorProps) {
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
      // Auto-select if no model selected
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
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

        {/* Whisper Binary Section */}
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-medium text-gray-300">
            Whisper Engine
          </h3>
          {whisperInstalled === null ? (
            <p className="text-xs text-gray-500">Checking...</p>
          ) : whisperInstalled ? (
            <p className="text-xs text-green-400">Installed</p>
          ) : (
            <div>
              <p className="mb-2 text-xs text-yellow-400">
                whisper.cpp is not installed. Install it to enable transcription.
              </p>
              <button
                onClick={handleInstallWhisper}
                disabled={whisperInstalling}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {whisperInstalling
                  ? whisperInstallProgress || "Installing..."
                  : "Install whisper.cpp"}
              </button>
            </div>
          )}
        </div>

        {/* Model Selection */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-300">
            Transcription Model
          </h3>
          <div className="space-y-2">
            {models.map((model) => {
              const isDownloading =
                downloadProgress?.model === model.name;
              const isSelected = selectedModel === model.name;

              return (
                <div
                  key={model.name}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    isSelected
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-gray-700 bg-gray-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {model.downloaded && (
                      <button
                        onClick={() => handleSelectModel(model.name)}
                        className={`h-4 w-4 rounded-full border-2 ${
                          isSelected
                            ? "border-blue-500 bg-blue-500"
                            : "border-gray-500"
                        }`}
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-200">
                        {model.name}
                      </p>
                      <p className="text-xs text-gray-500">{model.size}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isDownloading ? (
                      <>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-700">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
                            style={{
                              width: `${downloadProgress.percent}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">
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
                      <button
                        onClick={() => handleDelete(model.name)}
                        className="text-xs text-gray-500 hover:text-red-400"
                      >
                        Delete
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDownload(model.name)}
                        disabled={downloadProgress !== null}
                        className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-50"
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
          <p className="mt-3 text-xs text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
