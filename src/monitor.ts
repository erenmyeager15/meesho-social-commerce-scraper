import type { ChangeType, MonitorFields } from './types.js';

export const MONITOR_STORE_NAME = 'meesho-product-monitor';
export const MAX_MONITORED = 5_000;

export interface MonitorEntry {
    price: number | null;
    position: number;
    ratingCount: number | null;
    firstSeenAt: string;
    observedAt: string;
}

export interface MonitorState {
    version: 1;
    updatedAt: string;
    entries: Record<string, MonitorEntry>;
}

export function monitorKey(name: string): string {
    return `MONITOR-${name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}`;
}

export function entryKey(query: string, catalogId: string): string {
    return `${query.trim().toLowerCase()}|${catalogId}`;
}

export function emptyState(): MonitorState {
    return { version: 1, updatedAt: new Date(0).toISOString(), entries: {} };
}

export function restoreState(value: unknown): MonitorState {
    if (!value || typeof value !== 'object') return emptyState();
    const candidate = value as Partial<MonitorState>;
    if (candidate.version !== 1 || !candidate.entries || typeof candidate.entries !== 'object') return emptyState();
    return { version: 1, updatedAt: String(candidate.updatedAt ?? ''), entries: candidate.entries as Record<string, MonitorEntry> };
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Compare one observation with the saved one. A price move smaller than the
 * threshold counts as unchanged, so rounding noise does not raise alerts. */
export function compareObservation(
    previous: MonitorEntry | undefined,
    current: { price: number | null; position: number; ratingCount: number | null },
    now: string,
    thresholdPercent: number,
): MonitorFields {
    if (!previous) {
        return { changeType: 'new', previousPrice: null, priceChange: null, priceChangePercent: null,
            previousPosition: null, positionChange: null, newRatings: null, firstSeenAt: now, previousObservedAt: null };
    }
    const priceChange = previous.price !== null && current.price !== null ? round(current.price - previous.price) : null;
    const priceChangePercent = priceChange !== null && previous.price ? round((priceChange / previous.price) * 100) : null;
    let changeType: ChangeType = 'unchanged';
    if (priceChange !== null && priceChange !== 0 && Math.abs(priceChangePercent ?? 0) >= thresholdPercent) {
        changeType = priceChange < 0 ? 'price_drop' : 'price_increase';
    }
    const newRatings = previous.ratingCount !== null && current.ratingCount !== null
        ? Math.max(0, current.ratingCount - previous.ratingCount) : null;
    return {
        changeType,
        previousPrice: previous.price,
        priceChange,
        priceChangePercent,
        previousPosition: previous.position,
        positionChange: previous.position - current.position,
        newRatings,
        firstSeenAt: previous.firstSeenAt,
        previousObservedAt: previous.observedAt,
    };
}

/** Keep the most recently observed entries when the cap is exceeded. */
export function mergeState(
    state: MonitorState,
    updates: Record<string, MonitorEntry>,
    now: string,
): MonitorState {
    const entries = { ...state.entries, ...updates };
    const keys = Object.keys(entries);
    if (keys.length > MAX_MONITORED) {
        keys.sort((a, b) => entries[b].observedAt.localeCompare(entries[a].observedAt));
        for (const key of keys.slice(MAX_MONITORED)) delete entries[key];
    }
    return { version: 1, updatedAt: now, entries };
}
