import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StorageService } from '../services/storageService';
import { UserProfile, EquipmentDefinition, LightSettings, SystemSettings } from '../types';

// Query Keys
export const EQUIPMENT_KEYS = {
    all: (userId: string, orgId?: string | null) => ['equipment', userId, orgId || 'PERSONAL'] as const,
    item: (id: string, userId: string, orgId?: string | null) => ['equipment', id, userId, orgId || 'PERSONAL'] as const,
};

export const SETTINGS_KEYS = {
    system: ['settings', 'system'] as const,
    light: (userId: string, orgId?: string | null) => ['settings', 'light', userId, orgId || 'PERSONAL'] as const,
};

// LocalStorage cache helpers for instant 0ms UI hydration on refresh
function readCache<T>(key: string): T | undefined {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
        return undefined;
    }
}

function writeCache(key: string, data: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch {
        // Ignore quota exceeded
    }
}

// 1. Equipment Hook
export function useEquipment(user: UserProfile, orgIdOverride?: string | null, options?: { enabled?: boolean }) {
    const orgId = orgIdOverride !== undefined ? orgIdOverride : user.currentOrganizationId;
    const cacheKey = `rq_eq_${user.uid}_${orgId || 'PERSONAL'}`;
    return useQuery({
        queryKey: EQUIPMENT_KEYS.all(user.uid, orgId),
        queryFn: async () => {
            const data = await StorageService.getEquipmentDefinitions(user.uid, orgId);
            writeCache(cacheKey, data);
            return data;
        },
        initialData: () => (user.uid ? readCache<EquipmentDefinition[]>(cacheKey) : undefined),
        initialDataUpdatedAt: 0,
        staleTime: 1000 * 60 * 5, // 5 minutes fresh
        enabled: options?.enabled !== false && !!user.uid, // Only fetch if user ID exists
        refetchInterval: user.isGuest ? 10000 : false, // Poll every 10s for guests
    });
}

export const ABNORMAL_KEYS = {
    all: (userId: string, orgId?: string | null) => ['abnormal_records', userId, orgId || 'PERSONAL'] as const,
};

export function useAbnormalRecords(user: UserProfile) {
    const queryClient = useQueryClient();
    const queryKey = ABNORMAL_KEYS.all(user.uid, user.currentOrganizationId);
    const cacheKey = `rq_ab_${user.uid}_${user.currentOrganizationId || 'PERSONAL'}`;

    // Initial fetch + Cache management
    const queryResult = useQuery({
        queryKey: queryKey,
        queryFn: async () => {
            const data = await StorageService.getAbnormalRecords(user.uid, user.currentOrganizationId);
            writeCache(cacheKey, data);
            return data;
        },
        initialData: () => (user.uid ? readCache<any[]>(cacheKey) : undefined),
        initialDataUpdatedAt: 0,
        staleTime: Infinity, // Rely on subscription for updates
        enabled: !!user.uid,
        refetchOnWindowFocus: false, // Prevent redundant fetches
    });

    // Real-time subscription
    useEffect(() => {
        if (!user.uid) return;

        const unsubscribe = StorageService.subscribeToAbnormalRecords(
            user.uid,
            user.currentOrganizationId,
            (records) => {
                console.log('[useAbnormalRecords] Real-time update received:', records.length);
                writeCache(cacheKey, records);
                queryClient.setQueryData(queryKey, records);
            }
        );

        return () => {
            unsubscribe();
        };
    }, [user.uid, user.currentOrganizationId, queryClient]); // Re-subscribe if user/org changes

    return queryResult;
}

export const HISTORY_KEYS = {
    all: (userId: string, orgId?: string | null, year?: number) => ['history', userId, orgId || 'PERSONAL', year] as const,
};

export function useHistoryReports(user: UserProfile, year: number, options?: { enabled?: boolean }) {
    const queryClient = useQueryClient();
    const queryKey = HISTORY_KEYS.all(user.uid, user.currentOrganizationId, year);
    const cacheKey = `rq_hist_${user.uid}_${user.currentOrganizationId || 'PERSONAL'}_${year}`;

    const queryResult = useQuery({
        queryKey: queryKey,
        queryFn: async () => {
            const data = await StorageService.getReports(user.uid, year, true, user.currentOrganizationId);
            writeCache(cacheKey, data);
            return data;
        },
        initialData: () => (user.uid ? readCache<any[]>(cacheKey) : undefined),
        initialDataUpdatedAt: 0,
        staleTime: Infinity, // Rely on subscription for updates
        enabled: options?.enabled !== false && !!user.uid,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (options?.enabled === false || !user.uid) return;

        // Only subscribe if not Guest (or handle Guest subscription if supported)
        // StorageService.subscribeToReports handles "if (!db) return" check internally
        const unsubscribe = StorageService.subscribeToReports(
            user.uid,
            year,
            (reports) => {
                console.log('[useHistoryReports] Real-time update:', reports.length);
                writeCache(cacheKey, reports);
                queryClient.setQueryData(queryKey, reports);
            },
            user.currentOrganizationId
        );

        return () => unsubscribe();
    }, [user.uid, user.currentOrganizationId, year, options?.enabled, queryClient]);

    return queryResult;
}

// 2. System Settings Hook
export function useSystemSettings() {
    return useQuery({
        queryKey: SETTINGS_KEYS.system,
        queryFn: () => StorageService.getSystemSettings(),
        staleTime: 1000 * 60 * 60, // 1 hour (rarely changes)
    });
}

// 3. Light Settings Hook
export function useLightSettings(user: UserProfile) {
    const cacheKey = `rq_light_${user.uid}_${user.currentOrganizationId || 'PERSONAL'}`;
    return useQuery({
        queryKey: SETTINGS_KEYS.light(user.uid, user.currentOrganizationId),
        queryFn: async () => {
            const data = await StorageService.getLightSettings(user.uid, user.currentOrganizationId);
            writeCache(cacheKey, data);
            return data;
        },
        initialData: () => (user.uid ? readCache<LightSettings>(cacheKey) : undefined),
        initialDataUpdatedAt: 0,
        staleTime: 1000 * 60 * 10, // 10 mins
        enabled: !!user.uid,
    });
}

// Mutations (Optional but good for immediate integration)
export function useDeleteEquipment(user: UserProfile) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => StorageService.deleteEquipmentDefinition(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all(user.uid, user.currentOrganizationId) });
        },
    });
}

export function useBatchUpdateEquipment(user: UserProfile) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (updates: { id: string, data: Partial<EquipmentDefinition> }[]) => StorageService.batchUpdateEquipment(updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all(user.uid, user.currentOrganizationId) });
        }
    })
}

export function useBatchDeleteEquipment(user: UserProfile) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids: string[]) => StorageService.batchDeleteEquipment(ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all(user.uid, user.currentOrganizationId) });
        }
    })
}

export function useSaveEquipment(user: UserProfile) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: EquipmentDefinition) => {
            // If data has an ID that doesn't start with 'local_', it might be an update.
            // However, StorageService.saveEquipmentDefinition uses addDoc (creates new).
            // We need to check if we should call updateEquipmentDefinition or saveEquipmentDefinition.
            // For simplicity and to match EquipmentManager logic, we use a helper approach.
            if (data.id && !data.id.startsWith('local_') && !data.id.includes('COPY')) {
                return StorageService.updateEquipmentDefinition(data as any).then(() => data.id);
            }
            return StorageService.saveEquipmentDefinition(data, user.uid, user.currentOrganizationId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all(user.uid, user.currentOrganizationId) });
        }
    });
}

export function useUpdateLightSettings(user: UserProfile) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (settings: LightSettings) => StorageService.saveLightSettings(settings, user.uid, user.currentOrganizationId),
        onMutate: async (newSettings) => {
            const key = SETTINGS_KEYS.light(user.uid, user.currentOrganizationId);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<LightSettings>(key);
            queryClient.setQueryData(key, newSettings);
            return { previous, key };
        },
        onError: (_err, _newSettings, context) => {
            if (context?.previous) {
                queryClient.setQueryData(context.key, context.previous);
            }
        },
        onSettled: (_data, _err, _vars, context) => {
            if (context?.key) {
                queryClient.invalidateQueries({ queryKey: context.key });
            }
        },
    });
}
