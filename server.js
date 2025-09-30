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

// Multiple shop configurations (matching your existing structure)
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
};

// Helper function to get shop config
const getShopConfig = (shopType = "ecommerce") => {
  return SHOP_CONFIGS[shopType] || SHOP_CONFIGS.ecommerce;
};

// Helper function to build query parts with source code filtering
const buildQueryParts = (startISO, endISO, shopType = "ecommerce") => {
  const qParts = [
    `created_at:>=${startISO}`,
    `created_at:<=${endISO}`,
    "-cancelled_status:cancelled",
    "-test:true",
  ];

  // Add channel filtering for Brand Stores
  const shopConfig = getShopConfig(shopType);
  if (shopConfig.channel) {
    qParts.push(`channel:"${shopConfig.channel}"`);
    console.log(
      `🔍 [${shopType}] Added channel filter: channel:"${shopConfig.channel}"`
    );
  }

  return qParts;
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

// Helper function to validate environment
function validateEnvironment() {
  const requiredVars = [
    'SHOPIFY_SHOP',
    'SHOPIFY_ACCESS_TOKEN'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      message: `Missing required environment variables: ${missing.join(', ')}`
    };
  }
  
  return { valid: true };
}

// Health check endpoint
app.get('/health', (req, res) => {
  const envCheck = validateEnvironment();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      valid: envCheck.valid,
      missing: envCheck.missing || [],
      availableShops: Object.keys(SHOP_CONFIGS)
    }
  });
});

// Get available shops
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

// Test endpoint to check environment
app.get('/test', async (req, res) => {
  try {
    const envCheck = validateEnvironment();
    
    if (!envCheck.valid) {
      return res.status(400).json({
        success: false,
        error: envCheck.message,
        environment: {
          valid: false,
          missing: envCheck.missing
        }
      });
    }
    
    // Try to get shop info
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

// SALES TODAY ENDPOINT
app.get("/sales-today", async (req, res) => {
  const startTime = Date.now();
  try {
    // Get shop configuration from query parameter
    const { shop = "ecommerce" } = req.query;
    const shopConfig = getShopConfig(shop);
    const requestId = req.requestId || "unknown";

    // Set date range to today only
    const now = new Date();
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0); // Start of today

    const startISO = startDate.toISOString();
    const endISO = now.toISOString();

    console.log(`\n📊 [${requestId}] SALES TODAY - Starting data fetch`);
    console.log(`   🏪 Shop: ${shop}`);
    console.log(
      `   📅 Date Range: ${startISO.substring(0, 10)} to ${endISO.substring(0, 10)}`
    );
    console.log(`   ⏰ Current Time: ${now.toISOString()}`);
    console.log(`   🌐 Shopify Domain: ${shopConfig.shop}`);
    console.log(
      `   🔑 API Version: ${process.env.SHOPIFY_API_VERSION || "2023-10"}`
    );

    // Query for all orders from today
    const qParts = buildQueryParts(startISO, endISO, shop);
    const orderQueryString = qParts.join(" ");

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
        return orderDate >= startDate && orderDate <= now;
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
    let grossSales = 0;
    let totalSales = 0;
    let totalRefunds = 0;
    let totalCOGS = 0;
    let totalOrders = orders.length;
    let refundedOrders = 0;
    let totalItemsSold = 0; // Total quantity of all individual items/capsules

    // Process orders
    orders.forEach((order) => {
      // Parse all monetary values
      const originalTotal = parseFloat(
        order.totalPriceSet?.shopMoney?.amount || "0"
      );
      const discounts = parseFloat(
        order.totalDiscountsSet?.shopMoney?.amount || "0"
      );
      const currentTotal = parseFloat(
        order.currentTotalPriceSet?.shopMoney?.amount || "0"
      );
      const refunded = parseFloat(
        order.totalRefundedSet?.shopMoney?.amount || "0"
      );

      // Calculate COGS for this order and count total items
      let orderCOGS = 0;
      order.lineItems?.nodes?.forEach((item) => {
        const quantity = item.quantity || 0;
        const unitCost = parseFloat(
          item.variant?.inventoryItem?.unitCost?.amount || "0"
        );
        orderCOGS += quantity * unitCost;
        totalItemsSold += quantity; // Add to total items sold
      });

      if (!currencyCode) {
        currencyCode = order.totalPriceSet?.shopMoney?.currencyCode;
      }

      // Keep original gross sales calculation
      grossSales += originalTotal + discounts;

      // Track COGS
      totalCOGS += orderCOGS;

      // Track total sales (current amount after refunds)
      totalSales += currentTotal;

      // Track refunds
      totalRefunds += refunded;
      if (refunded > 0) {
        refundedOrders++;
      }
    });

    // Product Analysis
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
        const unitCost = parseFloat(
          item.variant?.inventoryItem?.unitCost?.amount || "0"
        );
        const totalCost = quantity * unitCost;

        if (productId) {
          if (productMap.has(productId)) {
            const existing = productMap.get(productId);
            existing.quantity += quantity;
            existing.totalSales += totalPrice;
            existing.totalCost += totalCost;
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
              totalCost,
              unitPrice,
              unitCost,
              orders: 1,
            });
          }
        }
      });
    });

    // Convert to array and sort by total sales (most popular first)
    const products = Array.from(productMap.values()).sort(
      (a, b) => b.totalSales - a.totalSales
    );

    const mostPopular = products.slice(0, 10); // Top 10
    const leastPopular = products.slice(-10).reverse(); // Bottom 10

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      summary: {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalCOGS: parseFloat(totalCOGS.toFixed(2)),
        totalOrders,
        currencyCode,
      },
      productAnalysis: {
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
      },
    };

    console.log(`\n✅ [${requestId}] SALES TODAY - Processing Complete`);
    console.log(`   📊 Final Metrics:`);
    console.log(
      `      💰 Total Sales: ${totalSales.toFixed(2)} ${currencyCode || "GEL"}`
    );
    console.log(`      📦 Total Orders: ${totalOrders}`);
    console.log(`      💸 Total COGS: ${totalCOGS.toFixed(2)} ${currencyCode || "GEL"}`);
    console.log(`      🏷️  Products Analyzed: ${products.length}`);
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
app.get("/sales-yesterday", async (req, res) => {
  try {
    // Get shop configuration from query parameter
    const { shop = "ecommerce" } = req.query;
    const shopConfig = getShopConfig(shop);

    // Set date range to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endDate = new Date(yesterday);
    endDate.setHours(23, 59, 59, 999);

    const startISO = yesterday.toISOString();
    const endISO = endDate.toISOString();

    console.log(
      `Calculating yesterday's sales metrics from ${startISO.substring(0, 10)}`
    );

    // Query for all orders from yesterday
    const qParts = [
      `created_at:>=${startISO}`,
      `created_at:<=${endISO}`,
      "-cancelled_status:cancelled",
      "-test:true",
    ];
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
        return orderDate >= yesterday && orderDate <= endDate;
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
    let grossSales = 0;
    let totalSales = 0;
    let totalRefunds = 0;
    let totalCOGS = 0;
    let totalOrders = orders.length;
    let refundedOrders = 0;
    let totalItemsSold = 0; // Total quantity of all individual items/capsules

    // Process orders
    orders.forEach((order) => {
      const originalTotal = parseFloat(
        order.totalPriceSet?.shopMoney?.amount || "0"
      );
      const discounts = parseFloat(
        order.totalDiscountsSet?.shopMoney?.amount || "0"
      );
      const currentTotal = parseFloat(
        order.currentTotalPriceSet?.shopMoney?.amount || "0"
      );
      const refunded = parseFloat(
        order.totalRefundedSet?.shopMoney?.amount || "0"
      );

      // Calculate COGS and count total items
      let orderCOGS = 0;
      order.lineItems?.nodes?.forEach((item) => {
        const quantity = item.quantity || 0;
        const unitCost = parseFloat(
          item.variant?.inventoryItem?.unitCost?.amount || "0"
        );
        orderCOGS += quantity * unitCost;
        totalItemsSold += quantity; // Add to total items sold
      });

      if (!currencyCode) {
        currencyCode = order.totalPriceSet?.shopMoney?.currencyCode;
      }

      // Keep original gross sales calculation
      grossSales += originalTotal + discounts;

      // Track COGS
      totalCOGS += orderCOGS;

      // Track total sales
      totalSales += currentTotal;

      // Track refunds
      totalRefunds += refunded;
      if (refunded > 0) {
        refundedOrders++;
      }
    });

    // Product Analysis
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
        const unitCost = parseFloat(
          item.variant?.inventoryItem?.unitCost?.amount || "0"
        );
        const totalCost = quantity * unitCost;

        if (productId) {
          if (productMap.has(productId)) {
            const existing = productMap.get(productId);
            existing.quantity += quantity;
            existing.totalSales += totalPrice;
            existing.totalCost += totalCost;
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
              totalCost,
              unitPrice,
              unitCost,
              orders: 1,
            });
          }
        }
      });
    });

    // Convert to array and sort by total sales (most popular first)
    const products = Array.from(productMap.values()).sort(
      (a, b) => b.totalSales - a.totalSales
    );

    const mostPopular = products.slice(0, 10); // Top 10
    const leastPopular = products.slice(-10).reverse(); // Bottom 10

    const response = {
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
        lastUpdated: new Date().toISOString(),
      },
      summary: {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalCOGS: parseFloat(totalCOGS.toFixed(2)),
        totalOrders,
        currencyCode,
      },
      productAnalysis: {
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
      },
    };

    console.log(
      `Processed ${totalOrders} orders - Total Sales: ${totalSales.toFixed(2)} ${currencyCode || "GEL"} - COGS: ${totalCOGS.toFixed(2)} ${currencyCode || "GEL"}`
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
      'GET /sales-today?shop=ecommerce - Get today\'s sales for specific shop',
      'GET /sales-yesterday?shop=ecommerce - Get yesterday\'s sales for specific shop'
    ],
    availableShops: ['ecommerce', 'vending', 'collect', 'franchise', 'b2b']
  });
});

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log('🚀 Shopify Data Puller Server Started');
  console.log('=====================================');
  console.log(`🌐 Server running on: http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Available Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/shops`);
  console.log(`   GET  http://localhost:${PORT}/test`);
  console.log(`   GET  http://localhost:${PORT}/sales-today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales-yesterday?shop=ecommerce`);
  console.log('');
  console.log('🏪 Available Shops: ecommerce, vending, collect, franchise, b2b');
  console.log('');
  console.log('🔧 Environment Check:');
  const envCheck = validateEnvironment();
  if (envCheck.valid) {
    console.log('   ✅ Environment variables are configured');
  } else {
    console.log('   ❌ Missing environment variables:', envCheck.missing.join(', '));
    console.log('   📝 Please check your .env file');
  }
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
