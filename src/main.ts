import { Actor } from 'apify';
import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';
import { normalizeInput, pagesFor } from './input.js';
import { buildSearchPayload, buildSearchUrl, toProductRecord } from './routes.js';
import { compareObservation, emptyState, entryKey, mergeState, MONITOR_STORE_NAME, monitorKey, restoreState } from './monitor.js';
import type { MonitorEntry, MonitorState } from './monitor.js';
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

/** Short, readable reason; never dump the source's HTML error page into logs. */
function describeHttpFailure(status: number, body: string): string {
    if (status === 403 || /access denied/i.test(body)) {
        return 'Meesho returned HTTP 403 (access denied). Use Apify Residential proxy with country India.';
    }
    if (status === 429) return 'Meesho returned HTTP 429 (rate limited).';
    return `Meesho search returned HTTP ${status}.`;
}

async function fetchSearchPage(options: {
    query: string;
    page: number;
    cursor: string | null;
    searchSessionId: string | null;
    proxyConfiguration?: { newUrl: (sessionId?: string) => Promise<string | undefined> };
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

            if (!response.ok) throw new Error(describeHttpFailure(response.status, body));

            return JSON.parse(body) as SearchResponse;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (lastError.name === 'SyntaxError') lastError = new Error('Meesho returned a response that was not JSON.');

            if (attempt > MAX_RETRIES) break;

            const delay = 1_000 + attempt * 750 + Math.floor(Math.random() * 1_000);
            logWarn('Search request failed, retrying with a new proxy session', {
                query: options.query,
                page: options.page,
                attempt,
                error: lastError.message,
                delayMs: delay,
            });
            await sleep(delay);
        } finally {
            clearTimeout(timeout);
            if (dispatcher) await dispatcher.close().catch(() => undefined);
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
        maxPagesPerQuery: input.maxPagesPerQuery ?? 'auto',
        monitorName: input.monitorName ?? null,
        onlyChanges: input.onlyChanges,
        proxy: input.proxyConfiguration.apifyProxyGroups?.join(',') || (input.proxyConfiguration.proxyUrls?.length ? 'custom' : 'none'),
    });

    const monitorStore = input.monitorName ? await Actor.openKeyValueStore(MONITOR_STORE_NAME) : null;
    const monitorStateKey = input.monitorName ? monitorKey(input.monitorName) : null;
    const previousState: MonitorState = monitorStore && monitorStateKey
        ? restoreState(await monitorStore.getValue(monitorStateKey))
        : emptyState();
    const isBaseline = Object.keys(previousState.entries).length === 0;
    const observations: Record<string, MonitorEntry> = {};
    const changeCounts = { new: 0, price_drop: 0, price_increase: 0, unchanged: 0 };

    const seen = new Set<string>();
    let saved = 0;
    let pagesFetched = 0;
    let filteredOut = 0;
    let unchangedSkipped = 0;
    let chargeLimitReached = false;
    let fatalBillingError: Error | null = null;
    const skippedPages: Array<{ query: string; page: number; reason: string }> = [];
    const perQuery: Array<{ query: string; pages: number; saved: number; stoppedBy: string }> = [];
    const now = new Date().toISOString();

    searchLoop:
    for (const query of input.searchQueries) {
        let cursor: string | null = null;
        let searchSessionId: string | null = null;
        const queryStats = { query, pages: 0, saved: 0, stoppedBy: 'page_limit' };
        perQuery.push(queryStats);
        const pageLimit = pagesFor(input, input.maxResults - saved);

        for (let page = 1; page <= pageLimit; page++) {
            if (saved >= input.maxResults) { queryStats.stoppedBy = 'max_results'; break searchLoop; }
            if (chargeLimitReached || fatalBillingError) { queryStats.stoppedBy = 'spending_limit'; break searchLoop; }

            let response: SearchResponse;
            try {
                response = await fetchSearchPage({ query, page, cursor, searchSessionId, proxyConfiguration });
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                skippedPages.push({ query, page, reason });
                queryStats.stoppedBy = 'request_failed';
                logWarn('Skipping remaining Meesho pages for query after repeated request failures', { query, page, reason });
                break;
            }

            pagesFetched += 1;
            queryStats.pages += 1;
            const catalogs = Array.isArray(response.catalogs) ? response.catalogs : [];
            cursor = response.cursor ?? null;
            searchSessionId = response.search_session_id ?? searchSessionId;

            logInfo('Fetched Meesho page', { query, page, catalogs: catalogs.length, hasCursor: Boolean(cursor) });

            if (!catalogs.length) { queryStats.stoppedBy = 'no_more_results'; break; }

            for (const [index, catalog] of catalogs.entries()) {
                if (saved >= input.maxResults) { queryStats.stoppedBy = 'max_results'; break searchLoop; }

                const position = (page - 1) * PAGE_SIZE + index + 1;
                const record = toProductRecord(catalog, query, position);
                if (!record) continue;
                if (!shouldKeepRecord(record, input)) { filteredOut += 1; continue; }

                const uniqueKey = record.uniqueKey;
                if (!uniqueKey || seen.has(uniqueKey)) continue;
                seen.add(uniqueKey);

                const { uniqueKey: _key, isAdProduct: _ad, ...datasetRecord } = record;
                let output: Record<string, unknown> = datasetRecord;
                if (monitorStore) {
                    const key = entryKey(query, record.catalogId);
                    const change = compareObservation(previousState.entries[key],
                        { price: record.price, position, ratingCount: record.ratingCount }, now, input.priceChangeThresholdPercent);
                    observations[key] = { price: record.price, position, ratingCount: record.ratingCount,
                        firstSeenAt: change.firstSeenAt, observedAt: now };
                    changeCounts[change.changeType] += 1;
                    // New listings and price moves are changes; only unchanged rows are skipped (and not charged).
                    if (input.onlyChanges && change.changeType === 'unchanged') {
                        unchangedSkipped += 1;
                        continue;
                    }
                    output = { ...datasetRecord, monitorName: input.monitorName, ...change };
                }

                try {
                    const chargeResult = await Actor.pushData(output, 'product-scraped');
                    const recordWasSaved = chargeResult.chargedCount > 0 || !chargeResult.eventChargeLimitReached;
                    if (recordWasSaved) { saved += 1; queryStats.saved += 1; }

                    if (chargeResult?.eventChargeLimitReached) {
                        chargeLimitReached = true;
                        queryStats.stoppedBy = 'spending_limit';
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

            if (!cursor) { queryStats.stoppedBy = 'no_more_results'; break; }
            await sleep(700 + Math.floor(Math.random() * 700));
        }
    }

    if (fatalBillingError) throw fatalBillingError;

    // Commit the monitor only when every requested query was read, so a
    // blocked page cannot make products look new or delisted next time.
    let monitorCommitted = false;
    if (monitorStore && monitorStateKey && skippedPages.length === 0 && pagesFetched > 0) {
        await monitorStore.setValue(monitorStateKey, mergeState(previousState, observations, now));
        monitorCommitted = true;
    }

    const summary = {
        status: saved > 0 || chargeLimitReached ? (skippedPages.length ? 'partial' : 'complete')
            : pagesFetched > 0 ? 'no_matches' : 'failed',
        savedProducts: saved,
        pagesFetched,
        filteredOut,
        unchangedSkipped,
        spendingLimitReached: chargeLimitReached,
        queries: perQuery,
        skippedPages,
        monitor: input.monitorName ? { name: input.monitorName, baseline: isBaseline, committed: monitorCommitted, changes: changeCounts } : null,
    };
    await Actor.setValue('OUTPUT', summary);

    if (summary.status === 'failed') {
        const skipped = skippedPages.map((item) => `${item.query} page ${item.page}: ${item.reason}`).join('; ');
        throw new Error(`Meesho scrape saved no products.${skipped ? ` ${skipped}` : ''}`);
    }
    if (skippedPages.length > 0) logWarn('Some Meesho pages were skipped', { skippedPages });

    if (!chargeLimitReached) {
        const message = summary.status === 'no_matches'
            ? (input.onlyChanges && unchangedSkipped > 0
                ? `Finished: no price changes since the last run (${unchangedSkipped} unchanged products, not charged).`
                : `Finished: no products matched the filters in ${pagesFetched} page(s). Widen the filters or raise maxPagesPerQuery.`)
            : `Finished with ${saved} Meesho products${input.monitorName ? ` (${changeCounts.price_drop} price drops, ${changeCounts.price_increase} increases, ${changeCounts.new} new)` : ''}`;
        await Actor.setStatusMessage(message);
    }

    logInfo('Meesho scrape complete', { saved, pagesFetched, filteredOut, unchangedSkipped, chargeLimitReached, monitorCommitted });
});
