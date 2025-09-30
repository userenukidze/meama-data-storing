# Shopify Data Puller

A comprehensive Node.js project that pulls data from multiple Shopify stores using GraphQL API and calculates detailed business metrics. Perfect for data analysis, reporting, and integration with other systems.

## Features

- 🔌 **GraphQL Integration**: Uses Shopify's GraphQL Admin API
- 🏪 **Multiple Shop Support**: Handle multiple Shopify stores (ecommerce, vending, collect, franchise, b2b, brandstores)
- 📊 **Detailed Metrics**: Calculate total sales, gross sales, gross profit, COGS, AOV, units sold, and more
- 📅 **Date Range Support**: Pull yesterday's data or custom date ranges
- 🔧 **Configurable**: Easy environment-based configuration for multiple shops
- 💾 **Local Storage**: Saves data as JSON files for easy access
- 🚀 **Ready for Supabase**: Designed to be easily extended for database storage

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your Shopify store details:

```bash
cp env.example .env
```

Edit `.env` with your Shopify store information:

```env
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your-access-token-here
SHOPIFY_API_VERSION=2023-10
STORE_NAME=My Shopify Store
```

### 3. Get Your Shopify Access Tokens

For each shop you want to connect:

1. Go to your Shopify Admin → Apps → App and sales channel settings
2. Click "Develop apps" → "Create an app"
3. Configure Admin API access scopes (at minimum):
   - `read_products`
   - `read_orders`
   - `read_customers`
   - `read_inventory`
4. Install the app and copy the Admin API access token
5. Add the shop URL and access token to your `.env` file

### 4. Run the Data Puller

#### Get Yesterday's Metrics (Default)
```bash
# Get yesterday's metrics for ecommerce store
node index.js ecommerce

# Get yesterday's metrics for all shops
node index.js all

# Get yesterday's metrics for specific shop
node index.js vending
```

#### Get Specific Data Types
```bash
# Get products from ecommerce store (limit 100)
node index.js ecommerce products 100

# Get orders from vending store (limit 50)
node index.js vending orders 50

# Get customers from collect store (limit 25)
node index.js collect customers 25

# Get shop information
node index.js ecommerce shop
```

#### Get Detailed Metrics Only
```bash
# Get just the metrics you requested
node get-metrics.js ecommerce

# Get metrics for all shops
node get-metrics.js all
```

## Data Output

All data is saved to the `./data/` directory as JSON files:

### Metrics Files
- `yesterday-{shop-type}-{date}.json` - Yesterday's detailed metrics for specific shop
- `metrics-{shop-type}-{date}.json` - Clean metrics summary
- `all-shops-yesterday-{date}.json` - Combined data from all shops
- `all-metrics-{date}.json` - Combined metrics from all shops

### Raw Data Files
- `shop-info.json` - Store information and settings
- `products.json` - Product catalog with variants and images
- `orders.json` - Order history with line items and customer data
- `customers.json` - Customer information and order history

## Key Metrics Calculated

The system calculates these specific metrics you requested:

- **Total Sales** - Current total price of all orders
- **Gross Sales** - Subtotal before discounts
- **Gross Profit** - Gross sales minus COGS
- **Orders** - Total number of orders
- **AOV** - Average order value
- **COGS** - Cost of goods sold (calculated from inventory unit costs)
- **Units Sold** - Total quantity of all items sold
- **Capsules Sold** - Total quantity of capsule/pod products sold

Additional metrics include:
- Gross profit margin percentage
- Total refunded amount
- Total discounts applied
- Total tax collected
- Total shipping costs

## Available Data Types

### Products
- Basic product information (title, description, vendor, etc.)
- Product variants with pricing and inventory
- Product images and SEO data
- Product options and metafields
- Tags and categorization

### Orders
- Order details and status information
- Customer information
- Line items with variant details
- Shipping and billing addresses
- Fulfillment and refund information
- Payment and financial status

### Customers
- Customer profile information
- Order history and spending data
- Address information
- Marketing consent preferences
- Custom metafields

### Shop Information
- Store details and settings
- Currency and timezone information
- Billing address
- Plan information

## Custom Queries

The project includes a `queries.js` file with pre-built GraphQL queries. You can:

1. Use existing queries as templates
2. Modify queries to include additional fields
3. Create custom queries using the `buildCustomQuery` helper
4. Add filters and search parameters

Example custom query:
```javascript
import { buildCustomQuery } from './queries.js';

const customProductQuery = buildCustomQuery('products', [
  'id',
  'title',
  'handle',
  'price',
  'inventoryQuantity'
], {
  'product_type': 'Electronics',
  'status': 'active'
});
```

## Development

### Watch Mode
For development with auto-restart:
```bash
npm run dev
```

### Project Structure
```
├── index.js              # Main data pulling script
├── shopify-client.js     # GraphQL client for Shopify API
├── queries.js            # Pre-built GraphQL queries
├── package.json          # Dependencies and scripts
├── env.example           # Environment variables template
├── data/                 # Output directory for JSON files
└── README.md             # This file
```

## Next Steps: Supabase Integration

This project is designed to be easily extended for Supabase integration:

1. **Install Supabase client**: `npm install @supabase/supabase-js`
2. **Add Supabase credentials** to your `.env` file
3. **Create database tables** for products, orders, customers
4. **Modify the data saving logic** to push to Supabase instead of local files
5. **Add data transformation** to match your database schema

Example Supabase integration:
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Save products to Supabase
async function saveProductsToSupabase(products) {
  const { data, error } = await supabase
    .from('products')
    .upsert(products);
}
```

## Error Handling

The project includes comprehensive error handling:

- **Environment validation**: Checks for required environment variables
- **API error handling**: Catches and reports GraphQL and HTTP errors
- **File system errors**: Handles directory creation and file writing errors
- **Graceful degradation**: Continues processing other data types if one fails

## Rate Limiting

Shopify has API rate limits. The project respects these limits by:

- Using appropriate batch sizes
- Implementing error handling for rate limit responses
- Providing clear error messages for rate limit issues

## Security Notes

- Never commit your `.env` file to version control
- Use environment-specific access tokens
- Regularly rotate your API access tokens
- Follow Shopify's security best practices

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Check your `.env` file exists and has correct variable names
   - Ensure no extra spaces or quotes around values

2. **"GraphQL errors"**
   - Verify your access token has the required permissions
   - Check if your store URL is correct (should include .myshopify.com)

3. **"HTTP error! status: 401"**
   - Your access token is invalid or expired
   - Regenerate the token in your Shopify admin

4. **"HTTP error! status: 429"**
   - You've hit the API rate limit
   - Wait a few minutes and try again, or reduce the batch size

## License

MIT License - feel free to use this project for your own needs!
