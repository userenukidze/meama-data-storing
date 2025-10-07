/**
 * Calculate detailed metrics from orders
 * @param {Array} orders - Array of order objects
 * @param {string} startISO - Start date in ISO format
 * @param {string} endISO - End date in ISO format
 * @returns {Object} Calculated metrics
 */
export function calculateDetailedMetrics(orders, startISO, endISO) {
  let totalSales = 0;
  let totalRefunded = 0;
  let totalDiscounts = 0;
  let totalTax = 0;
  let totalShipping = 0;
  let totalUnitsSold = 0;
  let totalOrders = orders.length;

  orders.forEach(order => {
    // Total Sales (current total price)
    const currentTotal = parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || "0");
    totalSales += currentTotal;

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

      // Process line items for units
      if (order.lineItems?.nodes) {
        order.lineItems.nodes.forEach(item => {
          const quantity = item.quantity || 0;
          
          // Units sold
          totalUnitsSold += quantity;
        });
      }
  });

  // Calculate derived metrics
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  
  // Calculate capsules sold using SKU lookup from Capsules.json
  const capsuleData = calculateCapsulesSold(orders);

  return {
    summary: {
      totalSales: Math.round(totalSales * 100) / 100,
      totalRefunded: Math.round(totalRefunded * 100) / 100,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalShipping: Math.round(totalShipping * 100) / 100,
      totalOrders,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      totalUnitsSold,
      totalCapsulesSold: capsuleData.totalCapsules,
      totalMulticapsulesSold: capsuleData.totalMulticapsules,
      totalEuropeanCapsulesSold: capsuleData.totalEuropeanCapsules,
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
      },
    },
    orders: orders // Include raw orders for detailed analysis if needed
  };
}

/**
 * Load capsule SKU data from JSON file
 * @returns {Array} Array of capsule SKU objects
 */
function loadCapsuleSKUs() {
  try {
    const fs = require('fs');
    const path = require('path');
    const capsuleDataPath = path.join(__dirname, '../data/Capsules.json');
    const capsuleData = fs.readFileSync(capsuleDataPath, 'utf8');
    return JSON.parse(capsuleData);
  } catch (error) {
    console.error('Error loading capsule SKU data:', error);
    return [];
  }
}

/**
 * Calculate capsules sold based on SKU lookup from Capsules.json
 * @param {string} sku - Product SKU to look up
 * @returns {Object} Object with capsule count and category
 */
function calculateCapsulesFromSKU(sku) {
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
}

/**
 * Calculate total capsules sold from orders using SKU lookup
 * @param {Array} orders - Array of order objects
 * @returns {Object} Object with total capsules, multicapsules, and european capsules
 */
export function calculateCapsulesSold(orders) {
  let totalCapsulesSold = 0;
  let totalMulticapsulesSold = 0;
  let totalEuropeanCapsulesSold = 0;
  
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
        }
      });
    }
  });
  
  return {
    totalCapsules: totalCapsulesSold,
    totalMulticapsules: totalMulticapsulesSold,
    totalEuropeanCapsules: totalEuropeanCapsulesSold
  };
}

/**
 * Calculate product analysis from orders
 * @param {Array} orders - Array of order objects
 * @returns {Object} Product analysis data
 */
export function calculateProductAnalysis(orders) {
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
}
