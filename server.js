import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Helper function to load capsule SKU data from JSON file
const loadCapsuleSKUs = () => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const capsuleDataPath = path.join(__dirname, 'src/data/Capsules.json');
    const capsuleData = fs.readFileSync(capsuleDataPath, 'utf8');
    return JSON.parse(capsuleData);
  } catch (error) {
    console.error('Error loading capsule SKU data:', error);
    return [];
  }
};

// Helper function to calculate capsules sold based on SKU lookup from Capsules.json
const calculateCapsulesFromSKU = (sku) => {
  const capsuleSKUs = loadCapsuleSKUs();
  
  if (!sku) {
    return { capsules: 0, category: 'Unknown' };
  }
  
  // Find matching SKU in the data
  const matchingSKU = capsuleSKUs.find(item => 
    item.SKU.toLowerCase() === sku.toLowerCase()
  );
  
  if (matchingSKU) {
    return {
      capsules: matchingSKU.Caps,
      category: matchingSKU['Prod Cat']
    };
  }
  
  // If no exact match found, return 0
  return { capsules: 0, category: 'Unknown' };
};

// Helper function to calculate total capsules sold from orders using SKU lookup
const calculateCapsulesSold = (orders) => {
  let totalCapsulesSold = 0;
  let totalMulticapsulesSold = 0;
  let totalEuropeanCapsulesSold = 0;
  let totalTeaCapsulesSold = 0;
  
  orders.forEach(order => {
    if (order.lineItems?.nodes) {
      order.lineItems.nodes.forEach(item => {
        const sku = item.variant?.sku || "";
        const quantity = item.quantity || 0;
        
        // Calculate capsules per unit based on SKU lookup
        const { capsules, category } = calculateCapsulesFromSKU(sku);
        
        // Total capsules = quantity ordered × capsules per unit
        const totalCapsulesForItem = quantity * capsules;
        totalCapsulesSold += totalCapsulesForItem;
        
        // Count by category
        if (category === 'Multicapsule' || category === 'Multicapsule/ New Flavors') {
          totalMulticapsulesSold += totalCapsulesForItem;
        } else if (category === 'European') {
          totalEuropeanCapsulesSold += totalCapsulesForItem;
        } else if (category === 'Tea' || category === 'Tea Capsules') {
          totalTeaCapsulesSold += totalCapsulesForItem;
        }
      });
    }
  });
  
  return {
    totalCapsules: totalCapsulesSold,
    totalMulticapsules: totalMulticapsulesSold,
    totalEuropeanCapsules: totalEuropeanCapsulesSold,
    totalTeaCapsules: totalTeaCapsulesSold
  };
};

// ============================================================================
// CORE ENDPOINTS
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Shopify Historical Data API Server',
    version: '1.0.0',
    availableEndpoints: [
      'GET /health - Health check and environment status',
      'GET /shops - List available shops and their configuration',
      'GET /historical/general-ecom/:date - Historical single day data for general ecommerce',
      'GET /historical/ecom/:date - Historical single day data for ecommerce (online only)',
      'GET /historical/brandstores/:date - Historical single day data for brand stores (POS only)',
      'GET /historical/vending/:date - Historical single day data for vending store',
      'GET /historical/collect/:date - Historical single day data for collect store',
      'GET /historical/franchise/:date - Historical single day data for franchise store',
      'GET /historical/b2b/:date - Historical single day data for B2B store',
      'GET /historical/date-range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD - Historical data for all shops within date range'
    ]
  });
});

// ============================================================================
// HISTORICAL PAST MONTH ENDPOINTS (MUST BE BEFORE SINGLE DAY ENDPOINTS)
// ============================================================================

// Helper function to get all dates in a range
const getAllDatesInRange = (startDate, endDate) => {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Simple loop using date strings
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  
  let currentStr = startStr;
  while (currentStr <= endStr) {
    const newDate = new Date(currentStr + 'T00:00:00.000Z');
    dates.push(newDate);
    
    // Increment date string
    const currentDate = new Date(currentStr);
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    currentStr = currentDate.toISOString().split('T')[0];
  }
  
  return dates;
};

// Helper function to get past month (complete) date range
const getPastMonthCompleteRange = () => {
  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  
  // Get previous month
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  
  // First day of previous month
  const startDate = new Date(Date.UTC(prevYear, prevMonth, 1, 0, 0, 0, 0));
  
  // Last day of previous month
  const endDate = new Date(Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59, 999));
  
  return { startDate, endDate };
};

// Helper function to get past month (including current) date range
const getPastMonthIncludingCurrentRange = () => {
  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  const currentDay = now.getUTCDate();
  
  // Get previous month
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  
  // First day of previous month
  const startDate = new Date(Date.UTC(prevYear, prevMonth, 1, 0, 0, 0, 0));
  
  // Yesterday (to avoid including today's incomplete data)
  const endDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 1, 23, 59, 59, 999));
  
  return { startDate, endDate };
};

// Helper function to validate and parse date range
const validateAndParseDateRange = (startDateStr, endDateStr) => {
  // Validate date string format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  
  if (!startDateStr || !endDateStr) {
    throw new Error('Both startDate and endDate are required');
  }
  
  if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD format');
  }
  
  const startDate = new Date(startDateStr + 'T00:00:00.000Z');
  const endDate = new Date(endDateStr + 'T23:59:59.999Z');
  
  // Validate that dates are valid
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid date values');
  }
  
  // Check if start date is before end date
  if (startDate > endDate) {
    throw new Error('Start date must be before or equal to end date');
  }
  
  return {
    startDate,
    endDate,
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString()
  };
};

// Helper function to process historical data for multiple days
const processHistoricalDataForDays = async (dates, shop, sourceFilter, sourceName, requestId) => {
  const historicalData = [];
  const totalDays = dates.length;
  let processedDays = 0;

  console.log(`\n📊 [${requestId}] Starting ${sourceName} historical data processing for ${totalDays} days...`);

  for (const date of dates) {
    try {
      const dateStr = date.toISOString().split('T')[0];
      console.log(`   📅 [${processedDays + 1}/${totalDays}] Processing ${dateStr}...`);
      
      // Validate date string
      if (!dateStr || dateStr.length !== 10 || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.error(`   ❌ Invalid date string: ${dateStr}`);
        continue;
      }
      
      const dateRange = getHistoricalDateRange(dateStr);
      
      const orders = await processOrdersForStore(shop, dateRange, requestId, sourceFilter);
      const metrics = calculateHistoricalMetrics(orders, sourceName);
      metrics.date = dateStr;
      
      historicalData.push(metrics);
      processedDays++;
      
      console.log(`   ✅ [${processedDays}/${totalDays}] ${dateStr} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`   ❌ [${processedDays + 1}/${totalDays}] Error processing ${date.toISOString().split('T')[0]}:`, error.message);
      historicalData.push({
        date: date.toISOString().split('T')[0],
        source: sourceName,
        summary: {
          totalSales: 0,
          totalOrders: 0,
          averageOrderValue: 0,
          currencyCode: "GEL",
          totalRefunds: 0,
          refundedOrders: 0,
          totalItemsSold: 0,
          totalCapsulesSold: 0,
          totalMulticapsulesSold: 0,
          totalEuropeanCapsulesSold: 0,
          totalTeaCapsulesSold: 0,
          error: error.message
        }
      });
      processedDays++;
    }
  }

  console.log(`\n🎉 [${requestId}] ${sourceName} historical data processing complete! Processed ${processedDays}/${totalDays} days.`);
  return historicalData;
};

// GENERAL ECOM - Past Month (Complete)
app.get("/historical/general-ecom/past-month", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startDate, endDate } = getPastMonthCompleteRange();
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = await processHistoricalDataForDays(allDates, shop, null, "General Ecom", requestId);
    
    const response = {
      period: "past-month-complete",
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        totalDays: historicalData.length
      },
      source: "General Ecom",
      data: historicalData
    };

    res.json(response);
  } catch (error) {
    console.error("Error calculating general ecom past month data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate general ecom past month data",
      message: error.message,
    });
  }
});

// GENERAL ECOM - Past Month (Including Current)
app.get("/historical/general-ecom/past-month-current", async (req, res) => {
  try {
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const { startDate, endDate } = getPastMonthIncludingCurrentRange();
    const allDates = getAllDatesInRange(startDate, endDate);
    
    const historicalData = await processHistoricalDataForDays(allDates, shop, null, "General Ecom", requestId);
    
    const response = {
      period: "past-month-including-current",
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        totalDays: historicalData.length
      },
      source: "General Ecom",
      data: historicalData
    };

    res.json(response);
  } catch (error) {
    console.error("Error calculating general ecom past month including current data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate general ecom past month including current data",
      message: error.message,
    });
  }
});

// ============================================================================
// HISTORICAL SINGLE DAY ENDPOINTS
// ============================================================================

// Helper function to get date range for a specific date
const getHistoricalDateRange = (date) => {
  // Validate date string format
  if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new Error(`Invalid date format: ${date}`);
  }
  
  const targetDate = new Date(date + 'T00:00:00.000Z');
  const endDate = new Date(date + 'T23:59:59.999Z');
  
  // Validate that dates are valid
  if (isNaN(targetDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error(`Invalid date values: ${date}`);
  }
  
  return {
    startISO: targetDate.toISOString(),
    endISO: endDate.toISOString(),
    startDate: targetDate,
    endDate: endDate
  };
};

// Helper function to calculate simplified metrics for historical data
const calculateHistoricalMetrics = (orders, sourceName) => {
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
  const capsuleData = calculateCapsulesSold(orders);

  return {
    date: null, // Will be set by the endpoint
    source: sourceName,
    summary: {
      totalSales: parseFloat(totalSales.toFixed(2)),
      totalOrders,
      averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
      currencyCode,
      totalRefunds: parseFloat(totalRefunds.toFixed(2)),
      refundedOrders,
      totalItemsSold,
      totalCapsulesSold: capsuleData.totalCapsules,
      totalMulticapsulesSold: capsuleData.totalMulticapsules,
      totalEuropeanCapsulesSold: capsuleData.totalEuropeanCapsules,
      totalTeaCapsulesSold: capsuleData.totalTeaCapsules
    }
  };
};

// GENERAL ECOM - Historical Single Day
app.get("/historical/general-ecom/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const dateRange = getHistoricalDateRange(date);

    const orders = await processOrdersForStore(shop, dateRange, requestId);
    const metrics = calculateHistoricalMetrics(orders, "General Ecom");
    metrics.date = date;

    console.log(`✅ [${requestId}] GENERAL ECOM HISTORICAL ${date} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(metrics);
  } catch (error) {
    console.error("Error calculating general ecom historical metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate general ecom historical metrics",
      message: error.message,
    });
  }
});

// ECOM - Historical Single Day (Online Only)
app.get("/historical/ecom/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const dateRange = getHistoricalDateRange(date);

    const orders = await processOrdersForStore(shop, dateRange, requestId, 'online');
    const metrics = calculateHistoricalMetrics(orders, "Ecom");
    metrics.date = date;

    console.log(`✅ [${requestId}] ECOM HISTORICAL ${date} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(metrics);
  } catch (error) {
    console.error("Error calculating ecom historical metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate ecom historical metrics",
      message: error.message,
    });
  }
});

// BRAND STORES - Historical Single Day (POS Only)
app.get("/historical/brandstores/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { shop = "ecommerce" } = req.query;
    const requestId = req.requestId || "unknown";
    const dateRange = getHistoricalDateRange(date);

    const orders = await processOrdersForStore(shop, dateRange, requestId, 'pos');
    const metrics = calculateHistoricalMetrics(orders, "Brand Stores");
    metrics.date = date;

    console.log(`✅ [${requestId}] BRAND STORES HISTORICAL ${date} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(metrics);
  } catch (error) {
    console.error("Error calculating brand stores historical metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate brand stores historical metrics",
      message: error.message,
    });
  }
});

// VENDING - Historical Single Day
app.get("/historical/vending/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    const dateRange = getHistoricalDateRange(date);

    const orders = await processOrdersForStore("vending", dateRange, requestId);
    const metrics = calculateHistoricalMetrics(orders, "Vending");
    metrics.date = date;

    console.log(`✅ [${requestId}] VENDING HISTORICAL ${date} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(metrics);
  } catch (error) {
    console.error("Error calculating vending historical metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate vending historical metrics",
      message: error.message,
    });
  }
});

// COLLECT - Historical Single Day
app.get("/historical/collect/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    const dateRange = getHistoricalDateRange(date);

    const orders = await processOrdersForStore("collect", dateRange, requestId);
    const metrics = calculateHistoricalMetrics(orders, "Collect");
    metrics.date = date;

    console.log(`✅ [${requestId}] COLLECT HISTORICAL ${date} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(metrics);
  } catch (error) {
    console.error("Error calculating collect historical metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate collect historical metrics",
      message: error.message,
    });
  }
});

// FRANCHISE - Historical Single Day
app.get("/historical/franchise/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    const dateRange = getHistoricalDateRange(date);

    const orders = await processOrdersForStore("franchise", dateRange, requestId);
    const metrics = calculateHistoricalMetrics(orders, "Franchise");
    metrics.date = date;

    console.log(`✅ [${requestId}] FRANCHISE HISTORICAL ${date} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(metrics);
  } catch (error) {
    console.error("Error calculating franchise historical metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate franchise historical metrics",
      message: error.message,
    });
  }
});

// B2B - Historical Single Day
app.get("/historical/b2b/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const requestId = req.requestId || "unknown";
    const dateRange = getHistoricalDateRange(date);

    const orders = await processOrdersForStore("b2b", dateRange, requestId);
    const metrics = calculateHistoricalMetrics(orders, "B2B");
    metrics.date = date;

    console.log(`✅ [${requestId}] B2B HISTORICAL ${date} - Complete: ${metrics.summary.totalSales.toFixed(2)} ${metrics.summary.currencyCode || "GEL"} (${metrics.summary.totalOrders} orders)`);
    res.json(metrics);
  } catch (error) {
    console.error("Error calculating b2b historical metrics:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to calculate b2b historical metrics",
      message: error.message,
    });
  }
});

// ============================================================================
// DATE RANGE ENDPOINTS - ALL SHOPS
// ============================================================================

// Helper function to process data for all shops within a date range
const processAllShopsDateRange = async (startDateStr, endDateStr, requestId) => {
  const dateRange = validateAndParseDateRange(startDateStr, endDateStr);
  const allDates = getAllDatesInRange(dateRange.startDate, dateRange.endDate);
  
  console.log(`\n📊 [${requestId}] Starting date range processing for all shops`);
  console.log(`   📅 Date Range: ${startDateStr} to ${endDateStr}`);
  console.log(`   📅 Total Days: ${allDates.length}`);
  
  const shopResults = {};
  const shopTypes = Object.keys(SHOP_CONFIGS);
  
  // Process each shop type
  for (const shopType of shopTypes) {
    try {
      console.log(`\n🏪 [${requestId}] Processing ${shopType.toUpperCase()} shop...`);
      
      // Process each day for this shop
      const shopData = [];
      for (const date of allDates) {
        try {
          const dateStr = date.toISOString().split('T')[0];
          const singleDateRange = getHistoricalDateRange(dateStr);
          
          // Get orders for this shop and date
          const orders = await processOrdersForStore(shopType, singleDateRange, requestId);
          const metrics = calculateHistoricalMetrics(orders, shopType.charAt(0).toUpperCase() + shopType.slice(1));
          metrics.date = dateStr;
          
          shopData.push(metrics);
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } catch (error) {
          console.error(`   ❌ Error processing ${shopType} for ${date.toISOString().split('T')[0]}:`, error.message);
          shopData.push({
            date: date.toISOString().split('T')[0],
            source: shopType.charAt(0).toUpperCase() + shopType.slice(1),
            summary: {
              totalSales: 0,
              totalOrders: 0,
              averageOrderValue: 0,
              currencyCode: "GEL",
              totalRefunds: 0,
              refundedOrders: 0,
              totalItemsSold: 0,
              totalCapsulesSold: 0,
              totalMulticapsulesSold: 0,
              totalEuropeanCapsulesSold: 0,
              totalTeaCapsulesSold: 0,
              error: error.message
            }
          });
        }
      }
      
      shopResults[shopType] = shopData;
      console.log(`   ✅ [${requestId}] ${shopType.toUpperCase()} - Complete: ${shopData.length} days processed`);
      
    } catch (error) {
      console.error(`   ❌ [${requestId}] Error processing ${shopType}:`, error.message);
      shopResults[shopType] = [];
    }
  }
  
  return shopResults;
};

// DATE RANGE - All Shops
app.get("/historical/date-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const requestId = req.requestId || "unknown";
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "Missing required parameters",
        message: "Both startDate and endDate query parameters are required (format: YYYY-MM-DD)",
        example: "/historical/date-range?startDate=2025-01-01&endDate=2025-01-31"
      });
    }
    
    const shopResults = await processAllShopsDateRange(startDate, endDate, requestId);
    
    const response = {
      period: "custom-date-range",
      dateRange: {
        from: startDate,
        to: endDate,
        totalDays: getAllDatesInRange(
          new Date(startDate + 'T00:00:00.000Z'),
          new Date(endDate + 'T23:59:59.999Z')
        ).length
      },
      shops: shopResults,
      summary: {
        totalShops: Object.keys(shopResults).length,
        processedShops: Object.keys(shopResults).filter(shop => shopResults[shop].length > 0).length,
        totalDays: getAllDatesInRange(
          new Date(startDate + 'T00:00:00.000Z'),
          new Date(endDate + 'T23:59:59.999Z')
        ).length
      }
    };

    console.log(`\n🎉 [${requestId}] Date range processing complete! Processed ${response.summary.processedShops}/${response.summary.totalShops} shops.`);
    res.json(response);
    
  } catch (error) {
    console.error("Error processing date range data:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to process date range data",
      message: error.message,
    });
  }
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
    message: 'The requested endpoint does not exist. Please check the available endpoints.',
    availableEndpoints: [
      'GET /health - Health check and environment status',
      'GET /shops - List available shops and their configuration',
      'GET /historical/general-ecom/:date - Historical single day data for general ecommerce',
      'GET /historical/ecom/:date - Historical single day data for ecommerce (online only)',
      'GET /historical/brandstores/:date - Historical single day data for brand stores (POS only)',
      'GET /historical/vending/:date - Historical single day data for vending store',
      'GET /historical/collect/:date - Historical single day data for collect store',
      'GET /historical/franchise/:date - Historical single day data for franchise store',
      'GET /historical/b2b/:date - Historical single day data for B2B store',
      'GET /historical/date-range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD - Historical data for all shops within date range'
    ]
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log('🚀 Shopify Historical Data API Server Started');
  console.log('===============================================');
  console.log(`🌐 Server running on: http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Available Historical Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/historical/general-ecom/2025-10-06`);
  console.log(`   GET  http://localhost:${PORT}/historical/ecom/2025-10-06`);
  console.log(`   GET  http://localhost:${PORT}/historical/brandstores/2025-10-06`);
  console.log(`   GET  http://localhost:${PORT}/historical/vending/2025-10-06`);
  console.log(`   GET  http://localhost:${PORT}/historical/collect/2025-10-06`);
  console.log(`   GET  http://localhost:${PORT}/historical/franchise/2025-10-06`);
  console.log(`   GET  http://localhost:${PORT}/historical/b2b/2025-10-06`);
  console.log(`   GET  http://localhost:${PORT}/historical/date-range?startDate=2025-01-01&endDate=2025-01-31`);
  console.log('');
  console.log('   Other Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/shops`);
  console.log(`   GET  http://localhost:${PORT}/`);
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