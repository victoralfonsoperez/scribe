import { useCallback, useEffect, useState } from "react";
import type {
  MeetingListItem,
  MeetingDetail,
  SearchResultGroup,
} from "../../shared/types.js";

export function useMeetings() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await window.scribe.listMeetings();
    setMeetings(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meetings, loading, refresh };
}

export function useMeetingDetail(id: string | null) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) {
      setDetail(null);
      return;
    }
    setLoading(true);
    const data = await window.scribe.getMeeting(id);
    setDetail(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { detail, loading, refresh };
}

export function useMeetingSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const res = await window.scribe.searchMeetings(q.trim());
    setResults(res);
    setSearching(false);
  }, []);

  return { query, results, searching, search };
}
