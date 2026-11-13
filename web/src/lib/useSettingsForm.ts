import { useEffect, useMemo, useState } from "react";
import type { ApiSettings } from "@api/types";
import { useSaveSettings, useSettings } from "./api";

/**
 * Local draft of guild settings. Only changed keys are sent on save,
 * so two admins editing different pages don't overwrite each other.
 */
export function useSettingsForm(guildId: string) {
  const query = useSettings(guildId);
  const save = useSaveSettings(guildId);
  const [draft, setDraft] = useState<ApiSettings | null>(null);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const changes = useMemo(() => {
    if (!draft || !query.data) return {};
    const server = query.data;
    return Object.fromEntries(
      (Object.keys(draft) as Array<keyof ApiSettings>)
        .filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(server[key]))
        .map((key) => [key, draft[key]]),
    ) as Partial<ApiSettings>;
  }, [draft, query.data]);

  const set = <K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return {
    draft,
    set,
    isLoading: query.isLoading,
    loadError: query.error,
    dirty: Object.keys(changes).length > 0,
    saving: save.isPending,
    saveError: save.error,
    save: () => save.mutate(changes),
    reset: () => query.data && setDraft(query.data),
  };
}
