import type { PreparedProductRecord } from './types.js';

const MEESHO_BASE_URL = 'https://www.meesho.com';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
    return isObject(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return null;
}

function textOrNA(value: unknown): string {
    return asString(value) ?? 'N/A';
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function asBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }
    return null;
}

function normalizeUrl(value: unknown): string | null {
    const url = asString(value);
    if (!url) return null;
    if (url.toLowerCase() === 'proxied content') return null;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`;
    if (url.startsWith('/')) return `${MEESHO_BASE_URL}${url}`;
    return url;
}

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return slug || 'product';
}

function uniqueStrings(values: Array<string | null>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        if (!value) continue;
        const normalized = value.replace(/\s+/g, ' ').trim();
        if (!normalized || seen.has(normalized.toLowerCase())) continue;
        seen.add(normalized.toLowerCase());
        result.push(normalized);
    }

    return result;
}

function parseSizesFromText(...texts: Array<string | null>): string[] {
    const joined = texts.filter(Boolean).join('\n');
    const match = joined.match(/sizes?\s*[:\-]?\s*([\s\S]{0,180})/i);
    if (!match?.[1]) return [];

    const section = match[1]
        .split(/\n{2,}|fabric|pattern|combo|country|net quantity|type/i)[0]
        .replace(/\bfree size\b/gi, 'Free Size');

    const sizeMatches = section.match(/\b(?:Free Size|One Size|XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-9]XL)\b/gi) ?? [];

    return uniqueStrings(sizeMatches.map((size) => size.toUpperCase().replace('FREE SIZE', 'Free Size')));
}

function packSizeFromText(...texts: Array<string | null>): string {
    const sizes = parseSizesFromText(...texts);
    return sizes.length > 0 ? sizes.join(', ') : 'N/A';
}

function discountPercent(price: number | null, mrp: number | null, raw: Record<string, unknown>): number | null {
    const explicit = asNumber(raw.discount_percent)
        ?? asNumber(raw.discountPercent)
        ?? asNumber(raw.discount)
        ?? asNumber(raw.discount_percent_with_symbol);
    if (explicit !== null) return Math.round(explicit);
    if (price !== null && mrp !== null && mrp > price) {
        return Math.round(((mrp - price) / mrp) * 100);
    }
    return null;
}

function stockFromRaw(raw: Record<string, unknown>): boolean | null {
    const inStock = asBoolean(raw.in_stock) ?? asBoolean(raw.inStock) ?? asBoolean(raw.available);
    if (inStock !== null) return inStock;
    const outOfStock = asBoolean(raw.out_of_stock) ?? asBoolean(raw.outOfStock);
    if (outOfStock !== null) return !outOfStock;
    return null;
}

function buildProductUrl(raw: Record<string, unknown>, productName: string): string | null {
    const shortProductId = asString(raw.product_id);
    if (!shortProductId) return null;

    const rawSlug = asString(raw.original_slug)
        ?? asString(raw.slug)
        ?? productName;
    const slug = slugify(rawSlug).length > 100 ? productName : rawSlug;

    return `${MEESHO_BASE_URL}/${slugify(slug)}/p/${encodeURIComponent(shortProductId)}`;
}

export function buildSearchUrl(query: string): string {
    const params = new URLSearchParams({ q: query });
    return `${MEESHO_BASE_URL}/search?${params.toString()}`;
}

export function buildSearchPayload(
    query: string,
    page: number,
    cursor: string | null,
    searchSessionId: string | null,
    limit = 20,
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        query,
        type: 'text_search',
        page,
        offset: (page - 1) * limit,
        limit,
        cursor,
        isDevicePhone: false,
    };

    if (searchSessionId) {
        payload.search_session_id = searchSessionId;
    }

    return payload;
}

export function toProductRecord(rawValue: unknown, searchQuery: string, position: number): PreparedProductRecord | null {
    const raw = asObject(rawValue);

    const productName = asString(raw.name)
        ?? asString(raw.hero_product_name)
        ?? asString(raw.description)
        ?? '';

    const catalogId = asString(raw.id)
        ?? asString(raw.catalogId)
        ?? asString(raw.catalog_id)
        ?? asString(raw.hero_pid)
        ?? asString(raw.product_id)
        ?? '';

    if (!productName || !catalogId) return null;

    const reviews = asObject(raw.catalog_reviews_summary);

    const fullDetails = asString(raw.full_details);
    const shareText = asString(raw.share_text);
    const description = asString(raw.description);

    const price = asNumber(raw.min_catalog_price) ?? asNumber(raw.price);
    const mrp = asNumber(raw.original_price)
        ?? asNumber(raw.mrp)
        ?? asNumber(raw.max_catalog_price)
        ?? asNumber(raw.strikethrough_price);
    const productUrl = buildProductUrl(raw, productName);
    const productId = asString(raw.product_id);

    return {
        source: 'meesho',
        searchQuery: textOrNA(searchQuery),
        position,
        productId,
        title: productName,
        brand: textOrNA(raw.brand_name ?? raw.brand ?? raw.manufacturer),
        price,
        mrp: mrp !== null && price !== null && mrp <= price ? null : mrp,
        discountPercent: discountPercent(price, mrp, raw),
        currency: 'INR',
        packSize: packSizeFromText(fullDetails, shareText, description),
        category: textOrNA(raw.sub_sub_category_name ?? raw.category_name ?? raw.category),
        rating: asNumber(reviews.average_rating) ?? asNumber(reviews.rating),
        ratingCount: asNumber(reviews.rating_count) ?? asNumber(reviews.ratingCount),
        inStock: stockFromRaw(raw),
        productUrl,
        imageUrl: normalizeUrl(raw.image),
        scrapedAt: new Date().toISOString(),
        uniqueKey: catalogId || productId || productUrl || productName,
        isAdProduct: asBoolean(raw.isAdProduct) ?? false,
    };
}
