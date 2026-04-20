/**
 * React Query hooks — cached, deduplicated data fetching.
 *
 * Kurallar:
 * - Her veri kaynağı 1 kez çekilir, cache'lenir
 * - Birden fazla sayfa aynı veriyi kullanabilir (duplicate fetch yok)
 * - staleTime: 60s (1 dakika cache, sonra arka planda yenile)
 * - Error handling otomatik
 */

import { useQuery } from "@tanstack/react-query";
import { api, type QualityReport, type CouplingReport, type SecurityReport, type DeadCodeReport, type HotspotReport, type TechDebtReport } from "./api-client.js";
import { useStore } from "../lib/store.js";

// Active project'e göre query key oluştur
function projectKey(key: string): string[] {
  const project = useStore.getState().activeProject;
  return project ? [key, project] : [key];
}

const STALE_60S = { staleTime: 60_000 };

// ─── Analysis queries ──────────────────────────────────

export function useQuality() {
  return useQuery<QualityReport | null>({
    queryKey: projectKey("quality"),
    queryFn: () => api.getQuality(),
    ...STALE_60S,
  });
}

export function useCoupling() {
  return useQuery<CouplingReport | null>({
    queryKey: projectKey("coupling"),
    queryFn: () => api.getCoupling(),
    ...STALE_60S,
  });
}

export function useSecurity() {
  return useQuery<SecurityReport | null>({
    queryKey: projectKey("security"),
    queryFn: () => api.getSecurity(),
    ...STALE_60S,
  });
}

export function useDeadCode() {
  return useQuery<DeadCodeReport | null>({
    queryKey: projectKey("deadcode"),
    queryFn: () => api.getDeadCode(),
    ...STALE_60S,
  });
}

export function useHotspots() {
  return useQuery<HotspotReport | null>({
    queryKey: projectKey("hotspots"),
    queryFn: () => api.getHotspots(),
    ...STALE_60S,
  });
}

export function useTechDebt() {
  return useQuery<TechDebtReport | null>({
    queryKey: projectKey("techdebt"),
    queryFn: () => api.getTechDebt(),
    ...STALE_60S,
  });
}

export function useEventFlow() {
  return useQuery({
    queryKey: projectKey("eventflow"),
    queryFn: () => api.getEventFlow(),
    ...STALE_60S,
  });
}

export function usePatterns() {
  return useQuery({
    queryKey: projectKey("patterns"),
    queryFn: () => api.getPatterns(),
    ...STALE_60S,
  });
}

export function useConsistency() {
  return useQuery({
    queryKey: projectKey("consistency"),
    queryFn: () => api.getConsistency(),
    ...STALE_60S,
  });
}

// ─── Combined: all analysis in one call ─────────────────

export function useAllAnalysis() {
  const quality = useQuality();
  const coupling = useCoupling();
  const security = useSecurity();
  const deadcode = useDeadCode();
  const hotspots = useHotspots();
  const techdebt = useTechDebt();

  return {
    quality: quality.data ?? null,
    coupling: coupling.data ?? null,
    security: security.data ?? null,
    deadcode: deadcode.data ?? null,
    hotspots: hotspots.data ?? null,
    techdebt: techdebt.data ?? null,
    isLoading: quality.isLoading || coupling.isLoading || security.isLoading,
    isError: quality.isError && coupling.isError,
  };
}

// ─── Snapshots ──────────────────────────────────────────

export function useSnapshots() {
  return useQuery({
    queryKey: projectKey("snapshots"),
    queryFn: () => api.getSnapshots(),
    ...STALE_60S,
  });
}

// ─── Rules ──────────────────────────────────────────────

export function useRules() {
  return useQuery({
    queryKey: projectKey("rules"),
    queryFn: () => api.getRules(),
    ...STALE_60S,
  });
}

// ─── Comments ───────────────────────────────────────────

export function useComments(target?: string) {
  return useQuery({
    queryKey: [...projectKey("comments"), target],
    queryFn: () => api.getComments(target),
    ...STALE_60S,
  });
}
