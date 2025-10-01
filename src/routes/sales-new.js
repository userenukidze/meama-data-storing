import express from 'express';
import fetch from 'node-fetch';
import { getShopConfig } from '../config/shopConfigs.js';
import { getTodayRange, getYesterdayRange } from '../utils/dateUtils.js';
import { buildOrderQueryString } from '../utils/queryBuilder.js';
import { calculateProductAnalysis } from '../utils/metricsCalculator.js';

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

// Helper function to calculate metrics for a specific source
function calculateSourceMetrics(orders, sourceName) {
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

  return {
    source: sourceName,
    summary: {
      totalSales: parseFloat(totalSales.toFixed(2)),
      totalOrders,
      averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
      currencyCode,
      totalRefunds: parseFloat(totalRefunds.toFixed(2)),
      refundedOrders,
      totalItemsSold
    },
    productAnalysis
  };
}

// Helper function to process orders for any store
async function processOrdersForStore(shop, dateRange, requestId, sourceFilter = null) {
  const shopConfig = getShopConfig(shop);
  const { startISO, endISO, startDate, endDate } = dateRange;

  console.log(`\n📊 [${requestId}] ${shop.toUpperCase()} - Starting data fetch`);
  console.log(`   🏪 Shop: ${shop}`);
  console.log(`   📅 Date Range: ${startISO.substring(0, 10)} to ${endISO.substring(0, 10)}`);

  const orderQueryString = buildOrderQueryString(startISO, endISO, shop);

  const GQL = `
    query GetOrders($cursor: String, $q: String!) {
      orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          name
          createdAt
          displayFinancialStatus
          sourceName
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

  while (hasNext) {
    requestCount++;
    const resp = await makeGraphQLRequest(shopConfig, GQL, { cursor, q: orderQueryString });
    const conn = resp.orders;

    const filteredOrders = conn.nodes.filter((order) => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= startDate && orderDate <= endDate;
    });

    orders.push(...filteredOrders);
    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;

    if (requestCount > 25) break;
  }

  // Apply source filter if specified
  let finalOrders = orders;
  if (sourceFilter) {
    if (sourceFilter === 'online') {
      finalOrders = orders.filter(order => 
        order.sourceName === 'web' || 
        order.sourceName === 'online_store' ||
        order.sourceName === 'checkout' ||
        !order.sourceName ||
        (order.sourceName !== 'pos' && order.sourceName !== 'point_of_sale' && order.sourceName !== 'POS')
      );
    } else if (sourceFilter === 'pos') {
      finalOrders = orders.filter(order => 
        order.sourceName === 'pos' || 
        order.sourceName === 'point_of_sale' ||
        order.sourceName === 'POS'
      );
    }
  }

  return finalOrders;
}

// ============================================================================
// GENERAL ECOM ENDPOINTS (All sales from ecommerce Shopify shop)
// ============================================================================

router.get("/general-ecom/today", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getTodayRange();

    const orders = await processOrdersForStore(shop, getTodayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "General Ecom");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] GENERAL ECOM TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating general ecom today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate general ecom today metrics",
      message: error.message,
    });
  }
});

router.get("/general-ecom/yesterday", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getYesterdayRange();

    const orders = await processOrdersForStore(shop, getYesterdayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "General Ecom");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] GENERAL ECOM YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating general ecom yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate general ecom yesterday metrics",
      message: error.message,
    });
  }
});

// ============================================================================
// ECOM ENDPOINTS (Online orders only)
// ============================================================================

router.get("/ecom/today", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getTodayRange();

    const orders = await processOrdersForStore(shop, getTodayRange(), requestId, 'online');
    const metrics = calculateSourceMetrics(orders, "Ecom");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] ECOM TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating ecom today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate ecom today metrics",
      message: error.message,
    });
  }
});

router.get("/ecom/yesterday", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getYesterdayRange();

    const orders = await processOrdersForStore(shop, getYesterdayRange(), requestId, 'online');
    const metrics = calculateSourceMetrics(orders, "Ecom");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] ECOM YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating ecom yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate ecom yesterday metrics",
      message: error.message,
    });
  }
});

// ============================================================================
// BRAND STORES ENDPOINTS (POS orders only)
// ============================================================================

router.get("/brandstores/today", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getTodayRange();

    const orders = await processOrdersForStore(shop, getTodayRange(), requestId, 'pos');
    const metrics = calculateSourceMetrics(orders, "Brand Stores");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] BRAND STORES TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating brand stores today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate brand stores today metrics",
      message: error.message,
    });
  }
});

router.get("/brandstores/yesterday", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getYesterdayRange();

    const orders = await processOrdersForStore(shop, getYesterdayRange(), requestId, 'pos');
    const metrics = calculateSourceMetrics(orders, "Brand Stores");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] BRAND STORES YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating brand stores yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate brand stores yesterday metrics",
      message: error.message,
    });
  }
});

// ============================================================================
// OTHER STORES ENDPOINTS (All sales from other shops)
// ============================================================================

// VENDING STORE
router.get("/vending/today", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getTodayRange();

    const orders = await processOrdersForStore("vending", getTodayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "Vending");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] VENDING TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating vending today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate vending today metrics",
      message: error.message,
    });
  }
});

router.get("/vending/yesterday", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getYesterdayRange();

    const orders = await processOrdersForStore("vending", getYesterdayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "Vending");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] VENDING YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating vending yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate vending yesterday metrics",
      message: error.message,
    });
  }
});

// COLLECT STORE
router.get("/collect/today", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getTodayRange();

    const orders = await processOrdersForStore("collect", getTodayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "Collect");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] COLLECT TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating collect today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate collect today metrics",
      message: error.message,
    });
  }
});

router.get("/collect/yesterday", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getYesterdayRange();

    const orders = await processOrdersForStore("collect", getYesterdayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "Collect");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] COLLECT YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating collect yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate collect yesterday metrics",
      message: error.message,
    });
  }
});

// FRANCHISE STORE
router.get("/franchise/today", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getTodayRange();

    const orders = await processOrdersForStore("franchise", getTodayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "Franchise");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] FRANCHISE TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating franchise today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate franchise today metrics",
      message: error.message,
    });
  }
});

router.get("/franchise/yesterday", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getYesterdayRange();

    const orders = await processOrdersForStore("franchise", getYesterdayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "Franchise");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] FRANCHISE YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating franchise yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate franchise yesterday metrics",
      message: error.message,
    });
  }
});

// B2B STORE
router.get("/b2b/today", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getTodayRange();

    const orders = await processOrdersForStore("b2b", getTodayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "B2B");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] B2B TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating b2b today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate b2b today metrics",
      message: error.message,
    });
  }
});

router.get("/b2b/yesterday", async (req, res) => {
  try {
    const requestId = req.requestId || "unknown";
    const { startISO, endISO } = getYesterdayRange();

    const orders = await processOrdersForStore("b2b", getYesterdayRange(), requestId);
    const metrics = calculateSourceMetrics(orders, "B2B");

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      ...metrics
    };

    console.log(`✅ [${requestId}] B2B YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating b2b yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate b2b yesterday metrics",
      message: error.message,
    });
  }
});

export default router;
