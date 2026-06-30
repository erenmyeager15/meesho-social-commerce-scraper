import { Actor } from 'apify';
import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';
import { normalizeInput } from './input.js';
import { buildSearchPayload, buildSearchUrl, toProductRecord } from './routes.js';
import type { ActorInput, PreparedProductRecord, SearchResponse } from './types.js';
import type { NormalizedInput } from './input.js';

const MEESHO_SEARCH_API = 'https://www.meesho.com/api/v1/products/search';
const PAGE_SIZE = 20;
const MAX_RETRIES = 3;

function logInfo(message: string, data?: Record<string, unknown>): void {
    console.log(data ? `${message} ${JSON.stringify(data)}` : message);
}

function logWarn(message: string, data?: Record<string, unknown>): void {
    console.warn(data ? `${message} ${JSON.stringify(data)}` : message);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldKeepRecord(record: PreparedProductRecord, input: NormalizedInput): boolean {
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
    const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration as never);

    logInfo('Starting Meesho Product Scraper', {
        searchQueries: input.searchQueries,
        maxResults: input.maxResults,
        maxPagesPerQuery: input.maxPagesPerQuery,
    });

    const seen = new Set<string>();
    let saved = 0;
    let chargeLimitReached = false;
    let fatalBillingError: Error | null = null;
    const skippedPages: Array<{ query: string; page: number; reason: string }> = [];

    searchLoop:
    for (const query of input.searchQueries) {
        let cursor: string | null = null;
        let searchSessionId: string | null = null;

        for (let page = 1; page <= input.maxPagesPerQuery; page++) {
            if (saved >= input.maxResults || chargeLimitReached || fatalBillingError) break searchLoop;

            let response: SearchResponse;
            try {
                response = await fetchSearchPage({
                    query,
                    page,
                    cursor,
                    searchSessionId,
                    proxyConfiguration,
                });
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                skippedPages.push({ query, page, reason });
                logWarn('Skipping remaining Meesho pages for query after repeated request failures', {
                    query,
                    page,
                    reason,
                });
                break;
            }

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

                const uniqueKey = record.uniqueKey;
                if (!uniqueKey || seen.has(uniqueKey)) continue;
                const datasetRecord = {
                    source: record.source,
                    searchQuery: record.searchQuery,
                    position: record.position,
                    productId: record.productId,
                    title: record.title,
                    brand: record.brand,
                    price: record.price,
                    mrp: record.mrp,
                    discountPercent: record.discountPercent,
                    currency: record.currency,
                    packSize: record.packSize,
                    category: record.category,
                    rating: record.rating,
                    ratingCount: record.ratingCount,
                    inStock: record.inStock,
                    productUrl: record.productUrl,
                    imageUrl: record.imageUrl,
                    scrapedAt: record.scrapedAt,
                };

                try {
                    const chargeResult = await Actor.pushData(datasetRecord, 'product-scraped');
                    const recordWasSaved = chargeResult.chargedCount > 0
                        || !chargeResult.eventChargeLimitReached;

                    if (recordWasSaved) {
                        seen.add(uniqueKey);
                        saved += 1;
                    }

                    if (chargeResult?.eventChargeLimitReached) {
                        chargeLimitReached = true;
                        await Actor.setStatusMessage(`Stopped at the user's spending limit after ${saved} products`);
                        logWarn('User spending limit reached; stopping after the last saved product.', { saved });
                        break searchLoop;
                    }
                } catch (error) {
                    fatalBillingError = error instanceof Error ? error : new Error(String(error));
                    chargeLimitReached = true;
                    await Actor.setStatusMessage('Stopped because product output billing failed.');
                    logWarn('Stopping Meesho run because dataset push with product-scraped charge failed.', {
                        error: fatalBillingError.message,
                    });
                    throw fatalBillingError;
                }
            }

            if (!cursor) break;
            await sleep(700 + Math.floor(Math.random() * 700));
        }
    }

    if (fatalBillingError) throw fatalBillingError;
    if (saved === 0 && !chargeLimitReached) {
        const skipped = skippedPages.map((item) => `${item.query} page ${item.page}: ${item.reason}`).join('; ');
        throw new Error(`Meesho scrape finished with no saved products.${skipped ? ` Skipped pages: ${skipped}` : ''}`);
    }
    if (skippedPages.length > 0) {
        logWarn('Some Meesho pages were skipped', { skippedPages });
    }

    if (!chargeLimitReached) {
        await Actor.setStatusMessage(`Finished with ${saved} Meesho products`);
    }

    logInfo('Meesho scrape complete', {
        saved,
        uniqueProducts: seen.size,
        chargeLimitReached,
    });
});
