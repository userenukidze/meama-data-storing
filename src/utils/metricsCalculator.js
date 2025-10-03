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
  let totalCapsulesSold = 0;
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
  
  // Calculate capsules sold using the new naming convention logic
  totalCapsulesSold = calculateCapsulesSold(orders);

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
      totalCapsulesSold,
      dateRange: {
        from: startISO.substring(0, 10),
        to: endISO.substring(0, 10),
      },
    },
    orders: orders // Include raw orders for detailed analysis if needed
  };
}

/**
 * Calculate capsules sold based on product naming conventions
 * @param {string} productTitle - Product title to analyze
 * @param {string} variantTitle - Variant title to analyze
 * @returns {number} Number of capsules for this product
 */
function calculateCapsulesFromNaming(productTitle, variantTitle, sku = "") {
  // Combine product title, variant title, and SKU for analysis
  const fullTitle = `${productTitle || ""} ${variantTitle || ""} ${sku || ""}`.trim().toLowerCase();
  
  // Check if this is a capsule product based on naming prefixes
  const capsulePrefixes = ['cap', 'tea', 'mix', 'e37', 'm51', 'espressobox', 'multibox'];
  const isCapsuleProduct = capsulePrefixes.some(prefix => 
    fullTitle.startsWith(prefix) || 
    fullTitle.includes(`-${prefix}`) ||
    fullTitle.includes(`${prefix}-`)
  );
  
  if (!isCapsuleProduct) {
    return 0;
  }
  
  // Special cases with exact naming patterns
  const specialCases = {
    'e37 - espressobox': 12,
    'm51 - multibox': 12,
    'espressobox': 12,
    'multibox': 12,
    'e37': 12,
    'm51': 12,
    'cap51-energy booster': 1,
    'cap51-electrolytes': 1,
    'cap51-14r': 1,
    'cap37-10cr': 10,
    'cap51-15c': 12,
    'cap51-12cr': 12,
    'cap51-1226': 12,
    'cap51-1225': 12,
    'cap51-1215': 12,
    'cap51-1214gr': 12,
    'cap51-25': 1,
    'cap51-15': 1,
    'cap36-1015': 10,
    'tea51-15': 1,
    'tea51-1215': 12,
    'mix-1201': 12,
    'mix-01': 1,
    'mix-02-1212': 12
  };
  
  // Check for exact matches first
  for (const [pattern, capsules] of Object.entries(specialCases)) {
    if (fullTitle.includes(pattern)) {
      return capsules;
    }
  }
  
  // Pattern matching for 4-digit codes after dash
  const fourDigitMatch = fullTitle.match(/-(\d{4})/);
  if (fourDigitMatch) {
    const fourDigitCode = fourDigitMatch[1];
    const firstTwoDigits = parseInt(fourDigitCode.substring(0, 2));
    
    // Handle special cases for 4-digit codes
    if (fourDigitCode === '1015') return 10; // cap36-1015 exception
    if (fourDigitCode === '1215') return 12; // tea51-1215
    if (fourDigitCode === '1225') return 12; // cap51-1225
    if (fourDigitCode === '1226') return 12; // cap51-1226
    if (fourDigitCode === '1214') return 12; // cap51-1214gr
    
    // Default rule: first two digits = capsule count
    return firstTwoDigits;
  }
  
  // Pattern matching for 2-digit codes after dash
  const twoDigitMatch = fullTitle.match(/-(\d{2})/);
  if (twoDigitMatch) {
    const twoDigitCode = twoDigitMatch[1];
    
    // Handle special cases for 2-digit codes
    if (twoDigitCode === '15') return 1; // cap51-15, tea51-15
    if (twoDigitCode === '25') return 1; // cap51-25
    if (twoDigitCode === '14') return 1; // cap51-14r
    
    // Default rule: 2-digit code = capsule count
    return parseInt(twoDigitCode);
  }
  
  // Single digit after dash
  const singleDigitMatch = fullTitle.match(/-(\d{1})/);
  if (singleDigitMatch) {
    return parseInt(singleDigitMatch[1]);
  }
  
  // If no numeric pattern found, check for specific keywords
  if (fullTitle.includes('box') || fullTitle.includes('multibox') || fullTitle.includes('espressobox')) {
    return 12;
  }
  
  // Default: 1 capsule if it matches capsule prefixes but no clear pattern
  return 1;
}

/**
 * Calculate total capsules sold from orders using naming conventions
 * @param {Array} orders - Array of order objects
 * @returns {number} Total capsules sold
 */
export function calculateCapsulesSold(orders) {
  let totalCapsulesSold = 0;
  
  orders.forEach(order => {
    if (order.lineItems?.nodes) {
      order.lineItems.nodes.forEach(item => {
        const productTitle = item.variant?.product?.title || item.title || "";
        const variantTitle = item.variantTitle || item.variant?.title || "";
        const sku = item.variant?.sku || "";
        const quantity = item.quantity || 0;
        
        // Calculate capsules per unit based on naming (check title, variant title, and SKU)
        const capsulesPerUnit = calculateCapsulesFromNaming(productTitle, variantTitle, sku);
        
        // Total capsules = quantity ordered × capsules per unit
        totalCapsulesSold += quantity * capsulesPerUnit;
      });
    }
  });
  
  return totalCapsulesSold;
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
