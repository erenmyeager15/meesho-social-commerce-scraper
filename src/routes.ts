import type { ProductRecord } from './types.js';

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

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    if (typeof value === 'string') {
        const cleaned = value.replace(/[,₹\s]/g, '');
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
    if (url.startsWith('//')) return `https:${url}`;
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

function stringsFromArray(value: unknown): string[] {
    return uniqueStrings(asArray(value).map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'number' && Number.isFinite(item)) return String(item);

        const object = asObject(item);
        return asString(object.name)
            ?? asString(object.label)
            ?? asString(object.text)
            ?? asString(object.value)
            ?? null;
    }));
}

function tagsFromArray(value: unknown): string[] {
    return stringsFromArray(value).filter((item) => item.length <= 80);
}

function parseProductAttributes(value: unknown): string[] {
    return uniqueStrings(asArray(value).map((item) => {
        if (typeof item === 'string') return item;

        const object = asObject(item);
        const key = asString(object.name) ?? asString(object.key) ?? asString(object.attribute_name);
        const rawValue = asString(object.value) ?? asString(object.attribute_value);
        if (key && rawValue) return `${key}: ${rawValue}`;
        return key ?? rawValue;
    }));
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

export function toProductRecord(rawValue: unknown, searchQuery: string, position: number): ProductRecord | null {
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
    const shipping = asObject(raw.shipping);
    const assuredDetails = asObject(raw.assured_details);

    const fullDetails = asString(raw.full_details);
    const shareText = asString(raw.share_text);
    const description = asString(raw.description);

    const productAttributes = parseProductAttributes(raw.product_attributes);
    const rawTags = [
        ...tagsFromArray(raw.tags),
        ...tagsFromArray(raw.gray_tags),
    ];

    return {
        source: 'meesho',
        searchQuery,
        position,
        catalogId,
        productId: asString(raw.product_id),
        heroProductId: asString(raw.hero_pid),
        productName,
        heroProductName: asString(raw.hero_product_name),
        categoryId: asNumber(raw.category_id),
        category: asString(raw.sub_sub_category_name),
        description,
        price: asNumber(raw.min_catalog_price),
        minProductPrice: asNumber(raw.min_product_price),
        currency: 'INR',
        rating: asNumber(reviews.average_rating) ?? asNumber(reviews.rating),
        reviewCount: asNumber(reviews.review_count) ?? asNumber(reviews.reviewCount),
        ratingCount: asNumber(reviews.rating_count) ?? asNumber(reviews.ratingCount),
        numDesigns: asNumber(raw.num_designs),
        availableSizes: parseSizesFromText(fullDetails, shareText, description),
        freeDelivery: asBoolean(shipping.show_free_delivery),
        shippingCharges: asNumber(shipping.charges),
        expressDelivery: asBoolean(shipping.is_express_delivery),
        assured: asBoolean(assuredDetails.is_assured) ?? asBoolean(assuredDetails.assured),
        mallVerified: asBoolean(raw.mall_verified),
        isAdProduct: asBoolean(raw.isAdProduct) ?? false,
        tags: uniqueStrings(rawTags),
        productAttributes,
        imageUrl: normalizeUrl(raw.image),
        collageImageUrl: normalizeUrl(raw.collage_image),
        imagesCount: asArray(raw.product_images).length,
        productUrl: buildProductUrl(raw, productName),
        createdAt: asString(raw.created_iso) ?? asString(raw.created),
        scrapedAt: new Date().toISOString(),
    };
}
