# Meesho Product Scraper - Social Commerce Data

Collect public Meesho product catalog data for ecommerce research, price tracking, assortment monitoring, and marketplace analytics. The actor searches Meesho by keyword and saves clean product rows with prices, ratings, reviews, categories, delivery flags, images, tags, sizes, and product URLs.

The scraper uses Meesho's public product search flow and stores results in the Apify Dataset. It is designed for product/catalog data only and does not collect seller contact details, phone numbers, emails, or private user data.

## What You Can Scrape

- Product names and catalog IDs
- Product prices in INR
- Ratings, rating counts, and review counts
- Category and category ID
- Product image and product URL
- Delivery flags such as free delivery and shipping charge
- Mall verified, assured, sponsored/ad flags
- Available sizes, tags, and product attributes where available

## Use Cases

1. Track Meesho prices for selected product searches.
2. Monitor trending products and categories in Indian social commerce.
3. Compare ratings and review volume across product niches.
4. Build ecommerce market research datasets.
5. Watch competitor assortment and catalog changes.

## Input

```json
{
    "searchQueries": ["kurti", "saree"],
    "minPrice": 100,
    "maxPrice": 1000,
    "minRating": 4,
    "includeAds": false,
    "maxResults": 100,
    "maxPagesPerQuery": 10,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"],
        "apifyProxyCountry": "IN"
    }
}
```

## Output Example

```json
{
    "source": "meesho",
    "searchQuery": "kurti",
    "position": 1,
    "catalogId": "112525643",
    "productId": "6dy8dt",
    "heroProductId": "386229233",
    "productName": "Women Rayon Banita Alluring Kurtis",
    "heroProductName": "Women Rayon Banita Alluring Kurtis",
    "categoryId": 1021,
    "category": "Kurtis & Kurtas",
    "description": "Women Rayon Banita Alluring Kurtis",
    "price": 197,
    "minProductPrice": 197,
    "currency": "INR",
    "rating": 4.1,
    "reviewCount": 5510,
    "ratingCount": 20362,
    "numDesigns": 4,
    "availableSizes": ["S", "M", "L", "XL"],
    "freeDelivery": false,
    "shippingCharges": 0,
    "expressDelivery": false,
    "assured": null,
    "mallVerified": false,
    "isAdProduct": false,
    "tags": ["Lowest Price"],
    "productAttributes": ["Fabric: Rayon"],
    "imageUrl": "https://images.meesho.com/images/catalogs/example_512.jpg",
    "collageImageUrl": "https://images.meesho.com/images/catalogs/example.jpg",
    "imagesCount": 4,
    "productUrl": "https://www.meesho.com/kurti/p/6dy8dt",
    "createdAt": "2026-06-01T00:00:00Z",
    "scrapedAt": "2026-06-13T12:00:00.000Z"
}
```

## How To Scrape Meesho Products

1. Enter one or more product search queries.
2. Optionally set price and rating filters.
3. Set the maximum number of products to save.
4. Run the actor.
5. Export the dataset as JSON, CSV, Excel, XML, or RSS.

## Pricing

This actor uses pay per event pricing.

| Event | When it is charged | Price |
| --- | --- | --- |
| `product-scraped` | Once for each clean product saved to the dataset | `$0.002` |

The actor charges only after a product row is saved. It respects the user's maximum run charge limit and stops cleanly when the limit is reached.

## Categories

- E-commerce
- Automation
- Other

## Notes

- Meesho blocks many datacenter IPs. Use Apify Residential proxies with country `IN` for best reliability.
- Results depend on Meesho availability and the search query used.
- Sponsored products are excluded by default. Enable `includeAds` to include them.

## Responsible Use

Use this actor only for lawful purposes and in compliance with Meesho's terms, robots.txt, applicable privacy laws, and local regulations. Do not use it to collect, store, or resell personal data without a lawful basis.

## License

Apache-2.0
