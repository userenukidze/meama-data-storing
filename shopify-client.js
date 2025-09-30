import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Multiple shop configurations
const SHOP_CONFIGS = {
  ecommerce: {
    shop: process.env.SHOPIFY_SHOP || process.env.SHOPIFY_MEAMA_B2B_SHOP,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_MEAMA_B2B_ACCESS_TOKEN,
  },
  vending: {
    shop: process.env.SHOPIFY_VENDING_SHOP,
    accessToken: process.env.SHOPIFY_MEAMA_VENDING_ACCESS_TOKEN,
  },
  collect: {
    shop: process.env.SHOPIFY_MEAMA_COLLECT_SHOP,
    accessToken: process.env.SHOPIFY_MEAMA_COLLECT_ACCESS_TOKEN,
  },
  franchise: {
    shop: process.env.SHOPIFY_MEAMA_FRANCHISE_SHOP,
    accessToken: process.env.SHOPIFY_MEAMA_FRANCHISE_ACCESS_TOKEN,
  },
  b2b: {
    shop: process.env.SHOPIFY_MEAMA_B2B_SHOP,
    accessToken: process.env.SHOPIFY_MEAMA_B2B_ACCESS_TOKEN,
  },
  brandstores: {
    shop: process.env.SHOPIFY_SHOP || process.env.SHOPIFY_MEAMA_B2B_SHOP,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_MEAMA_B2B_ACCESS_TOKEN,
    channel: "Point of Sale",
  },
};

class ShopifyClient {
  constructor(shopType = "ecommerce") {
    this.shopType = shopType;
    this.shopConfig = this.getShopConfig(shopType);
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2023-10';
    
    if (!this.shopConfig.shop || !this.shopConfig.accessToken) {
      throw new Error(`Missing required environment variables for shop type: ${shopType}`);
    }
    
    this.baseUrl = `https://${this.shopConfig.shop}/admin/api/${this.apiVersion}/graphql.json`;
  }

  // Helper function to get shop config
  getShopConfig(shopType = "ecommerce") {
    return SHOP_CONFIGS[shopType] || SHOP_CONFIGS.ecommerce;
  }

  // Helper function to build query parts with source code filtering
  buildQueryParts(startISO, endISO, shopType = "ecommerce") {
    const qParts = [
      `created_at:>=${startISO}`,
      `created_at:<=${endISO}`,
      "-cancelled_status:cancelled",
      "-test:true",
    ];

    // Add channel filtering for Brand Stores
    const shopConfig = this.getShopConfig(shopType);
    if (shopConfig.channel) {
      qParts.push(`channel:"${shopConfig.channel}"`);
      console.log(
        `🔍 [${shopType}] Added channel filter: channel:"${shopConfig.channel}"`
      );
    }

    return qParts;
  }

  async query(query, variables = {}) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.shopConfig.accessToken,
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`);
      }

      return data.data;
    } catch (error) {
      console.error('Error executing GraphQL query:', error);
      throw error;
    }
  }

  // Helper method to get shop information
  async getShopInfo() {
    const query = `
      query {
        shop {
          id
          name
          email
          domain
          currencyCode
          timezone
          plan {
            displayName
          }
        }
      }
    `;
    
    return await this.query(query);
  }

  // Helper method to get products
  async getProducts(first = 10, after = null) {
    const query = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              description
              vendor
              productType
              createdAt
              updatedAt
              status
              tags
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    compareAtPrice
                    sku
                    inventoryQuantity
                    availableForSale
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;
    
    return await this.query(query, { first, after });
  }

  // Helper method to get orders
  async getOrders(first = 10, after = null) {
    const query = `
      query getOrders($first: Int!, $after: String) {
        orders(first: $first, after: $after) {
          edges {
            node {
              id
              name
              email
              createdAt
              updatedAt
              processedAt
              totalPrice
              subtotalPrice
              totalTax
              currencyCode
              financialStatus
              fulfillmentStatus
              customer {
                id
                email
                firstName
                lastName
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    price
                    variant {
                      id
                      title
                      sku
                    }
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;
    
    return await this.query(query, { first, after });
  }

  // Helper method to get customers
  async getCustomers(first = 10, after = null) {
    const query = `
      query getCustomers($first: Int!, $after: String) {
        customers(first: $first, after: $after) {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              createdAt
              updatedAt
              totalSpent
              ordersCount
              tags
              defaultAddress {
                id
                address1
                address2
                city
                province
                country
                zip
                phone
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;
    
    return await this.query(query, { first, after });
  }

  // Fetch yesterday's data for a specific shop with detailed metrics
  async fetchYesterdayData(requestId = "unknown") {
    // Set date range to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endDate = new Date(yesterday);
    endDate.setHours(23, 59, 59, 999);

    const startISO = yesterday.toISOString();
    const endISO = endDate.toISOString();

    const qParts = this.buildQueryParts(startISO, endISO, this.shopType);
    const orderQueryString = qParts.join(" ");

    const GQL = `
      query GetYesterdaySalesMetrics($cursor: String, $q: String!) {
        orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            totalRefundedSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 50) {
              nodes {
                quantity
                title
                variantTitle
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                discountedUnitPriceSet { shopMoney { amount currencyCode } }
                variant {
                  id
                  title
                  sku
                  inventoryItem {
                    unitCost { amount }
                  }
                  product {
                    id
                    title
                    description
                    handle
                    productType
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Fetch all orders with pagination
    let cursor = null;
    let allOrders = [];
    let iterations = 0;
    const maxIterations = 100;

    do {
      iterations++;
      if (iterations > maxIterations) {
        console.warn(`[${requestId}] Maximum iterations reached for ${this.shopType}`);
        break;
      }

      const response = await this.query(GQL, { cursor, q: orderQueryString });
      const orders = response.orders.nodes;
      allOrders = allOrders.concat(orders);

      cursor = response.orders.pageInfo.hasNextPage
        ? response.orders.pageInfo.endCursor
        : null;
    } while (cursor);

    // Calculate detailed metrics
    const metrics = this.calculateDetailedMetrics(allOrders, startISO, endISO);
    
    return {
      shopType: this.shopType,
      shop: this.shopConfig.shop,
      ...metrics
    };
  }

  // Calculate detailed metrics from orders
  calculateDetailedMetrics(orders, startISO, endISO) {
    let totalSales = 0;
    let grossSales = 0;
    let totalRefunded = 0;
    let totalDiscounts = 0;
    let totalTax = 0;
    let totalShipping = 0;
    let totalCOGS = 0;
    let totalUnitsSold = 0;
    let totalCapsulesSold = 0;
    let totalOrders = orders.length;

    orders.forEach(order => {
      // Total Sales (current total price)
      const currentTotal = parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || "0");
      totalSales += currentTotal;

      // Gross Sales (subtotal before discounts)
      const subtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0");
      grossSales += subtotal;

      // Refunds
      const refunded = parseFloat(order.totalRefundedSet?.shopMoney?.amount || "0");
      totalRefunded += refunded;

      // Discounts
      const discounts = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
      totalDiscounts += discounts;

      // Tax
      const tax = parseFloat(order.totalTaxSet?.shopMoney?.amount || "0");
      totalTax += tax;

      // Shipping
      const shipping = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
      totalShipping += shipping;

      // Process line items for COGS and units
      if (order.lineItems?.nodes) {
        order.lineItems.nodes.forEach(item => {
          const quantity = item.quantity || 0;
          const unitCost = parseFloat(item.variant?.inventoryItem?.unitCost?.amount || "0");
          
          // COGS calculation
          totalCOGS += unitCost * quantity;
          
          // Units sold
          totalUnitsSold += quantity;
          
          // Capsules sold (assuming capsules are identified by product type or title)
          const productType = item.variant?.product?.productType?.toLowerCase() || "";
          const title = (item.title || "").toLowerCase();
          
          if (productType.includes("capsule") || 
              title.includes("capsule") || 
              productType.includes("pod") ||
              title.includes("pod")) {
            totalCapsulesSold += quantity;
          }
        });
      }
    });

    // Calculate derived metrics
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const grossProfit = grossSales - totalCOGS;
    const grossProfitMargin = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;

    return {
      summary: {
        totalSales: Math.round(totalSales * 100) / 100,
        grossSales: Math.round(grossSales * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossProfitMargin: Math.round(grossProfitMargin * 100) / 100,
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        totalDiscounts: Math.round(totalDiscounts * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        totalShipping: Math.round(totalShipping * 100) / 100,
        totalCOGS: Math.round(totalCOGS * 100) / 100,
        totalOrders,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        totalUnitsSold,
        totalCapsulesSold,
        dateRange: {
          from: startISO.substring(0, 10),
          to: endISO.substring(0, 10),
        },
      },
      orders: orders // Include raw orders for detailed analysis if needed
    };
  }

  // Get available shop types
  static getAvailableShops() {
    return Object.keys(SHOP_CONFIGS);
  }

  // Debug: Log shop configurations
  static logShopConfigurations() {
    console.log("\n🔧 SHOP CONFIGURATIONS:");
    Object.entries(SHOP_CONFIGS).forEach(([shopName, config]) => {
      console.log(`  ${shopName}:`);
      console.log(`    shop: ${config.shop || 'UNDEFINED'}`);
      console.log(`    accessToken: ${config.accessToken ? 'SET' : 'NOT SET'}`);
      if (config.channel) {
        console.log(`    channel: ${config.channel}`);
      }
    });
  }
}

export default ShopifyClient;
