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

const SIZE_TOKEN = /^(Free Size|One Size|XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-9]XL|\d{1,3}(?:\s?(?:cm|in|inch|years?|yrs?|months?|mo|y))?|\d{1,2}-\d{1,2}\s?(?:years?|yrs?|months?|y))\b/i;

/** Meesho lists one size per line under "Sizes:", e.g. "S (Bust Size: 36 in)"
 * or "Free Size (Saree Length Size: 5.7 m)". Read only the token before the
 * bracket so "5.7 m" is not mistaken for size "M". */
export function parseSizes(fullDetails: string | null): string[] {
    if (!fullDetails) return [];
    const lines = fullDetails.split(/\r?\n/);
    const start = lines.findIndex((line) => /^\s*sizes?\s*:/i.test(line));
    if (start < 0) return [];
    const inline = lines[start].replace(/^\s*sizes?\s*:/i, '').trim();
    const candidates = inline ? inline.split(/,\s*/) : [];
    for (const line of lines.slice(start + 1)) {
        if (!line.trim()) break;
        if (/^[A-Za-z ]{2,40}:\s/.test(line) && !SIZE_TOKEN.test(line.trim())) break;
        candidates.push(line);
    }
    const sizes = candidates.map((value) => {
        const head = value.split('(')[0].trim();
        const token = head.match(SIZE_TOKEN)?.[1] ?? null;
        if (!token) return null;
        return /^free size$/i.test(token) ? 'Free Size' : /^one size$/i.test(token) ? 'One Size' : token.toUpperCase();
    });
    return uniqueStrings(sizes);
}

function packSizeFromText(fullDetails: string | null, ...fallbacks: Array<string | null>): string {
    const sizes = parseSizes(fullDetails);
    if (sizes.length > 0) return sizes.join(', ');
    const legacy = parseSizesFromText(fullDetails, ...fallbacks);
    return legacy.length > 0 ? legacy.join(', ') : 'N/A';
}

/** Structured attributes from the catalog's "Key: Value" lines, without the
 * size block and the dispatch line (exposed separately). */
export function parseAttributes(fullDetails: string | null): Record<string, string> {
    const attributes: Record<string, string> = {};
    if (!fullDetails) return attributes;
    let inSizes = false;
    for (const rawLine of fullDetails.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) { inSizes = false; continue; }
        const match = line.match(/^([A-Za-z][A-Za-z0-9 ()/&.-]{1,40}?)\s*:\s*(.*)$/);
        if (!match) continue;
        const key = match[1].trim();
        const value = match[2].trim();
        if (/^sizes?$/i.test(key)) { inSizes = true; continue; }
        if (inSizes && SIZE_TOKEN.test(line)) continue;
        inSizes = false;
        if (/^dispatch$/i.test(key) || !value) continue;
        if (Object.keys(attributes).length >= 30) break;
        attributes[key] = value.replace(/\s+/g, ' ');
    }
    return attributes;
}

/** "Dispatch: 2-2 Days" -> 2; "Dispatch: 1-3 Days" -> 3 (the slower bound). */
export function parseDispatchDays(fullDetails: string | null): number | null {
    const match = fullDetails?.match(/dispatch\s*:\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*day/i);
    if (!match) return null;
    return Number(match[2] ?? match[1]);
}

const STATE_NAMES: Record<string, string> = {
    AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
    CH: 'Chandigarh', CG: 'Chhattisgarh', CT: 'Chhattisgarh', DD: 'Daman and Diu', DL: 'Delhi', DN: 'Dadra and Nagar Haveli',
    GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh', HR: 'Haryana', JH: 'Jharkhand', JK: 'Jammu and Kashmir', KA: 'Karnataka',
    KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MH: 'Maharashtra', ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh',
    MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', OR: 'Odisha', PB: 'Punjab', PY: 'Puducherry', RJ: 'Rajasthan', SK: 'Sikkim',
    TG: 'Telangana', TS: 'Telangana', TN: 'Tamil Nadu', TR: 'Tripura', UK: 'Uttarakhand', UT: 'Uttarakhand', UP: 'Uttar Pradesh', WB: 'West Bengal',
};

function shippingCharge(raw: Record<string, unknown>): number | null {
    const shipping = asObject(raw.shipping);
    const charges = asNumber(shipping.charges);
    if (charges === null) return null;
    if (asBoolean(shipping.show_free_delivery) === true) return 0;
    return charges;
}

/** "₹176 with 1 Special Offer" -> 176. Falls back to price minus offer amounts. */
function specialOfferPrice(raw: Record<string, unknown>, price: number | null): number | null {
    const offers = asObject(raw.special_offers);
    const display = asString(offers.display_text);
    const fromText = display?.match(/₹\s*([\d,]+(?:\.\d+)?)/)?.[1];
    if (fromText) {
        const value = asNumber(fromText);
        if (value !== null && (price === null || value <= price)) return value;
    }
    const amounts = asArray(offers.offers).map((offer) => asNumber(asObject(offer).amount)).filter((n): n is number => n !== null);
    if (price !== null && amounts.length > 0) return Math.max(0, price - amounts.reduce((sum, n) => sum + n, 0));
    return null;
}

function isoOrNull(value: unknown): string | null {
    const text = asString(value);
    if (!text) return null;
    const time = Date.parse(text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
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
    const shipping = shippingCharge(raw);
    const offerPrice = specialOfferPrice(raw, price);
    const stateCode = asString(raw.state_code)?.toUpperCase() ?? null;
    const tags = uniqueStrings(asArray(raw.tags).map((tag) => asString(asObject(tag).name)));
    const imageUrls = uniqueStrings([
        normalizeUrl(raw.image),
        ...asArray(raw.product_images).map((image) => normalizeUrl(asObject(image).url)),
        ...asArray(raw.images).map((image) => normalizeUrl(image)),
    ]).slice(0, 10);

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
        catalogId,
        heroProductName: asString(raw.hero_product_name),
        shippingCharge: shipping,
        landedPrice: price !== null && shipping !== null ? price + shipping : null,
        specialOfferPrice: offerPrice,
        dispatchDays: parseDispatchDays(fullDetails),
        fastDispatch: tags.some((tag) => /next day dispatch/i.test(tag)),
        meeshoAssured: asBoolean(asObject(raw.assured_details).is_assured) ?? false,
        supplierState: stateCode ? STATE_NAMES[stateCode] ?? stateCode : null,
        designCount: asNumber(raw.num_designs),
        reviewCount: asNumber(reviews.review_count),
        listedAt: isoOrNull(raw.created_iso ?? raw.created),
        tags,
        attributes: parseAttributes(fullDetails),
        imageUrls,
        isSponsored: asBoolean(raw.isAdProduct) ?? false,
        scrapedAt: new Date().toISOString(),
        uniqueKey: catalogId || productId || productUrl || productName,
        isAdProduct: asBoolean(raw.isAdProduct) ?? false,
    };
}
