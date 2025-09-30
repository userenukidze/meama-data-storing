#!/usr/bin/env node

import ShopifyClient from './shopify-client.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Get the specific metrics you requested:
 * - total sales
 * - gross sales  
 * - gross profit
 * - orders
 * - aov
 * - cogs
 * - units sold
 * - capsules sold
 */

async function getMetrics(shopType = "ecommerce") {
  console.log(`🔍 Getting metrics for ${shopType}...`);
  
  try {
    const client = new ShopifyClient(shopType);
    const data = await client.fetchYesterdayData();
    
    const metrics = data.summary;
    
    console.log('\n📊 METRICS SUMMARY');
    console.log('==================');
    console.log(`Shop: ${data.shop}`);
    console.log(`Date: ${metrics.dateRange.from}`);
    console.log('');
    console.log('💰 FINANCIAL METRICS');
    console.log(`Total Sales: $${metrics.totalSales}`);
    console.log(`Gross Sales: $${metrics.grossSales}`);
    console.log(`Gross Profit: $${metrics.grossProfit}`);
    console.log(`Gross Profit Margin: ${metrics.grossProfitMargin}%`);
    console.log(`COGS: $${metrics.totalCOGS}`);
    console.log('');
    console.log('📈 ORDER METRICS');
    console.log(`Orders: ${metrics.totalOrders}`);
    console.log(`AOV: $${metrics.averageOrderValue}`);
    console.log('');
    console.log('📦 PRODUCT METRICS');
    console.log(`Units Sold: ${metrics.totalUnitsSold}`);
    console.log(`Capsules Sold: ${metrics.totalCapsulesSold}`);
    console.log('');
    console.log('💸 OTHER METRICS');
    console.log(`Total Refunded: $${metrics.totalRefunded}`);
    console.log(`Total Discounts: $${metrics.totalDiscounts}`);
    console.log(`Total Tax: $${metrics.totalTax}`);
    console.log(`Total Shipping: $${metrics.totalShipping}`);
    
    // Save to file
    const filename = `metrics-${shopType}-${metrics.dateRange.from}.json`;
    await fs.writeFile(
      path.join('./data', filename),
      JSON.stringify({
        shopType,
        shop: data.shop,
        date: metrics.dateRange.from,
        metrics: {
          totalSales: metrics.totalSales,
          grossSales: metrics.grossSales,
          grossProfit: metrics.grossProfit,
          grossProfitMargin: metrics.grossProfitMargin,
          orders: metrics.totalOrders,
          aov: metrics.averageOrderValue,
          cogs: metrics.totalCOGS,
          unitsSold: metrics.totalUnitsSold,
          capsulesSold: metrics.totalCapsulesSold,
          totalRefunded: metrics.totalRefunded,
          totalDiscounts: metrics.totalDiscounts,
          totalTax: metrics.totalTax,
          totalShipping: metrics.totalShipping
        }
      }, null, 2)
    );
    
    console.log(`\n💾 Metrics saved to: ./data/${filename}`);
    
    return metrics;
    
  } catch (error) {
    console.error(`❌ Error getting metrics for ${shopType}:`, error.message);
    throw error;
  }
}

async function getAllShopsMetrics() {
  const availableShops = ShopifyClient.getAvailableShops();
  console.log('🏪 Getting metrics for all shops...');
  console.log('Available shops:', availableShops);
  
  const allMetrics = {};
  
  for (const shopType of availableShops) {
    try {
      console.log(`\n🔄 Processing ${shopType}...`);
      allMetrics[shopType] = await getMetrics(shopType);
    } catch (error) {
      console.error(`❌ Error processing ${shopType}:`, error.message);
      allMetrics[shopType] = { error: error.message };
    }
  }
  
  // Save combined metrics
  const combinedFilename = `all-metrics-${new Date().toISOString().split('T')[0]}.json`;
  await fs.writeFile(
    path.join('./data', combinedFilename),
    JSON.stringify(allMetrics, null, 2)
  );
  
  console.log(`\n📁 All metrics saved to: ./data/${combinedFilename}`);
  
  return allMetrics;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const shopType = args[0] || "ecommerce";
  
  try {
    if (shopType === "all") {
      await getAllShopsMetrics();
    } else {
      await getMetrics(shopType);
    }
  } catch (error) {
    console.error('Execution failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getMetrics, getAllShopsMetrics };
