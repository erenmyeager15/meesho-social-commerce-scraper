import { Actor } from 'apify';
import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';
import { buildSearchPayload, buildSearchUrl, toProductRecord } from './routes.js';
import type { ActorInput, ProductRecord, ProxyInput, SearchResponse } from './types.js';

const MEESHO_SEARCH_API = 'https://www.meesho.com/api/v1/products/search';
const PAGE_SIZE = 20;
const MAX_RETRIES = 3;

interface NormalizedInput {
    searchQueries: string[];
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    includeAds: boolean;
    maxResults: number;
    maxPagesPerQuery: number;
    proxyConfiguration?: ProxyInput;
}

function logInfo(message: string, data?: Record<string, unknown>): void {
    console.log(data ? `${message} ${JSON.stringify(data)}` : message);
}

function logWarn(message: string, data?: Record<string, unknown>): void {
    console.warn(data ? `${message} ${JSON.stringify(data)}` : message);
}

function cleanStringArray(values: unknown, fallback: string[]): string[] {
    const list = Array.isArray(values) ? values : [];
    const cleaned = list
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);

    return cleaned.length ? Array.from(new Set(cleaned)) : fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeInput(input: ActorInput): NormalizedInput {
    return {
        searchQueries: cleanStringArray(input.searchQueries, ['kurti']),
        minPrice: typeof input.minPrice === 'number' ? input.minPrice : undefined,
        maxPrice: typeof input.maxPrice === 'number' ? input.maxPrice : undefined,
        minRating: typeof input.minRating === 'number' ? input.minRating : undefined,
        includeAds: input.includeAds ?? false,
        maxResults: clampInteger(input.maxResults, 100, 1, 500),
        maxPagesPerQuery: clampInteger(input.maxPagesPerQuery, 10, 1, 50),
        proxyConfiguration: input.proxyConfiguration ?? {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
            apifyProxyCountry: 'IN',
        },
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldKeepRecord(record: ProductRecord, input: NormalizedInput): boolean {
    if (!input.includeAds && record.isAdProduct) return false;

    if (typeof input.minPrice === 'number' && (record.price === null || record.price < input.minPrice)) {
        return false;
    }

    if (typeof input.maxPrice === 'number' && (record.price === null || record.price > input.maxPrice)) {
        return false;
    }

    if (typeof input.minRating === 'number' && (record.rating === null || record.rating < input.minRating)) {
        return false;
    }

    return true;
}

async function fetchSearchPage(options: {
    query: string;
    page: number;
    cursor: string | null;
    searchSessionId: string | null;
    proxyConfiguration?: { newUrl: () => Promise<string | undefined> };
}): Promise<SearchResponse> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        let dispatcher: Dispatcher | undefined;

        try {
            const proxyUrl = options.proxyConfiguration ? await options.proxyConfiguration.newUrl() : undefined;
            dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

            const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
                method: 'POST',
                headers: {
                    accept: 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9',
                    'content-type': 'application/json',
                    origin: 'https://www.meesho.com',
                    referer: buildSearchUrl(options.query),
                    'meesho-iso-country-code': 'IN',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
                },
                body: JSON.stringify(buildSearchPayload(
                    options.query,
                    options.page,
                    options.cursor,
                    options.searchSessionId,
                    PAGE_SIZE,
                )),
                signal: controller.signal,
            };

            if (dispatcher) requestInit.dispatcher = dispatcher;

            const response = await fetch(MEESHO_SEARCH_API, requestInit);
            const body = await response.text();

            if (!response.ok) {
                throw new Error(`Meesho search returned ${response.status}: ${body.slice(0, 300)}`);
            }

            const parsed = JSON.parse(body) as SearchResponse;
            return parsed;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt > MAX_RETRIES) {
                break;
            }

            const delay = 1_000 + attempt * 750 + Math.floor(Math.random() * 1_000);
            logWarn('Search request failed, retrying', {
                query: options.query,
                page: options.page,
                attempt,
                error: lastError.message,
                delayMs: delay,
            });
            await sleep(delay);
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError ?? new Error('Unknown Meesho search request error');
}

Actor.main(async () => {
    const input = normalizeInput((await Actor.getInput<ActorInput>()) ?? {});
    const proxyConfiguration = input.proxyConfiguration
        ? await Actor.createProxyConfiguration(input.proxyConfiguration as never)
        : undefined;

    logInfo('Starting Meesho Product Scraper', {
        searchQueries: input.searchQueries,
        maxResults: input.maxResults,
        maxPagesPerQuery: input.maxPagesPerQuery,
    });

    const seen = new Set<string>();
    let saved = 0;
    let chargeLimitReached = false;

    searchLoop:
    for (const query of input.searchQueries) {
        let cursor: string | null = null;
        let searchSessionId: string | null = null;

        for (let page = 1; page <= input.maxPagesPerQuery; page++) {
            if (saved >= input.maxResults || chargeLimitReached) break searchLoop;

            const response = await fetchSearchPage({
                query,
                page,
                cursor,
                searchSessionId,
                proxyConfiguration,
            });

            const catalogs = Array.isArray(response.catalogs) ? response.catalogs : [];
            cursor = response.cursor ?? null;
            searchSessionId = response.search_session_id ?? searchSessionId;

            logInfo('Fetched Meesho page', {
                query,
                page,
                catalogs: catalogs.length,
                hasCursor: Boolean(cursor),
            });

            if (!catalogs.length) break;

            for (const [index, catalog] of catalogs.entries()) {
                if (saved >= input.maxResults) break searchLoop;

                const position = (page - 1) * PAGE_SIZE + index + 1;
                const record = toProductRecord(catalog, query, position);
                if (!record || !shouldKeepRecord(record, input)) continue;

                const uniqueKey = record.catalogId || record.productId || record.productUrl;
                if (!uniqueKey || seen.has(uniqueKey)) continue;
                seen.add(uniqueKey);

                await Actor.pushData(record);
                const chargeResult = await Actor.charge({ eventName: 'product-scraped' });
                saved++;

                if (chargeResult?.eventChargeLimitReached) {
                    chargeLimitReached = true;
                    logWarn('User spending limit reached; stopping after the last saved product.', { saved });
                    break searchLoop;
                }
            }

            if (!cursor) break;
            await sleep(700 + Math.floor(Math.random() * 700));
        }
    }

    logInfo('Meesho scrape complete', {
        saved,
        uniqueProducts: seen.size,
        chargeLimitReached,
    });
});
