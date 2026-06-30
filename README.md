# Meesho Product Scraper: Prices & Catalog

Scrape public Meesho product search results for ecommerce research, price tracking, catalog monitoring, and marketplace reporting. The Actor searches Meesho by keyword and saves clean product rows with titles, prices, MRP, discounts, ratings, categories, sizes, image URLs, product URLs, and scrape timestamps.

The scraper uses Meesho's public product search flow. It is designed for product/catalog data only and does not collect seller contact details, phone numbers, emails, private account data, or customer data.

## Quick Start

Use this one-result sample to verify output at low cost:

```json
{
  "searchQueries": ["kurti"],
  "includeAds": false,
  "maxResults": 1,
  "maxPagesPerQuery": 1,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "IN"
  }
}
```

For larger runs, increase `maxResults` gradually and keep `maxPagesPerQuery` at 1 until you confirm the output quality for your query.

## What It Extracts

- Source, search query, result position, and product ID
- Product title and brand when exposed
- Price, MRP, discount percentage, and currency
- Category and available sizes in `packSize`
- Rating, rating count, and stock flag when exposed
- Product URL, image URL, and ISO scrape timestamp

## Use Cases

- Track Meesho product prices, MRP, and discounts by search term
- Monitor fashion, home, and marketplace catalog changes
- Compare public Meesho product listings with other ecommerce sources
- Build competitor price snapshots and product research reports
- Export product rows to CSV, Excel, JSON, or dashboards

## Pricing And Cost Control

This Actor uses Apify Pay Per Event pricing. As of the latest live check, active pricing is:

| Event | Price |
| --- | ---: |
| `product-scraped` | `$0.002` per saved product |
| `apify-actor-start` | `$0.00005` per GB start event |

Products are charged only when a clean row is saved to the dataset. The Actor stops requesting more data when the run's maximum charge is reached. Platform usage such as compute and proxy traffic may also apply depending on your Apify plan and run configuration.

Cost-control tips:

- Start with one query, for example `kurti`.
- Keep `maxResults: 1` for the first run, then scale gradually.
- Keep `maxPagesPerQuery: 1` for test runs.
- Keep `includeAds: false` unless sponsored products are needed.
- Use the run's maximum cost setting for strict spending control.
- Residential India proxy is recommended for reliable cloud runs, but proxy traffic can add platform usage cost.

## Input Fields

| Field | Type | Description |
| --- | --- | --- |
| `searchQueries` | string[] | One to five Meesho searches such as `kurti`, `saree`, or `bedsheet` |
| `minPrice` / `maxPrice` | number | Optional INR price range |
| `minRating` | number | Optional minimum rating from 0 to 5 |
| `includeAds` | boolean | Include sponsored/ad products when true |
| `maxResults` | integer | Maximum unique products to save, up to 500 |
| `maxPagesPerQuery` | integer | Maximum Meesho result pages to request per query |
| `proxyConfiguration` | object | Apify Proxy settings. Residential India is recommended |

## Sample Output

```json
{
  "source": "meesho",
  "searchQuery": "kurti",
  "position": 1,
  "productId": "6dy8dt",
  "title": "Women Rayon Banita Alluring Kurtis",
  "brand": "N/A",
  "price": 197,
  "mrp": 399,
  "discountPercent": 51,
  "currency": "INR",
  "packSize": "S, M, L, XL",
  "category": "Kurtis & Kurtas",
  "rating": 4.1,
  "ratingCount": 20362,
  "inStock": null,
  "productUrl": "https://www.meesho.com/women-rayon-banita-alluring-kurtis/p/6dy8dt",
  "imageUrl": "https://images.meesho.com/images/catalogs/example_512.jpg",
  "scrapedAt": "2026-06-13T12:00:00.000Z"
}
```

## Reliability Notes

- Meesho search results, ranking, prices, ratings, and availability can change frequently.
- Some products do not expose brand, stock, MRP, or full size data. Missing values are saved as `null` or `N/A`.
- The Actor fails blocked or empty zero-result runs instead of silently reporting success with no saved products.
- If individual pages fail after retries, they are skipped and reported; the run fails only if no products are saved.

## Responsible Use

This Actor is not affiliated with, endorsed by, or sponsored by Meesho. Use it only for lawful purposes and in compliance with applicable website terms, privacy laws, and local regulations. Do not use it to collect private account data, seller contact details, customer data, or non-public information.

## License

Apache License 2.0. See [LICENSE](LICENSE).
