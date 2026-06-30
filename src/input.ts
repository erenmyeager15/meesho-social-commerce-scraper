import type { ActorInput, ProxyInput } from './types.js';

export interface NormalizedInput {
    searchQueries: string[];
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    includeAds: boolean;
    maxResults: number;
    maxPagesPerQuery: number;
    proxyConfiguration: ProxyInput;
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

export function normalizeInput(raw: ActorInput = {}): NormalizedInput {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Input must be a JSON object.');

    const minPrice = asOptionalNumberInRange(raw.minPrice, 'minPrice', 0, 1_000_000);
    const maxPrice = asOptionalNumberInRange(raw.maxPrice, 'maxPrice', 0, 1_000_000);
    if (minPrice !== undefined && maxPrice !== undefined && maxPrice < minPrice) {
        fail('must be greater than or equal to minPrice.', 'maxPrice');
    }

    return {
        searchQueries: asStringArray(raw.searchQueries, 'searchQueries', ['kurti'], 1, 5),
        minPrice,
        maxPrice,
        minRating: asOptionalNumberInRange(raw.minRating, 'minRating', 0, 5),
        includeAds: asBoolean(raw.includeAds, 'includeAds', false),
        maxResults: asIntInRange(raw.maxResults, 'maxResults', 1, 1, 500),
        maxPagesPerQuery: asIntInRange(raw.maxPagesPerQuery, 'maxPagesPerQuery', 1, 1, 50),
        proxyConfiguration: asProxyConfiguration(raw.proxyConfiguration),
    };
}
