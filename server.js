import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Shop configurations
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

// Helper function to get shop config
const getShopConfig = (shopType = "ecommerce") => {
  return SHOP_CONFIGS[shopType] || SHOP_CONFIGS.ecommerce;
};

// Helper function to get date ranges
const getTodayRange = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);
  return {
    startISO: today.toISOString(),
    endISO: endDate.toISOString(),
    startDate: today,
    endDate: endDate
  };
};

const getYesterdayRange = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const endDate = new Date(yesterday);
  endDate.setHours(23, 59, 59, 999);
  return {
    startISO: yesterday.toISOString(),
    endISO: endDate.toISOString(),
    startDate: yesterday,
    endDate: endDate
  };
};

// Helper function to build query string
const buildOrderQueryString = (startISO, endISO, shop = "ecommerce") => {
  const qParts = [
    `created_at:>=${startISO}`,
    `created_at:<=${endISO}`,
    "-cancelled_status:cancelled",
    "-test:true",
  ];
  return qParts.join(" ");
};

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

// Helper function to calculate product analysis
const calculateProductAnalysis = (orders) => {
  const productMap = new Map();

  orders.forEach((order) => {
    order.lineItems?.nodes?.forEach((item) => {
      const productId = item.variant?.product?.id;
      const productTitle = item.variant?.product?.title || item.title;
      const variantTitle = item.variantTitle || item.variant?.title || "";
      const fullTitle = variantTitle
        ? `${productTitle} - ${variantTitle}`
        : productTitle;
      const quantity = item.quantity || 0;
      const unitPrice = parseFloat(
        item.originalUnitPriceSet?.shopMoney?.amount ||
          item.discountedUnitPriceSet?.shopMoney?.amount ||
          "0"
      );
      const totalPrice = quantity * unitPrice;

      if (productId) {
        if (productMap.has(productId)) {
          const existing = productMap.get(productId);
          existing.quantity += quantity;
          existing.totalSales += totalPrice;
          existing.orders += 1;
        } else {
          productMap.set(productId, {
            productId,
            title: productTitle,
            fullTitle,
            description: item.variant?.product?.description || "",
            sku: item.variant?.sku || "",
            productType: item.variant?.product?.productType || "",
            vendor: item.variant?.product?.vendor || "",
            quantity,
            totalSales: totalPrice,
            unitPrice,
            orders: 1,
          });
        }
      }
    });
  });

  const products = Array.from(productMap.values()).sort(
    (a, b) => b.totalSales - a.totalSales
  );

  const mostPopular = products.slice(0, 10);
  const leastPopular = products.slice(-10).reverse();

  return {
    mostPopular: mostPopular.map((p) => ({
      title: p.fullTitle,
      description: p.description,
      quantity: p.quantity,
      totalSales: parseFloat(p.totalSales.toFixed(2)),
      unitPrice: parseFloat(p.unitPrice.toFixed(2)),
      orders: p.orders,
      sku: p.sku,
      productType: p.productType,
      vendor: p.vendor,
    })),
    leastPopular: leastPopular.map((p) => ({
      title: p.fullTitle,
      description: p.description,
      quantity: p.quantity,
      totalSales: parseFloat(p.totalSales.toFixed(2)),
      unitPrice: parseFloat(p.unitPrice.toFixed(2)),
      orders: p.orders,
      sku: p.sku,
      productType: p.productType,
      vendor: p.vendor,
    })),
  };
};

// Helper function to process orders
const processOrdersForStore = async (shop, dateRange, requestId, sourceFilter = null) => {
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
};

// Helper function to calculate metrics
const calculateSourceMetrics = (orders, sourceName) => {
  let currencyCode = null;
  let totalSales = 0;
  let totalRefunds = 0;
  let totalOrders = orders.length;
  let refundedOrders = 0;
  let totalItemsSold = 0;

  orders.forEach((order) => {
    const currentTotal = parseFloat(
      order.currentTotalPriceSet?.shopMoney?.amount || "0"
    );
    const refunded = parseFloat(
      order.totalRefundedSet?.shopMoney?.amount || "0"
    );

    order.lineItems?.nodes?.forEach((item) => {
      const quantity = item.quantity || 0;
      totalItemsSold += quantity;
    });

    if (!currencyCode) {
      currencyCode = order.totalPriceSet?.shopMoney?.currencyCode;
    }

    totalSales += currentTotal;
    totalRefunds += refunded;
    
    if (refunded > 0) {
      refundedOrders++;
    }
  });

  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
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
};

// Helper function to calculate simplified metrics (without product analysis)
const calculateSimplifiedMetrics = (orders, sourceName) => {
  let currencyCode = null;
  let totalSales = 0;
  let totalRefunds = 0;
  let totalOrders = orders.length;
  let refundedOrders = 0;
  let totalItemsSold = 0;
  let totalCapsules = 0;

  orders.forEach((order) => {
    const currentTotal = parseFloat(
      order.currentTotalPriceSet?.shopMoney?.amount || "0"
    );
    const refunded = parseFloat(
      order.totalRefundedSet?.shopMoney?.amount || "0"
    );

    order.lineItems?.nodes?.forEach((item) => {
      const quantity = item.quantity || 0;
      totalItemsSold += quantity;
      
      // Count capsules - assuming capsules are identified by product type or title containing "capsule"
      const productTitle = item.variant?.product?.title || item.title || "";
      const productType = item.variant?.product?.productType || "";
      
      if (productType.toLowerCase().includes('capsule') || 
          productTitle.toLowerCase().includes('capsule')) {
        totalCapsules += quantity;
      }
    });

    if (!currencyCode) {
      currencyCode = order.totalPriceSet?.shopMoney?.currencyCode;
    }

    totalSales += currentTotal;
    totalRefunds += refunded;
    
    if (refunded > 0) {
      refundedOrders++;
    }
  });

  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  return {
    source: sourceName,
    summary: {
      totalSales: parseFloat(totalSales.toFixed(2)),
      totalOrders,
      averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
      currencyCode,
      totalRefunds: parseFloat(totalRefunds.toFixed(2)),
      refundedOrders,
      totalItemsSold,
      totalCapsules
    }
  };
};

// Helper function to get date range for a specific date
const getDateRange = (date) => {
  // Parse the date string and create UTC dates to avoid timezone issues
  const targetDate = new Date(date + 'T00:00:00.000Z'); // Force UTC
  const endDate = new Date(date + 'T23:59:59.999Z'); // Force UTC
  
  return {
    startISO: targetDate.toISOString(),
    endISO: endDate.toISOString(),
    startDate: targetDate,
    endDate: endDate
  };
};

// Helper function to generate date range for past months
const getPastMonthsDateRange = (months = 3) => {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() - 1); // Yesterday in UTC
  endDate.setUTCHours(23, 59, 59, 999);
  
  const startDate = new Date(now);
  startDate.setUTCMonth(startDate.getUTCMonth() - months);
  startDate.setUTCDate(1);
  startDate.setUTCHours(0, 0, 0, 0);
  
  return {
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
    startDate,
    endDate
  };
};

// Helper function to get all dates in a range
const getAllDatesInRange = (startDate, endDate) => {
  const dates = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    // Create a date string in YYYY-MM-DD format for consistent UTC handling
    const dateStr = currentDate.toISOString().split('T')[0];
    dates.push(new Date(dateStr + 'T00:00:00.000Z'));
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  
  return dates;
};

// ============================================================================
// ENDPOINTS
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      valid: true,
      availableShops: Object.keys(SHOP_CONFIGS)
    }
  });
});

// Get shops
app.get('/shops', (req, res) => {
  try {
    const shopConfigs = {};
    
    Object.keys(SHOP_CONFIGS).forEach(shopType => {
      const config = SHOP_CONFIGS[shopType];
      shopConfigs[shopType] = {
        shop: config.shop || 'UNDEFINED',
        hasToken: !!config.accessToken,
        status: config.shop && config.accessToken ? 'configured' : 'not_configured',
        channel: config.channel || null
      };
    });
    
    res.json({
      availableShops: Object.keys(SHOP_CONFIGS),
      configurations: shopConfigs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint
app.get('/test', async (req, res) => {
  try {
    const shopConfig = getShopConfig('ecommerce');
    const query = `
      query {
        shop {
          id
          name
          email
          domain
          currencyCode
        }
      }
    `;
    
    const shopInfo = await makeGraphQLRequest(shopConfig, query);
    
    res.json({
      success: true,
      message: 'Environment is properly configured',
      shopInfo,
      environment: {
        valid: true,
        shop: shopConfig.shop,
        hasToken: !!shopConfig.accessToken
      }
    });
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      environment: {
        valid: false,
        message: 'Environment check failed'
      }
    });
  }
});

// Sales endpoints
app.get("/sales/today", async (req, res) => {
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

    console.log(`✅ [${requestId}] SALES TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating sales today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate sales today metrics",
      message: error.message,
    });
  }
});

app.get("/sales/yesterday", async (req, res) => {
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

    console.log(`✅ [${requestId}] SALES YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating sales yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate sales yesterday metrics",
      message: error.message,
    });
  }
});

app.get("/sales/ecom/today", async (req, res) => {
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

    console.log(`✅ [${requestId}] SALES ECOM TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating sales ecom today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate sales ecom today metrics",
      message: error.message,
    });
  }
});

app.get("/sales/ecom/yesterday", async (req, res) => {
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

    console.log(`✅ [${requestId}] SALES ECOM YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating sales ecom yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate sales ecom yesterday metrics",
      message: error.message,
    });
  }
});

app.get("/sales/brandstore/today", async (req, res) => {
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

    console.log(`✅ [${requestId}] SALES BRAND STORE TODAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating sales brand store today metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate sales brand store today metrics",
      message: error.message,
    });
  }
});

app.get("/sales/brandstore/yesterday", async (req, res) => {
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

    console.log(`✅ [${requestId}] SALES BRAND STORE YESTERDAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating sales brand store yesterday metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate sales brand store yesterday metrics",
      message: error.message,
    });
  }
});

// Other store endpoints
app.get("/vending/today", async (req, res) => {
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

app.get("/vending/yesterday", async (req, res) => {
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

app.get("/collect/today", async (req, res) => {
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

app.get("/collect/yesterday", async (req, res) => {
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

app.get("/franchise/today", async (req, res) => {
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

app.get("/franchise/yesterday", async (req, res) => {
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

app.get("/b2b/today", async (req, res) => {
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

app.get("/b2b/yesterday", async (req, res) => {
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

// Historical data endpoints
app.get("/historical/ecom", async (req, res) => {
  try {
    const { months = 3, shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const monthsNum = parseInt(months);
    
    console.log(`\n📊 [${requestId}] HISTORICAL ECOM - Starting data fetch for ${monthsNum} months`);
    
    const { startDate, endDate } = getPastMonthsDateRange(monthsNum);
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = [];
    
    for (const date of allDates) {
      try {
        const dateStr = date.toISOString().split('T')[0];
        const dateRange = getDateRange(date);
        
        console.log(`   📅 Processing ${dateStr}...`);
        
        const orders = await processOrdersForStore(shop, dateRange, requestId, 'online');
        const metrics = calculateSimplifiedMetrics(orders, "Ecom");
        
        historicalData.push({
          date: dateStr,
          ...metrics
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   ❌ Error processing ${date.toISOString().split('T')[0]}:`, error.message);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          source: "Ecom",
          summary: {
            totalSales: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            currencyCode: "GEL",
            totalRefunds: 0,
            refundedOrders: 0,
            totalItemsSold: 0,
            totalCapsules: 0,
            error: error.message
          }
        });
      }
    }
    
    const response = {
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        lastUpdated: new Date().toISOString(),
        totalDays: historicalData.length
      },
      source: "Ecom",
      data: historicalData
    };

    console.log(`✅ [${requestId}] HISTORICAL ECOM - Complete: ${historicalData.length} days processed`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical ecom data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical ecom data",
      message: error.message,
    });
  }
});

app.get("/historical/brandstore", async (req, res) => {
  try {
    const { months = 3, shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const monthsNum = parseInt(months);
    
    console.log(`\n📊 [${requestId}] HISTORICAL BRANDSTORE - Starting data fetch for ${monthsNum} months`);
    
    const { startDate, endDate } = getPastMonthsDateRange(monthsNum);
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = [];
    
    for (const date of allDates) {
      try {
        const dateStr = date.toISOString().split('T')[0];
        const dateRange = getDateRange(date);
        
        console.log(`   📅 Processing ${dateStr}...`);
        
        const orders = await processOrdersForStore(shop, dateRange, requestId, 'pos');
        const metrics = calculateSimplifiedMetrics(orders, "Brand Stores");
        
        historicalData.push({
          date: dateStr,
          ...metrics
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   ❌ Error processing ${date.toISOString().split('T')[0]}:`, error.message);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          source: "Brand Stores",
          summary: {
            totalSales: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            currencyCode: "GEL",
            totalRefunds: 0,
            refundedOrders: 0,
            totalItemsSold: 0,
            totalCapsules: 0,
            error: error.message
          }
        });
      }
    }
    
    const response = {
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        lastUpdated: new Date().toISOString(),
        totalDays: historicalData.length
      },
      source: "Brand Stores",
      data: historicalData
    };

    console.log(`✅ [${requestId}] HISTORICAL BRANDSTORE - Complete: ${historicalData.length} days processed`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical brandstore data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical brandstore data",
      message: error.message,
    });
  }
});

// Single day historical endpoint
app.get("/historical/ecom/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    
    console.log(`\n📊 [${requestId}] HISTORICAL ECOM SINGLE DAY - ${date}`);
    
    const dateRange = getDateRange(date);
    const orders = await processOrdersForStore(shop, dateRange, requestId, 'online');
    const metrics = calculateSimplifiedMetrics(orders, "Ecom");
    
    const response = {
      date: date,
      ...metrics
    };

    console.log(`✅ [${requestId}] HISTORICAL ECOM SINGLE DAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical ecom single day data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical ecom single day data",
      message: error.message,
    });
  }
});

app.get("/historical/brandstore/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    
    console.log(`\n📊 [${requestId}] HISTORICAL BRANDSTORE SINGLE DAY - ${date}`);
    
    const dateRange = getDateRange(date);
    const orders = await processOrdersForStore(shop, dateRange, requestId, 'pos');
    const metrics = calculateSimplifiedMetrics(orders, "Brand Stores");
    
    const response = {
      date: date,
      ...metrics
    };

    console.log(`✅ [${requestId}] HISTORICAL BRANDSTORE SINGLE DAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical brandstore single day data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical brandstore single day data",
      message: error.message,
    });
  }
});

// Vending store historical endpoints
app.get("/historical/vending", async (req, res) => {
  try {
    const { months = 3 } = req.query;
    const requestId = req.requestId || "unknown";
    const monthsNum = parseInt(months);
    
    console.log(`\n📊 [${requestId}] HISTORICAL VENDING - Starting data fetch for ${monthsNum} months`);
    
    const { startDate, endDate } = getPastMonthsDateRange(monthsNum);
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = [];
    
    for (const date of allDates) {
      try {
        const dateStr = date.toISOString().split('T')[0];
        const dateRange = getDateRange(date);
        
        console.log(`   📅 Processing ${dateStr}...`);
        
        const orders = await processOrdersForStore("vending", dateRange, requestId);
        const metrics = calculateSimplifiedMetrics(orders, "Vending");
        
        historicalData.push({
          date: dateStr,
          ...metrics
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   ❌ Error processing ${date.toISOString().split('T')[0]}:`, error.message);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          source: "Vending",
          summary: {
            totalSales: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            currencyCode: "GEL",
            totalRefunds: 0,
            refundedOrders: 0,
            totalItemsSold: 0,
            totalCapsules: 0,
            error: error.message
          }
        });
      }
    }
    
    const response = {
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        lastUpdated: new Date().toISOString(),
        totalDays: historicalData.length
      },
      source: "Vending",
      data: historicalData
    };

    console.log(`✅ [${requestId}] HISTORICAL VENDING - Complete: ${historicalData.length} days processed`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical vending data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical vending data",
      message: error.message,
    });
  }
});

app.get("/historical/vending/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    
    console.log(`\n📊 [${requestId}] HISTORICAL VENDING SINGLE DAY - ${date}`);
    
    const dateRange = getDateRange(date);
    const orders = await processOrdersForStore("vending", dateRange, requestId);
    const metrics = calculateSimplifiedMetrics(orders, "Vending");
    
    const response = {
      date: date,
      ...metrics
    };

    console.log(`✅ [${requestId}] HISTORICAL VENDING SINGLE DAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical vending single day data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical vending single day data",
      message: error.message,
    });
  }
});

// Collect store historical endpoints
app.get("/historical/collect", async (req, res) => {
  try {
    const { months = 3 } = req.query;
    const requestId = req.requestId || "unknown";
    const monthsNum = parseInt(months);
    
    console.log(`\n📊 [${requestId}] HISTORICAL COLLECT - Starting data fetch for ${monthsNum} months`);
    
    const { startDate, endDate } = getPastMonthsDateRange(monthsNum);
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = [];
    
    for (const date of allDates) {
      try {
        const dateStr = date.toISOString().split('T')[0];
        const dateRange = getDateRange(date);
        
        console.log(`   📅 Processing ${dateStr}...`);
        
        const orders = await processOrdersForStore("collect", dateRange, requestId);
        const metrics = calculateSimplifiedMetrics(orders, "Collect");
        
        historicalData.push({
          date: dateStr,
          ...metrics
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   ❌ Error processing ${date.toISOString().split('T')[0]}:`, error.message);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          source: "Collect",
          summary: {
            totalSales: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            currencyCode: "GEL",
            totalRefunds: 0,
            refundedOrders: 0,
            totalItemsSold: 0,
            totalCapsules: 0,
            error: error.message
          }
        });
      }
    }
    
    const response = {
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        lastUpdated: new Date().toISOString(),
        totalDays: historicalData.length
      },
      source: "Collect",
      data: historicalData
    };

    console.log(`✅ [${requestId}] HISTORICAL COLLECT - Complete: ${historicalData.length} days processed`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical collect data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical collect data",
      message: error.message,
    });
  }
});

app.get("/historical/collect/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    
    console.log(`\n📊 [${requestId}] HISTORICAL COLLECT SINGLE DAY - ${date}`);
    
    const dateRange = getDateRange(date);
    const orders = await processOrdersForStore("collect", dateRange, requestId);
    const metrics = calculateSimplifiedMetrics(orders, "Collect");
    
    const response = {
      date: date,
      ...metrics
    };

    console.log(`✅ [${requestId}] HISTORICAL COLLECT SINGLE DAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical collect single day data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical collect single day data",
      message: error.message,
    });
  }
});

// Franchise store historical endpoints
app.get("/historical/franchise", async (req, res) => {
  try {
    const { months = 3 } = req.query;
    const requestId = req.requestId || "unknown";
    const monthsNum = parseInt(months);
    
    console.log(`\n📊 [${requestId}] HISTORICAL FRANCHISE - Starting data fetch for ${monthsNum} months`);
    
    const { startDate, endDate } = getPastMonthsDateRange(monthsNum);
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = [];
    
    for (const date of allDates) {
      try {
        const dateStr = date.toISOString().split('T')[0];
        const dateRange = getDateRange(date);
        
        console.log(`   📅 Processing ${dateStr}...`);
        
        const orders = await processOrdersForStore("franchise", dateRange, requestId);
        const metrics = calculateSimplifiedMetrics(orders, "Franchise");
        
        historicalData.push({
          date: dateStr,
          ...metrics
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   ❌ Error processing ${date.toISOString().split('T')[0]}:`, error.message);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          source: "Franchise",
          summary: {
            totalSales: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            currencyCode: "GEL",
            totalRefunds: 0,
            refundedOrders: 0,
            totalItemsSold: 0,
            totalCapsules: 0,
            error: error.message
          }
        });
      }
    }
    
    const response = {
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        lastUpdated: new Date().toISOString(),
        totalDays: historicalData.length
      },
      source: "Franchise",
      data: historicalData
    };

    console.log(`✅ [${requestId}] HISTORICAL FRANCHISE - Complete: ${historicalData.length} days processed`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical franchise data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical franchise data",
      message: error.message,
    });
  }
});

app.get("/historical/franchise/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    
    console.log(`\n📊 [${requestId}] HISTORICAL FRANCHISE SINGLE DAY - ${date}`);
    
    const dateRange = getDateRange(date);
    const orders = await processOrdersForStore("franchise", dateRange, requestId);
    const metrics = calculateSimplifiedMetrics(orders, "Franchise");
    
    const response = {
      date: date,
      ...metrics
    };

    console.log(`✅ [${requestId}] HISTORICAL FRANCHISE SINGLE DAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical franchise single day data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical franchise single day data",
      message: error.message,
    });
  }
});

// B2B store historical endpoints
app.get("/historical/b2b", async (req, res) => {
  try {
    const { months = 3 } = req.query;
    const requestId = req.requestId || "unknown";
    const monthsNum = parseInt(months);
    
    console.log(`\n📊 [${requestId}] HISTORICAL B2B - Starting data fetch for ${monthsNum} months`);
    
    const { startDate, endDate } = getPastMonthsDateRange(monthsNum);
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = [];
    
    for (const date of allDates) {
      try {
        const dateStr = date.toISOString().split('T')[0];
        const dateRange = getDateRange(date);
        
        console.log(`   📅 Processing ${dateStr}...`);
        
        const orders = await processOrdersForStore("b2b", dateRange, requestId);
        const metrics = calculateSimplifiedMetrics(orders, "B2B");
        
        historicalData.push({
          date: dateStr,
          ...metrics
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   ❌ Error processing ${date.toISOString().split('T')[0]}:`, error.message);
        historicalData.push({
          date: date.toISOString().split('T')[0],
          source: "B2B",
          summary: {
            totalSales: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            currencyCode: "GEL",
            totalRefunds: 0,
            refundedOrders: 0,
            totalItemsSold: 0,
            totalCapsules: 0,
            error: error.message
          }
        });
      }
    }
    
    const response = {
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        lastUpdated: new Date().toISOString(),
        totalDays: historicalData.length
      },
      source: "B2B",
      data: historicalData
    };

    console.log(`✅ [${requestId}] HISTORICAL B2B - Complete: ${historicalData.length} days processed`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical b2b data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical b2b data",
      message: error.message,
    });
  }
});

app.get("/historical/b2b/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    
    console.log(`\n📊 [${requestId}] HISTORICAL B2B SINGLE DAY - ${date}`);
    
    const dateRange = getDateRange(date);
    const orders = await processOrdersForStore("b2b", dateRange, requestId);
    const metrics = calculateSimplifiedMetrics(orders, "B2B");
    
    const response = {
      date: date,
      ...metrics
    };

    console.log(`✅ [${requestId}] HISTORICAL B2B SINGLE DAY - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(response);
  } catch (error) {
    console.error("Error calculating historical b2b single day data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate historical b2b single day data",
      message: error.message,
    });
  }
});

// Legacy redirects
app.get('/sales-today', (req, res) => {
  res.redirect('/sales/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales-yesterday', (req, res) => {
  res.redirect('/sales/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health - Health check and environment status',
      'GET /shops - List available shops and their configuration',
      'GET /test - Test environment configuration',
      'GET /sales/today?shop=ecommerce - Get today\'s sales for specific shop',
      'GET /sales/yesterday?shop=ecommerce - Get yesterday\'s sales for specific shop',
      'GET /sales/ecom/today?shop=ecommerce - Get ecom sales for today',
      'GET /sales/ecom/yesterday?shop=ecommerce - Get ecom sales for yesterday',
      'GET /sales/brandstore/today?shop=ecommerce - Get brand store sales for today',
      'GET /sales/brandstore/yesterday?shop=ecommerce - Get brand store sales for yesterday',
      'GET /historical/ecom?months=3 - Get historical ecom data for past months',
      'GET /historical/brandstore?months=3 - Get historical brandstore data for past months',
      'GET /historical/vending?months=3 - Get historical vending data for past months',
      'GET /historical/collect?months=3 - Get historical collect data for past months',
      'GET /historical/franchise?months=3 - Get historical franchise data for past months',
      'GET /historical/b2b?months=3 - Get historical b2b data for past months',
      'GET /historical/ecom/2025-01-15 - Get ecom data for specific date',
      'GET /historical/brandstore/2025-01-15 - Get brandstore data for specific date',
      'GET /historical/vending/2025-01-15 - Get vending data for specific date',
      'GET /historical/collect/2025-01-15 - Get collect data for specific date',
      'GET /historical/franchise/2025-01-15 - Get franchise data for specific date',
      'GET /historical/b2b/2025-01-15 - Get b2b data for specific date',
      'GET /vending/today - All sales from vending store today',
      'GET /vending/yesterday - All sales from vending store yesterday',
      'GET /collect/today - All sales from collect store today',
      'GET /collect/yesterday - All sales from collect store yesterday',
      'GET /franchise/today - All sales from franchise store today',
      'GET /franchise/yesterday - All sales from franchise store yesterday',
      'GET /b2b/today - All sales from b2b store today',
      'GET /b2b/yesterday - All sales from b2b store yesterday'
    ],
    availableShops: Object.keys(SHOP_CONFIGS)
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log('🚀 Shopify Data Puller Server Started');
  console.log('=====================================');
  console.log(`🌐 Server running on: http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Available Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/shops`);
  console.log(`   GET  http://localhost:${PORT}/test`);
  console.log(`   GET  http://localhost:${PORT}/sales/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/ecom/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/ecom/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/brandstore/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/brandstore/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/historical/ecom?months=3`);
  console.log(`   GET  http://localhost:${PORT}/historical/brandstore?months=3`);
  console.log(`   GET  http://localhost:${PORT}/historical/vending?months=3`);
  console.log(`   GET  http://localhost:${PORT}/historical/collect?months=3`);
  console.log(`   GET  http://localhost:${PORT}/historical/franchise?months=3`);
  console.log(`   GET  http://localhost:${PORT}/historical/b2b?months=3`);
  console.log(`   GET  http://localhost:${PORT}/historical/ecom/2025-01-15`);
  console.log(`   GET  http://localhost:${PORT}/historical/brandstore/2025-01-15`);
  console.log(`   GET  http://localhost:${PORT}/historical/vending/2025-01-15`);
  console.log(`   GET  http://localhost:${PORT}/historical/collect/2025-01-15`);
  console.log(`   GET  http://localhost:${PORT}/historical/franchise/2025-01-15`);
  console.log(`   GET  http://localhost:${PORT}/historical/b2b/2025-01-15`);
  console.log(`   GET  http://localhost:${PORT}/vending/today`);
  console.log(`   GET  http://localhost:${PORT}/vending/yesterday`);
  console.log(`   GET  http://localhost:${PORT}/collect/today`);
  console.log(`   GET  http://localhost:${PORT}/collect/yesterday`);
  console.log(`   GET  http://localhost:${PORT}/franchise/today`);
  console.log(`   GET  http://localhost:${PORT}/franchise/yesterday`);
  console.log(`   GET  http://localhost:${PORT}/b2b/today`);
  console.log(`   GET  http://localhost:${PORT}/b2b/yesterday`);
  console.log('');
  console.log('🏪 Available Shops: ecommerce, vending, collect, franchise, b2b, brandstores');
  console.log('');
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Trying port ${PORT + 1}...`);
    const newPort = PORT + 1;
    const newServer = app.listen(newPort, () => {
      console.log(`🌐 Server running on: http://localhost:${newPort}`);
    });
    newServer.on('error', (err) => {
      console.error('❌ Failed to start server:', err.message);
      process.exit(1);
    });
  } else {
    console.error('❌ Server error:', error.message);
    process.exit(1);
  }
});

export default app;
