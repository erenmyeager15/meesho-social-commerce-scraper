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
    scrapedAt: string;
}

export interface PreparedProductRecord extends ProductRecord {
    uniqueKey: string;
    isAdProduct: boolean;
}
