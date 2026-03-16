import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TranscriptSegment,
  TranscriptionStatus,
} from "../../shared/types.js";

export function useTranscription() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<TranscriptionStatus>({ state: "idle" });
  const cleanupRefs = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Load existing segments
    window.scribe.getTranscriptSegments().then(setSegments);

    const unsub1 = window.scribe.onTranscriptSegment((segment) => {
      setSegments((prev) => [...prev, segment]);
    });

    const unsub2 = window.scribe.onTranscriptionStatus((s) => {
      setStatus(s);
    });

    cleanupRefs.current = [unsub1, unsub2];

    return () => {
      cleanupRefs.current.forEach((fn) => fn());
    };
  }, []);

  const clearSegments = useCallback(() => {
    setSegments([]);
  }, []);

  return { segments, status, clearSegments };
}
