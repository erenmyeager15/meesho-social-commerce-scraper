import type { ActorInput, ProxyInput } from './types.js';

export interface NormalizedInput {
    searchQueries: string[];
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    includeAds: boolean;
    maxResults: number;
    /** undefined = automatic, based on maxResults and filters. */
    maxPagesPerQuery?: number;
    proxyConfiguration: ProxyInput;
    monitorName?: string;
    onlyChanges: boolean;
    priceChangeThresholdPercent: number;
}

const DEFAULT_PROXY_CONFIGURATION: ProxyInput = {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
    apifyProxyCountry: 'IN',
};

function fail(message: string, field?: string): never {
    throw new Error(field ? `Field "${field}": ${message}` : message);
}

function asStringArray(value: unknown, fieldName: string, defaultValue: string[], minItems: number, maxItems: number): string[] {
    if (value === undefined || value === null) return [...defaultValue];
    if (!Array.isArray(value)) fail('must be an array of strings.', fieldName);

    const result = value.map((item) => {
        if (typeof item !== 'string') fail('all items must be strings.', fieldName);
        const trimmed = item.trim();
        if (!trimmed) fail('items must not be empty.', fieldName);
        return trimmed;
    });

    if (result.length < minItems) fail(`must contain at least ${minItems} item(s).`, fieldName);
    if (result.length > maxItems) fail(`must contain at most ${maxItems} items.`, fieldName);
    return [...new Set(result)];
}

function asOptionalNumberInRange(value: unknown, fieldName: string, min: number, max: number): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) fail('must be a number.', fieldName);
    if (parsed < min || parsed > max) fail(`must be between ${min} and ${max}.`, fieldName);
    return parsed;
}

function asIntInRange(value: unknown, fieldName: string, defaultValue: number, min: number, max: number): number {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) fail('must be a number.', fieldName);
    if (!Number.isInteger(parsed)) fail('must be an integer.', fieldName);
    if (parsed < min || parsed > max) fail(`must be between ${min} and ${max}.`, fieldName);
    return parsed;
}

function asBoolean(value: unknown, fieldName: string, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    fail('must be a boolean.', fieldName);
}

function asProxyConfiguration(value: unknown): ProxyInput {
    if (value === undefined || value === null || value === '') return { ...DEFAULT_PROXY_CONFIGURATION };
    if (typeof value !== 'object' || Array.isArray(value)) fail('must be a proxy configuration object.', 'proxyConfiguration');
    return value as ProxyInput;
}

/** Meesho blocks Apify datacenter IPs and direct cloud traffic with HTTP 403
 * (verified 6 Nov 2026). The Console's plain "Apify Proxy" choice sends no
 * group, which used to mean datacenter and a failed run, so treat it as the
 * recommended Residential India route. Explicit groups and custom URLs stay. */
export function resolveProxyConfiguration(value: ProxyInput): ProxyInput {
    const plainApifyProxy = value.useApifyProxy === true && !value.apifyProxyGroups?.length && !value.proxyUrls?.length;
    if (!plainApifyProxy) return value;
    return { ...DEFAULT_PROXY_CONFIGURATION, apifyProxyCountry: value.apifyProxyCountry ?? 'IN' };
}

function asMonitorName(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') fail('must be a string.', 'monitorName');
    const trimmed = value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,49}$/.test(trimmed)) {
        fail('must be 1-50 letters, numbers, spaces, underscores or hyphens, starting with a letter or number.', 'monitorName');
    }
    return trimmed;
}

export function normalizeInput(raw: ActorInput = {}): NormalizedInput {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Input must be a JSON object.');

    const minPrice = asOptionalNumberInRange(raw.minPrice, 'minPrice', 0, 1_000_000);
    const maxPrice = asOptionalNumberInRange(raw.maxPrice, 'maxPrice', 0, 1_000_000);
    if (minPrice !== undefined && maxPrice !== undefined && maxPrice < minPrice) {
        fail('must be greater than or equal to minPrice.', 'maxPrice');
    }
    const monitorName = asMonitorName(raw.monitorName);
    if (raw.onlyChanges === true && !monitorName) fail('requires monitorName so there is a previous run to compare with.', 'onlyChanges');

    return {
        searchQueries: asStringArray(raw.searchQueries, 'searchQueries', ['kurti'], 1, 5),
        minPrice,
        maxPrice,
        minRating: asOptionalNumberInRange(raw.minRating, 'minRating', 0, 5),
        includeAds: asBoolean(raw.includeAds, 'includeAds', false),
        // One search page holds 20 products and costs the same to fetch for 1 or
        // 20 rows, so the default saves one full page.
        maxResults: asIntInRange(raw.maxResults, 'maxResults', 20, 1, 500),
        // An explicit value is a cap. Left empty, the Actor reads as many pages
        // as maxResults needs, plus headroom when filters drop rows.
        maxPagesPerQuery: raw.maxPagesPerQuery === undefined || raw.maxPagesPerQuery === null || (raw.maxPagesPerQuery as unknown) === ''
            ? undefined
            : asIntInRange(raw.maxPagesPerQuery, 'maxPagesPerQuery', 1, 1, 50),
        proxyConfiguration: resolveProxyConfiguration(asProxyConfiguration(raw.proxyConfiguration)),
        monitorName,
        onlyChanges: asBoolean(raw.onlyChanges, 'onlyChanges', false),
        priceChangeThresholdPercent: asOptionalNumberInRange(raw.priceChangeThresholdPercent, 'priceChangeThresholdPercent', 0, 100) ?? 1,
    };
}

const PAGE_SIZE = 20;
const MAX_AUTO_PAGES = 25;

export function filtersActive(input: NormalizedInput): boolean {
    return input.minPrice !== undefined || input.maxPrice !== undefined || input.minRating !== undefined || input.onlyChanges;
}

/** Pages needed for the remaining rows. Filters and onlyChanges drop rows after
 * fetching, so allow more pages; an explicit maxPagesPerQuery is a hard cap. */
export function pagesFor(input: NormalizedInput, remaining: number): number {
    if (input.maxPagesPerQuery !== undefined) return input.maxPagesPerQuery;
    const needed = Math.max(1, Math.ceil(remaining / PAGE_SIZE));
    return Math.min(MAX_AUTO_PAGES, filtersActive(input) ? needed * 4 + 1 : needed);
}
