import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeInput } from '../dist/input.js';
import { buildSearchPayload, buildSearchUrl, toProductRecord } from '../dist/routes.js';

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

test('normalizes default input to one low-cost kurti run', () => {
    const input = normalizeInput({});

    assert.deepEqual(input.searchQueries, ['kurti']);
    assert.equal(input.includeAds, false);
    assert.equal(input.maxResults, 1);
    assert.equal(input.maxPagesPerQuery, 1);
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
