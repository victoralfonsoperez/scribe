import { useCallback, useEffect, useState } from "react";
import type { Summary, SummaryStatus } from "../../shared/types.js";

export function useSummary(meetingId: string) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [status, setStatus] = useState<SummaryStatus>({ state: "idle" });

  const refresh = useCallback(async () => {
    const list = await window.scribe.listSummaries(meetingId);
    setSummaries(list);
  }, [meetingId]);

  useEffect(() => {
    refresh();
    const unsub = window.scribe.onSummaryStatus((s) => {
      setStatus(s);
      if (s.state === "done") {
        refresh();
      }
    });
    return unsub;
  }, [refresh]);

  const generate = useCallback(
    async (promptKey?: string) => {
      setStatus({ state: "generating" });
      const result = await window.scribe.generateSummary(meetingId, promptKey);
      if (!result.ok) {
        setStatus({ state: "error", error: result.error });
      }
    },
    [meetingId],
  );

  const deleteSummary = useCallback(
    async (id: string) => {
      await window.scribe.deleteSummary(id);
      await refresh();
    },
    [refresh],
  );

  return { summaries, status, generate, deleteSummary };
}
