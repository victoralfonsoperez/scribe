import { useCallback, useEffect, useState } from "react";
import type { SummarySettings as SummarySettingsType } from "../../shared/types.js";

interface SummarySettingsProps {
  onClose: () => void;
}

export default function SummarySettings({ onClose }: SummarySettingsProps) {
  const [settings, setSettings] = useState<SummarySettingsType>({
    apiKey: "",
    provider: "claude",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "llama3.2",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    window.scribe.getSummarySettings().then(setSettings);
  }, []);

  const handleSave = useCallback(async () => {
    await window.scribe.setSummarySettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);

    try {
      if (settings.provider === "ollama") {
        const url = settings.ollamaUrl || "http://localhost:11434";
        const res = await fetch(`${url}/api/tags`);
        if (res.ok) {
          setTestResult("Connected to Ollama");
        } else {
          setTestResult(`Ollama error: ${res.status}`);
        }
      } else {
        // For Claude, just validate the key format
        if (
          settings.apiKey &&
          settings.apiKey.startsWith("sk-ant-")
        ) {
          setTestResult("API key format looks valid");
        } else {
          setTestResult("Invalid API key format (should start with sk-ant-)");
        }
      }
    } catch (err) {
      setTestResult(
        `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setTesting(false);
  }, [settings]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-300">Summarization</h3>

      {/* Provider selector */}
      <div>
        <label className="mb-1 block text-xs text-gray-500">Provider</label>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setSettings({ ...settings, provider: "claude" })
            }
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              settings.provider === "claude"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Claude API
          </button>
          <button
            onClick={() =>
              setSettings({ ...settings, provider: "ollama" })
            }
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              settings.provider === "ollama"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Ollama
          </button>
        </div>
      </div>

      {/* Claude API Key */}
      {settings.provider === "claude" && (
        <div>
          <label className="mb-1 block text-xs text-gray-500">API Key</label>
          <div className="flex gap-2">
            <input
              type={showApiKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) =>
                setSettings({ ...settings, apiKey: e.target.value })
              }
              placeholder="sk-ant-..."
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="rounded-lg border border-gray-700 px-2 py-1.5 text-xs text-gray-400 hover:text-white"
            >
              {showApiKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      )}

      {/* Ollama settings */}
      {settings.provider === "ollama" && (
        <>
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Ollama URL
            </label>
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={(e) =>
                setSettings({ ...settings, ollamaUrl: e.target.value })
              }
              placeholder="http://localhost:11434"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Model</label>
            <input
              type="text"
              value={settings.ollamaModel}
              onChange={(e) =>
                setSettings({ ...settings, ollamaModel: e.target.value })
              }
              placeholder="llama3.2"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          Save
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>
        {saved && <span className="text-xs text-green-400">Saved!</span>}
        {testResult && (
          <span
            className={`text-xs ${testResult.includes("failed") || testResult.includes("Invalid") || testResult.includes("error") ? "text-red-400" : "text-green-400"}`}
          >
            {testResult}
          </span>
        )}
      </div>
    </div>
  );
}
