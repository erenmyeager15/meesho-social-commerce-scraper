export interface ProxyInput {
    useApifyProxy?: boolean;
    apifyProxyGroups?: string[];
    apifyProxyCountry?: string;
    proxyUrls?: string[];
}

export interface ActorInput {
    searchQueries?: string[];
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    includeAds?: boolean;
    maxResults?: number;
    maxPagesPerQuery?: number;
    proxyConfiguration?: ProxyInput;
    monitorName?: string;
    onlyChanges?: boolean;
    priceChangeThresholdPercent?: number;
}

export interface SearchResponse {
    catalogs?: unknown[];
    cursor?: string | null;
    search_session_id?: string | null;
    search_id?: string | null;
    corrected_search_term?: string | null;
}

export interface ProductRecord {
    source: 'meesho';
    searchQuery: string;
    position: number;
    productId: string | null;
    title: string;
    brand: string;
    price: number | null;
    mrp: number | null;
    discountPercent: number | null;
    currency: string;
    packSize: string;
    category: string;
    rating: number | null;
    ratingCount: number | null;
    inStock: boolean | null;
    productUrl: string | null;
    imageUrl: string | null;
    catalogId: string;
    heroProductName: string | null;
    /** Delivery charge shown for this listing; 0 when free. */
    shippingCharge: number | null;
    /** price + shippingCharge: what a buyer pays before offers. */
    landedPrice: number | null;
    /** Price after Meesho's listed special offer (e.g. prepaid discount). */
    specialOfferPrice: number | null;
    dispatchDays: number | null;
    fastDispatch: boolean;
    meeshoAssured: boolean;
    supplierState: string | null;
    designCount: number | null;
    reviewCount: number | null;
    listedAt: string | null;
    tags: string[];
    attributes: Record<string, string>;
    imageUrls: string[];
    isSponsored: boolean;
    scrapedAt: string;
}

export type ChangeType = 'new' | 'price_drop' | 'price_increase' | 'unchanged';

export interface MonitorFields {
    changeType: ChangeType;
    previousPrice: number | null;
    priceChange: number | null;
    priceChangePercent: number | null;
    previousPosition: number | null;
    /** Positive = moved up the search results since the last run. */
    positionChange: number | null;
    /** New ratings since the last run: a demand signal. */
    newRatings: number | null;
    firstSeenAt: string;
    previousObservedAt: string | null;
}

export interface PreparedProductRecord extends ProductRecord {
    uniqueKey: string;
    isAdProduct: boolean;
}
