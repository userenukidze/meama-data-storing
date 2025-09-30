import express from 'express';
import fetch from 'node-fetch';
import { getShopConfig } from '../config/shopConfigs.js';
import { getTodayRange, getYesterdayRange } from '../utils/dateUtils.js';
import { buildOrderQueryString } from '../utils/queryBuilder.js';
import { calculateProductAnalysis } from '../utils/metricsCalculator.js';
import ShopifyClient from '../services/shopifyClient.js';

const router = express.Router();

// Helper function to make GraphQL requests
const makeGraphQLRequest = async (shopConfig, query, variables = {}) => {
  const response = await fetch(
    `https://${shopConfig.shop}/admin/api/${process.env.SHOPIFY_API_VERSION || "2023-10"}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopConfig.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`);
  }

  return data.data;
};

// SALES TODAY ENDPOINT
router.get("/today", async (req, res) => {
  const startTime = Date.now();
  try {
    // Get shop configuration from query parameter
    const { shop = "ecommerce" } = req.query;
    const shopConfig = getShopConfig(shop);
    const requestId = req.requestId || "unknown";

    // Set date range to today only
    const { startISO, endISO, startDate, endDate } = getTodayRange();

    console.log(`\n📊 [${requestId}] SALES TODAY - Starting data fetch`);
    console.log(`   🏪 Shop: ${shop}`);
    console.log(
      `   📅 Date Range: ${startISO.substring(0, 10)} to ${endISO.substring(0, 10)}`
    );
    console.log(`   ⏰ Current Time: ${new Date().toISOString()}`);
    console.log(`   🌐 Shopify Domain: ${shopConfig.shop}`);
    console.log(
      `   🔑 API Version: ${process.env.SHOPIFY_API_VERSION || "2023-10"}`
    );

    // Query for all orders from today
    const orderQueryString = buildOrderQueryString(startISO, endISO, shop);

    console.log(`   🔍 Query String: ${orderQueryString}`);
    console.log(`   📡 Preparing GraphQL query to Shopify...`);

    const GQL = `
      query GetTodaySalesMetrics($cursor: String, $q: String!) {
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
                    vendor
                  }
                }
              }
            }
          }
        }
      }
    `;

    let cursor = null;
    let hasNext = true;
    const orders = [];
    let requestCount = 0;
    let totalOrdersFound = 0;

    // Fetch all orders with pagination
    while (hasNext) {
      requestCount++;
      console.log(`Making request #${requestCount}...`);

      const resp = await makeGraphQLRequest(shopConfig, GQL, { cursor, q: orderQueryString });
      const conn = resp.orders;

      // Filter orders to only include those from today
      const todaysOrders = conn.nodes.filter((order) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });

      totalOrdersFound += todaysOrders.length;
      orders.push(...todaysOrders);

      console.log(
        `Batch ${requestCount}: Found ${todaysOrders.length} orders for today (Total: ${totalOrdersFound})`
      );

      hasNext = conn.pageInfo.hasNextPage;
      cursor = conn.pageInfo.endCursor;

      // Increased limit and added better logging
      if (requestCount > 25) {
        console.warn(
          "Reached maximum request limit - some orders may be missing"
        );
        break;
      }
    }

    console.log(`\n📊 [${requestId}] DATA PROCESSING - Starting calculations`);
    console.log(`   📦 Total Orders Found: ${totalOrdersFound}`);
    console.log(`   📅 Date: ${startISO.substring(0, 10)}`);
    console.log(`   🔄 Processing ${orders.length} orders...`);

    // Calculate metrics
    let currencyCode = null;
    let totalSales = 0;
    let totalRefunds = 0;
    let totalOrders = orders.length;
    let refundedOrders = 0;
    let totalItemsSold = 0;

    // Process orders
    orders.forEach((order) => {
      // Parse monetary values
      const currentTotal = parseFloat(
        order.currentTotalPriceSet?.shopMoney?.amount || "0"
      );
      const refunded = parseFloat(
        order.totalRefundedSet?.shopMoney?.amount || "0"
      );

      // Count items sold
      order.lineItems?.nodes?.forEach((item) => {
        const quantity = item.quantity || 0;
        totalItemsSold += quantity;
      });

      // Set currency code from first order
      if (!currencyCode) {
        currencyCode = order.totalPriceSet?.shopMoney?.currencyCode;
      }

      // Accumulate metrics
      totalSales += currentTotal;
      totalRefunds += refunded;
      
      if (refunded > 0) {
        refundedOrders++;
      }
    });

    // Calculate AOV (Average Order Value)
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Product Analysis
    const productAnalysis = calculateProductAnalysis(orders);

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      summary: {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalOrders,
        averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
        currencyCode,
      },
      productAnalysis,
    };

    console.log(`\n✅ [${requestId}] SALES TODAY - Processing Complete`);
    console.log(`   📊 Final Metrics:`);
    console.log(`      💰 Total Sales: ${totalSales.toFixed(2)} ${currencyCode || "GEL"}`);
    console.log(`      📦 Total Orders: ${totalOrders}`);
    console.log(`      💳 AOV: ${averageOrderValue.toFixed(2)} ${currencyCode || "GEL"}`);
    console.log(`      🏷️  Products Analyzed: ${productAnalysis.mostPopular.length + productAnalysis.leastPopular.length}`);
    console.log(`      ⏱️  Total Processing Time: ${Date.now() - startTime}ms`);

    res.json(response);
  } catch (error) {
    console.error(
      "Error calculating today's sales metrics:",
      error?.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to calculate today's sales metrics",
      message: error.message,
    });
  }
});

// SALES YESTERDAY ENDPOINT
router.get("/yesterday", async (req, res) => {
  try {
    // Get shop configuration from query parameter
    const { shop = "ecommerce" } = req.query;
    const shopConfig = getShopConfig(shop);

    // Set date range to yesterday
    const { startISO, endISO, startDate, endDate } = getYesterdayRange();

    console.log(
      `Calculating yesterday's sales metrics from ${startISO.substring(0, 10)}`
    );

    // Query for all orders from yesterday
    const orderQueryString = buildOrderQueryString(startISO, endISO, shop);

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
                    vendor
                  }
                }
              }
            }
          }
        }
      }
    `;

    let cursor = null;
    let hasNext = true;
    const orders = [];
    let requestCount = 0;
    let totalOrdersFound = 0;

    // Fetch all orders with pagination
    while (hasNext) {
      requestCount++;
      console.log(`Making request #${requestCount}...`);

      const resp = await makeGraphQLRequest(shopConfig, GQL, { cursor, q: orderQueryString });
      const conn = resp.orders;

      // Filter orders
      const yesterdayOrders = conn.nodes.filter((order) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });

      totalOrdersFound += yesterdayOrders.length;
      orders.push(...yesterdayOrders);

      console.log(
        `Batch ${requestCount}: Found ${yesterdayOrders.length} orders (Total: ${totalOrdersFound})`
      );

      hasNext = conn.pageInfo.hasNextPage;
      cursor = conn.pageInfo.endCursor;

      if (requestCount > 25) {
        console.warn("Reached maximum request limit");
        break;
      }
    }

    // Calculate metrics
    let currencyCode = null;
    let totalSales = 0;
    let totalRefunds = 0;
    let totalOrders = orders.length;
    let refundedOrders = 0;
    let totalItemsSold = 0;

    // Process orders
    orders.forEach((order) => {
      // Parse monetary values
      const currentTotal = parseFloat(
        order.currentTotalPriceSet?.shopMoney?.amount || "0"
      );
      const refunded = parseFloat(
        order.totalRefundedSet?.shopMoney?.amount || "0"
      );

      // Count items sold
      order.lineItems?.nodes?.forEach((item) => {
        const quantity = item.quantity || 0;
        totalItemsSold += quantity;
      });

      // Set currency code from first order
      if (!currencyCode) {
        currencyCode = order.totalPriceSet?.shopMoney?.currencyCode;
      }

      // Accumulate metrics
      totalSales += currentTotal;
      totalRefunds += refunded;
      
      if (refunded > 0) {
        refundedOrders++;
      }
    });

    // Calculate AOV (Average Order Value)
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Product Analysis
    const productAnalysis = calculateProductAnalysis(orders);

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      summary: {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalOrders,
        averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
        currencyCode,
      },
      productAnalysis,
    };

    console.log(
      `Processed ${totalOrders} orders - Total Sales: ${totalSales.toFixed(2)} ${currencyCode || "GEL"} - AOV: ${averageOrderValue.toFixed(2)} ${currencyCode || "GEL"}`
    );
    res.json(response);
  } catch (error) {
    console.error(
      "Error calculating yesterday's metrics:",
      error?.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to calculate yesterday's sales metrics",
      message: error.message,
    });
  }
});

export default router;
