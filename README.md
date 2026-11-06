# Meesho Scraper - Prices & Price Monitor

Scrape Meesho search results for price research, catalog monitoring and seller analysis. Each product row includes the listed price plus what a buyer actually pays: a **shipping-inclusive landed price** and the **special-offer price**. It also includes dispatch time, Meesho Assured status, the supplier's state, structured product attributes and all product images.

Add a **monitor name** and schedule the Actor to compare every product with the previous run. Rows then show price drops and increases, search-rank moves and how many new ratings each product gained, which is a demand signal. With **Only Save Changes**, unchanged products are skipped and not charged.

The Actor reads Meesho's public product search. It does not collect seller contact details, phone numbers, emails, private account data or customer data.

## Quick start

```json
{
  "searchQueries": ["kurti"],
  "maxResults": 20
}
```

One Meesho search page holds 20 products, so 20 is the default. Larger runs read as many pages as `maxResults` needs.

### Price monitor

Run this on a daily schedule:

```json
{
  "searchQueries": ["kurti", "saree"],
  "maxResults": 100,
  "monitorName": "ethnic-wear-daily",
  "onlyChanges": true,
  "priceChangeThresholdPercent": 2
}
```

The first run saves every product as `changeType: "new"` and stores a baseline. Later runs with the same `monitorName` save only new listings and price moves of at least 2%. The **Price changes** dataset view shows them side by side.

## What each row contains

| Field | Description |
| --- | --- |
| `title`, `heroProductName`, `productId`, `catalogId` | Catalog name, product name and identifiers |
| `price` | Lowest listed price in INR |
| `shippingCharge`, `landedPrice` | Delivery charge shown on the listing (0 when free) and price + shipping |
| `specialOfferPrice` | Price after Meesho's listed special offer, e.g. the prepaid discount |
| `mrp`, `discountPercent` | Only when Meesho exposes them; most search results no longer do |
| `rating`, `ratingCount`, `reviewCount` | Average rating and counts |
| `category`, `packSize`, `attributes` | Category, sizes (e.g. `S, M, XL` or `Free Size`) and structured attributes such as `{"Fabric": "Cotton", "Sleeve Length": "Three-Quarter Sleeves"}` |
| `dispatchDays`, `fastDispatch` | Supplier dispatch time in days and the "Next Day Dispatch" tag |
| `meeshoAssured`, `supplierState` | Meesho Assured flag and the supplier's GST state, e.g. `Gujarat` |
| `designCount`, `listedAt` | Number of designs in the catalog and when it was listed |
| `imageUrl`, `imageUrls` | Cover image and up to 10 product images |
| `searchQuery`, `position`, `isSponsored` | The search, rank in the results and the ad flag |
| `productUrl`, `scrapedAt` | Product page and ISO timestamp |

With a monitor name, rows also contain `monitorName`, `changeType` (`new`, `price_drop`, `price_increase`, `unchanged`), `previousPrice`, `priceChange`, `priceChangePercent`, `previousPosition`, `positionChange` (positive = moved up), `newRatings`, `firstSeenAt` and `previousObservedAt`.

The run's `OUTPUT` record summarizes saved products, pages read, rows removed by filters, per-query stopping reasons and the monitor's change counts.

## Use cases

- Compare true buyer cost (landed and offer price) across competing listings
- Track daily price drops and rank changes for your own or competitor catalogs
- Spot fast-growing products from `newRatings` between runs
- Find suppliers by state and dispatch speed
- Build catalog datasets with structured attributes and images

## Pricing

Pay Per Event:

| Event | Price |
| --- | ---: |
| `product-scraped` | `$0.002` per saved product ($2 per 1,000) |
| `apify-actor-start` | `$0.00005` per GB at run start |

Only saved products are charged. With `onlyChanges`, unchanged products are not saved or charged. The Actor stops when the run's maximum charge is reached. Platform usage (compute and Residential proxy traffic) also applies depending on your plan; a 20-product run used about $0.0006.

## Input

| Field | Description |
| --- | --- |
| `searchQueries` | One to five Meesho searches |
| `maxResults` | Maximum products across all queries, up to 500 (default 20) |
| `minPrice` / `maxPrice` | INR price range; filtered runs read extra pages automatically |
| `minRating` | Minimum rating, 0 to 5 |
| `includeAds` | Include sponsored products (default false) |
| `monitorName` | Enables price monitoring across runs |
| `onlyChanges` | With a monitor: save only new products and price changes |
| `priceChangeThresholdPercent` | Smaller price moves count as unchanged (default 1) |
| `maxPagesPerQuery` | Optional page cap; empty means automatic |
| `proxyConfiguration` | Residential India is used; see below |

## Proxy

Meesho returns HTTP 403 to Apify datacenter IPs and to direct cloud traffic, so the Actor uses Apify Residential proxy with country India. Choosing plain "Apify Proxy" without a group also uses Residential India. An explicit proxy group or your own proxy URLs are used as given.

## Reliability notes

- Meesho results, ranking, prices and ratings change often.
- A run fails only when no search page could be read. If pages load but filters remove every product, the run succeeds and says so.
- The monitor baseline is updated only when every requested page loaded, so a blocked page cannot make products look new next time.
- Use one monitor name per search and run its schedule without overlapping runs. Up to 5,000 products are kept per monitor.

## Responsible use

This Actor is not affiliated with, endorsed by, or sponsored by Meesho. Use it only for lawful purposes and in compliance with applicable website terms, privacy laws, and local regulations.

## License

Apache License 2.0. See [LICENSE](LICENSE).
