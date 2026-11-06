import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeInput, pagesFor, resolveProxyConfiguration } from '../dist/input.js';
import { buildSearchPayload, buildSearchUrl, parseAttributes, parseDispatchDays, parseSizes, toProductRecord } from '../dist/routes.js';
import { compareObservation, entryKey, mergeState, MAX_MONITORED, monitorKey, restoreState } from '../dist/monitor.js';

const meeshoCatalog = {
    id: 112525643,
    product_id: '6dy8dt',
    name: 'Women Rayon Banita Alluring Kurtis',
    original_slug: 'women-rayon-banita-alluring-kurtis',
    brand_name: '',
    min_catalog_price: '₹197',
    original_price: '₹399',
    discount_percent_with_symbol: '51%',
    sub_sub_category_name: 'Kurtis & Kurtas',
    catalog_reviews_summary: {
        average_rating: '4.1',
        rating_count: '20,362',
    },
    full_details: 'Fabric: Rayon\nSizes: S, M, L, XL\nCountry of Origin: India',
    image: '//images.meesho.com/images/catalogs/example_512.jpg',
    isAdProduct: false,
};

test('normalizes default input to one full kurti page', () => {
    const input = normalizeInput({});

    assert.deepEqual(input.searchQueries, ['kurti']);
    assert.equal(input.includeAds, false);
    assert.equal(input.maxResults, 20);
    assert.equal(input.maxPagesPerQuery, undefined);
    assert.equal(pagesFor(input, 20), 1);
    assert.equal(input.onlyChanges, false);
    assert.equal(input.proxyConfiguration.useApifyProxy, true);
    assert.deepEqual(input.proxyConfiguration.apifyProxyGroups, ['RESIDENTIAL']);
    assert.equal(input.proxyConfiguration.apifyProxyCountry, 'IN');
});

test('rejects oversized or invalid input values', () => {
    assert.throws(
        () => normalizeInput({ searchQueries: ['a', 'b', 'c', 'd', 'e', 'f'] }),
        /at most 5/,
    );
    assert.throws(
        () => normalizeInput({ searchQueries: ['kurti'], maxResults: 0 }),
        /between 1 and 500/,
    );
    assert.throws(
        () => normalizeInput({ searchQueries: ['kurti'], minRating: 6 }),
        /minRating/,
    );
    assert.throws(
        () => normalizeInput({ searchQueries: ['kurti'], minPrice: 500, maxPrice: 100 }),
        /maxPrice/,
    );
});

test('builds Meesho search URLs and API payloads', () => {
    assert.equal(buildSearchUrl('cotton kurti'), 'https://www.meesho.com/search?q=cotton+kurti');

    const payload = buildSearchPayload('cotton kurti', 2, 'next-cursor', 'session-1', 20);
    assert.equal(payload.query, 'cotton kurti');
    assert.equal(payload.page, 2);
    assert.equal(payload.offset, 20);
    assert.equal(payload.limit, 20);
    assert.equal(payload.cursor, 'next-cursor');
    assert.equal(payload.search_session_id, 'session-1');
});

test('extracts Meesho product rows in the public dataset shape', () => {
    const record = toProductRecord(meeshoCatalog, 'kurti', 1);

    assert.ok(record);
    assert.equal(record.source, 'meesho');
    assert.equal(record.searchQuery, 'kurti');
    assert.equal(record.position, 1);
    assert.equal(record.productId, '6dy8dt');
    assert.equal(record.title, 'Women Rayon Banita Alluring Kurtis');
    assert.equal(record.brand, 'N/A');
    assert.equal(record.price, 197);
    assert.equal(record.mrp, 399);
    assert.equal(record.discountPercent, 51);
    assert.equal(record.currency, 'INR');
    assert.equal(record.packSize, 'S, M, L, XL');
    assert.equal(record.category, 'Kurtis & Kurtas');
    assert.equal(record.rating, 4.1);
    assert.equal(record.ratingCount, 20362);
    assert.equal(record.inStock, null);
    assert.equal(record.productUrl, 'https://www.meesho.com/women-rayon-banita-alluring-kurtis/p/6dy8dt');
    assert.equal(record.imageUrl, 'https://images.meesho.com/images/catalogs/example_512.jpg');
    assert.equal(record.uniqueKey, '112525643');
    assert.equal(record.isAdProduct, false);
});

const sareeDetails = 'Saree Fabric: Banarasi Silk\nBlouse: Running Blouse\nPattern: Variable (Product Dependent)\nNet Quantity (N): Single\nSizes: \nFree Size (Saree Length Size: 5.7 m, Blouse Length Size: 0.8 m) \n\nDispatch: 2-2 Days';
const kurtiDetails = 'Fabric: Cotton\nSleeve Length: Three-Quarter Sleeves\nSizes:\nS (Bust Size: 36 in, Size Length: 44 in) \nM (Bust Size: 38 in, Size Length: 44 in) \nXL (Bust Size: 42 in, Size Length: 44 in) \n\nCountry of Origin: India\nDispatch: 1-3 Days';

test('reads sizes from the Sizes block without picking up measurement units', () => {
    assert.deepEqual(parseSizes(sareeDetails), ['Free Size']);
    assert.deepEqual(parseSizes(kurtiDetails), ['S', 'M', 'XL']);
    assert.deepEqual(parseSizes('Fabric: Rayon\nSizes: S, M, L, XL\nCountry of Origin: India'), ['S', 'M', 'L', 'XL']);
    assert.deepEqual(parseSizes('Type: Neckband'), []);
});

test('parses structured attributes and dispatch days', () => {
    assert.deepEqual(parseAttributes(kurtiDetails), { Fabric: 'Cotton', 'Sleeve Length': 'Three-Quarter Sleeves', 'Country of Origin': 'India' });
    assert.equal(parseAttributes(sareeDetails)['Saree Fabric'], 'Banarasi Silk');
    assert.equal(parseDispatchDays(sareeDetails), 2);
    assert.equal(parseDispatchDays(kurtiDetails), 3);
    assert.equal(parseDispatchDays('Fabric: Cotton'), null);
});

test('adds shipping, offer, supplier and listing fields', () => {
    const record = toProductRecord({
        ...meeshoCatalog,
        min_catalog_price: 198,
        full_details: kurtiDetails,
        shipping: { charges: 61, discount: 9, show_free_delivery: false },
        special_offers: { display_text: '₹176 with 1 Special Offer', offers: [{ type: 'cod_unbundling', amount: 22 }] },
        state_code: 'GJ',
        assured_details: { is_assured: true },
        tags: [{ name: 'NEXT DAY DISPATCH' }],
        num_designs: 9,
        created_iso: '2025-01-29T14:22:02+0530',
        product_images: [{ url: 'https://images.meesho.com/a.jpg' }, { url: 'https://images.meesho.com/b.jpg' }],
    }, 'kurti', 3);
    assert.equal(record.shippingCharge, 61);
    assert.equal(record.landedPrice, 259);
    assert.equal(record.specialOfferPrice, 176);
    assert.equal(record.supplierState, 'Gujarat');
    assert.equal(record.meeshoAssured, true);
    assert.equal(record.fastDispatch, true);
    assert.equal(record.dispatchDays, 3);
    assert.equal(record.designCount, 9);
    assert.equal(record.listedAt, '2025-01-29T08:52:02.000Z');
    assert.equal(record.packSize, 'S, M, XL');
    assert.equal(record.imageUrls.length, 3);
});

test('plain Apify Proxy uses Residential India; explicit choices are kept', () => {
    assert.deepEqual(resolveProxyConfiguration({ useApifyProxy: true }), { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'IN' });
    assert.deepEqual(resolveProxyConfiguration({ useApifyProxy: false }), { useApifyProxy: false });
    assert.deepEqual(resolveProxyConfiguration({ useApifyProxy: true, apifyProxyGroups: ['SHADER'] }), { useApifyProxy: true, apifyProxyGroups: ['SHADER'] });
    assert.deepEqual(normalizeInput({ proxyConfiguration: { useApifyProxy: true } }).proxyConfiguration.apifyProxyGroups, ['RESIDENTIAL']);
});

test('filters and onlyChanges read extra pages; an explicit page cap wins', () => {
    assert.equal(pagesFor(normalizeInput({ maxResults: 50 }), 50), 3);
    assert.equal(pagesFor(normalizeInput({ maxResults: 10, minPrice: 400 }), 10), 5);
    assert.equal(pagesFor(normalizeInput({ maxResults: 500, minPrice: 400 }), 500), 25);
    assert.equal(pagesFor(normalizeInput({ maxResults: 50, maxPagesPerQuery: 1 }), 50), 1);
    assert.throws(() => normalizeInput({ onlyChanges: true }), /monitorName/);
    assert.throws(() => normalizeInput({ monitorName: '!bad' }), /monitorName/);
});

test('monitor compares price, rank and new ratings against the previous run', () => {
    const now = '2026-11-07T00:00:00.000Z';
    assert.equal(compareObservation(undefined, { price: 200, position: 5, ratingCount: 10 }, now, 1).changeType, 'new');
    const previous = { price: 200, position: 5, ratingCount: 10, firstSeenAt: '2026-11-01T00:00:00.000Z', observedAt: '2026-11-06T00:00:00.000Z' };
    const drop = compareObservation(previous, { price: 180, position: 2, ratingCount: 25 }, now, 1);
    assert.equal(drop.changeType, 'price_drop');
    assert.equal(drop.priceChange, -20);
    assert.equal(drop.priceChangePercent, -10);
    assert.equal(drop.positionChange, 3);
    assert.equal(drop.newRatings, 15);
    assert.equal(drop.firstSeenAt, '2026-11-01T00:00:00.000Z');
    assert.equal(compareObservation(previous, { price: 201, position: 5, ratingCount: 10 }, now, 1).changeType, 'unchanged');
    assert.equal(compareObservation(previous, { price: 230, position: 5, ratingCount: 10 }, now, 1).changeType, 'price_increase');
    assert.equal(monitorKey('My Kurti Watch'), 'MONITOR-my-kurti-watch');
    assert.equal(entryKey(' Kurti ', '123'), 'kurti|123');
    assert.deepEqual(restoreState('garbage').entries, {});
    const big = {};
    for (let i = 0; i < MAX_MONITORED + 5; i++) big[`q|${i}`] = { ...previous, observedAt: new Date(1e12 + i).toISOString() };
    const merged = mergeState({ version: 1, updatedAt: '', entries: {} }, big, now);
    assert.equal(Object.keys(merged.entries).length, MAX_MONITORED);
    assert.ok(!('q|0' in merged.entries));
});
