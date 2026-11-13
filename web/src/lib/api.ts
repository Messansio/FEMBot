import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApiAuditEntry,
  ApiCase,
  ApiCaseType,
  ApiChannel,
  ApiGuildOverview,
  ApiGuildSummary,
  ApiLeaderboardEntry,
  ApiLevelReward,
  ApiRole,
  ApiRolePanel,
  ApiRolePanelInput,
  ApiSettings,
  ApiTicket,
  ApiUser,
  Paginated,
} from "@api/types";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { error?: string; details?: unknown } | null;
    throw new ApiRequestError(response.status, body?.error ?? `Request failed (${response.status})`, body?.details);
  }
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const g = (guildId: string, path = "") => `/api/guilds/${guildId}${path}`;

// ── Queries ──────────────────────────────────────────────────────
export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<ApiUser>("/api/me");
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });

export const useGuilds = () => useQuery({ queryKey: ["guilds"], queryFn: () => api<ApiGuildSummary[]>("/api/guilds") });
export const useOverview = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "overview"], queryFn: () => api<ApiGuildOverview>(g(guildId)) });
export const useChannels = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "channels"], queryFn: () => api<ApiChannel[]>(g(guildId, "/channels")), staleTime: 60_000 });
export const useRoles = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "roles"], queryFn: () => api<ApiRole[]>(g(guildId, "/roles")), staleTime: 60_000 });
export const useSettings = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "settings"], queryFn: () => api<ApiSettings>(g(guildId, "/settings")) });

export const useCases = (guildId: string, page: number, type: ApiCaseType | "", user: string) =>
  useQuery({
    queryKey: ["guild", guildId, "cases", page, type, user],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (type) params.set("type", type);
      if (user) params.set("user", user);
      return api<Paginated<ApiCase>>(g(guildId, `/cases?${params}`));
    },
    placeholderData: (previous) => previous,
  });

export const useTickets = (guildId: string, status: "open" | "closed") =>
  useQuery({ queryKey: ["guild", guildId, "tickets", status], queryFn: () => api<ApiTicket[]>(g(guildId, `/tickets?status=${status}`)) });
export const useRolePanels = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "panels"], queryFn: () => api<ApiRolePanel[]>(g(guildId, "/role-panels")) });
export const useLevelRewards = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "rewards"], queryFn: () => api<ApiLevelReward[]>(g(guildId, "/level-rewards")) });
export const useLeaderboard = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "leaderboard"], queryFn: () => api<ApiLeaderboardEntry[]>(g(guildId, "/leaderboard")) });
export const useAudit = (guildId: string) =>
  useQuery({ queryKey: ["guild", guildId, "audit"], queryFn: () => api<ApiAuditEntry[]>(g(guildId, "/audit?limit=100")) });

// ── Mutations ────────────────────────────────────────────────────
export function useSaveSettings(guildId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ApiSettings>) => api<ApiSettings>(g(guildId, "/settings"), json("PATCH", patch)),
    onSuccess: (settings) => {
      client.setQueryData(["guild", guildId, "settings"], settings);
      void client.invalidateQueries({ queryKey: ["guild", guildId, "audit"] });
    },
  });
}

export function useCaseMutations(guildId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["guild", guildId, "cases"] });
  return {
    update: useMutation({
      mutationFn: ({ caseNumber, ...body }: { caseNumber: number; reason?: string | null; active?: boolean }) =>
        api<ApiCase>(g(guildId, `/cases/${caseNumber}`), json("PATCH", body)),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (caseNumber: number) => api<void>(g(guildId, `/cases/${caseNumber}`), { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function usePanelMutations(guildId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["guild", guildId, "panels"] });
  return {
    create: useMutation({
      mutationFn: (input: ApiRolePanelInput) => api<ApiRolePanel>(g(guildId, "/role-panels"), json("POST", input)),
      onSuccess: invalidate,
    }),
    save: useMutation({
      mutationFn: ({ id, ...input }: ApiRolePanelInput & { id: number }) =>
        api<ApiRolePanel>(g(guildId, `/role-panels/${id}`), json("PUT", input)),
      onSuccess: invalidate,
    }),
    publish: useMutation({
      mutationFn: ({ id, channelId }: { id: number; channelId: string }) =>
        api<ApiRolePanel>(g(guildId, `/role-panels/${id}/publish`), json("POST", { channelId })),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(g(guildId, `/role-panels/${id}`), { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useSaveLevelRewards(guildId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rewards: ApiLevelReward[]) => api<ApiLevelReward[]>(g(guildId, "/level-rewards"), json("PUT", rewards)),
    onSuccess: (rewards) => client.setQueryData(["guild", guildId, "rewards"], rewards),
  });
}

export async function logout(): Promise<void> {
  await api("/auth/logout", { method: "POST" });
  window.location.href = "/";
}
