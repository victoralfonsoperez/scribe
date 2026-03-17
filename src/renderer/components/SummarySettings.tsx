import { useCallback, useEffect, useRef, useState } from "react";
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    window.scribe.getSummarySettings().then(setSettings);
  }, []);

  // Auto-save on change with debounce
  const updateSettings = useCallback(
    (update: Partial<SummarySettingsType>) => {
      const next = { ...settings, ...update };
      setSettings(next);
      setTestResult(null);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        window.scribe.setSummarySettings(next);
      }, 500);
    },
    [settings],
  );

  // Flush pending save on unmount instead of discarding it
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        window.scribe.setSummarySettings(settingsRef.current);
      }
    };
  }, []);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);

    try {
      if (settings.provider === "ollama") {
        const url = settings.ollamaUrl || "http://localhost:11434";
        const res = await fetch(`${url}/api/tags`);
        setTestResult(
          res.ok
            ? { ok: true, message: "Connected" }
            : { ok: false, message: `Error: ${res.status}` },
        );
      } else {
        if (settings.apiKey && settings.apiKey.startsWith("sk-ant-")) {
          setTestResult({ ok: true, message: "Key looks correct" });
        } else if (!settings.apiKey) {
          setTestResult({
            ok: false,
            message: "Enter your API key first",
          });
        } else {
          setTestResult({
            ok: false,
            message: "Key should start with sk-ant-",
          });
        }
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    setTesting(false);
  }, [settings]);

  return (
    <div className="space-y-4">
      {/* Provider toggle */}
      <div>
        <label className="mb-1.5 block text-xs text-gray-500">Provider</label>
        <div className="flex rounded-lg border border-gray-800 bg-gray-950 p-0.5">
          <button
            onClick={() => updateSettings({ provider: "claude" })}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              settings.provider === "claude"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Claude API
          </button>
          <button
            onClick={() => updateSettings({ provider: "ollama" })}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              settings.provider === "ollama"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Ollama
          </button>
        </div>
      </div>

      {/* Provider-specific fields */}
      {settings.provider === "claude" ? (
        <div>
          <label className="mb-1.5 block text-xs text-gray-500">API Key</label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={settings.apiKey}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
              placeholder="sk-ant-..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 pr-14 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-300"
            >
              {showApiKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className="mb-1.5 block text-xs text-gray-500">URL</label>
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={(e) => updateSettings({ ollamaUrl: e.target.value })}
              placeholder="http://localhost:11434"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-gray-500">Model</label>
            <input
              type="text"
              value={settings.ollamaModel}
              onChange={(e) => updateSettings({ ollamaModel: e.target.value })}
              placeholder="llama3.2"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </>
      )}

      {/* Test connection */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>
        {testResult && (
          <span
            className={`text-xs ${testResult.ok ? "text-green-400" : "text-red-400"}`}
          >
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}
