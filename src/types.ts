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
    catalogId: string;
    productId: string | null;
    heroProductId: string | null;
    productName: string;
    heroProductName: string | null;
    categoryId: number | null;
    category: string | null;
    description: string | null;
    price: number | null;
    minProductPrice: number | null;
    currency: 'INR';
    rating: number | null;
    reviewCount: number | null;
    ratingCount: number | null;
    numDesigns: number | null;
    availableSizes: string[];
    freeDelivery: boolean | null;
    shippingCharges: number | null;
    expressDelivery: boolean | null;
    assured: boolean | null;
    mallVerified: boolean | null;
    isAdProduct: boolean;
    tags: string[];
    productAttributes: string[];
    imageUrl: string | null;
    collageImageUrl: string | null;
    imagesCount: number;
    productUrl: string | null;
    createdAt: string | null;
    scrapedAt: string;
}
