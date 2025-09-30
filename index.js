import ShopifyClient from './shopify-client.js';
import fs from 'fs/promises';
import path from 'path';

class DataPuller {
  constructor(shopType = "ecommerce") {
    this.shopType = shopType;
    this.client = new ShopifyClient(shopType);
    this.outputDir = './data';
  }

  async ensureOutputDir() {
    try {
      await fs.access(this.outputDir);
    } catch {
      await fs.mkdir(this.outputDir, { recursive: true });
      console.log(`Created output directory: ${this.outputDir}`);
    }
  }

  async saveToFile(filename, data) {
    const filepath = path.join(this.outputDir, filename);
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`Data saved to: ${filepath}`);
  }

  async pullShopInfo() {
    console.log('Pulling shop information...');
    try {
      const shopData = await this.client.getShopInfo();
      await this.saveToFile('shop-info.json', shopData);
      return shopData;
    } catch (error) {
      console.error('Error pulling shop info:', error.message);
      throw error;
    }
  }

  async pullProducts(limit = 50) {
    console.log(`Pulling products (limit: ${limit})...`);
    try {
      const productsData = await this.client.getProducts(limit);
      await this.saveToFile('products.json', productsData);
      return productsData;
    } catch (error) {
      console.error('Error pulling products:', error.message);
      throw error;
    }
  }

  async pullOrders(limit = 50) {
    console.log(`Pulling orders (limit: ${limit})...`);
    try {
      const ordersData = await this.client.getOrders(limit);
      await this.saveToFile('orders.json', ordersData);
      return ordersData;
    } catch (error) {
      console.error('Error pulling orders:', error.message);
      throw error;
    }
  }

  async pullCustomers(limit = 50) {
    console.log(`Pulling customers (limit: ${limit})...`);
    try {
      const customersData = await this.client.getCustomers(limit);
      await this.saveToFile('customers.json', customersData);
      return customersData;
    } catch (error) {
      console.error('Error pulling customers:', error.message);
      throw error;
    }
  }

  // Pull yesterday's sales data with detailed metrics
  async pullYesterdayData() {
    console.log(`Pulling yesterday's data for ${this.shopType}...`);
    console.log('=====================================');
    
    await this.ensureOutputDir();
    
    try {
      const yesterdayData = await this.client.fetchYesterdayData();
      
      // Save the data
      const filename = `yesterday-${this.shopType}-${yesterdayData.summary.dateRange.from}.json`;
      await this.saveToFile(filename, yesterdayData);
      
      // Display summary
      console.log(`📊 ${this.shopType.toUpperCase()} - Yesterday's Metrics:`);
      console.log(`   Shop: ${yesterdayData.shop}`);
      console.log(`   Date: ${yesterdayData.summary.dateRange.from}`);
      console.log(`   Total Sales: $${yesterdayData.summary.totalSales}`);
      console.log(`   Gross Sales: $${yesterdayData.summary.grossSales}`);
      console.log(`   Gross Profit: $${yesterdayData.summary.grossProfit}`);
      console.log(`   Gross Profit Margin: ${yesterdayData.summary.grossProfitMargin}%`);
      console.log(`   Total Orders: ${yesterdayData.summary.totalOrders}`);
      console.log(`   AOV: $${yesterdayData.summary.averageOrderValue}`);
      console.log(`   COGS: $${yesterdayData.summary.totalCOGS}`);
      console.log(`   Units Sold: ${yesterdayData.summary.totalUnitsSold}`);
      console.log(`   Capsules Sold: ${yesterdayData.summary.totalCapsulesSold}`);
      console.log(`   Total Refunded: $${yesterdayData.summary.totalRefunded}`);
      console.log(`   Total Discounts: $${yesterdayData.summary.totalDiscounts}`);
      console.log(`   Total Tax: $${yesterdayData.summary.totalTax}`);
      console.log(`   Total Shipping: $${yesterdayData.summary.totalShipping}`);
      
      return yesterdayData;
    } catch (error) {
      console.error('Yesterday data pull failed:', error.message);
      throw error;
    }
  }

  async pullAllData(limits = { products: 50, orders: 50, customers: 50 }) {
    console.log(`Starting data pull from ${this.shopType} Shopify store...`);
    console.log('=====================================');
    
    await this.ensureOutputDir();
    
    try {
      // Pull shop info first
      const shopInfo = await this.pullShopInfo();
      console.log(`Shop: ${shopInfo.shop.name} (${shopInfo.shop.domain})`);
      
      // Pull all data types
      const [products, orders, customers] = await Promise.all([
        this.pullProducts(limits.products),
        this.pullOrders(limits.orders),
        this.pullCustomers(limits.customers)
      ]);
      
      console.log('=====================================');
      console.log('Data pull completed successfully!');
      console.log(`Products: ${products.products.edges.length}`);
      console.log(`Orders: ${orders.orders.edges.length}`);
      console.log(`Customers: ${customers.customers.edges.length}`);
      
      return {
        shop: shopInfo,
        products,
        orders,
        customers
      };
    } catch (error) {
      console.error('Data pull failed:', error.message);
      throw error;
    }
  }

  // Method to pull specific data based on user request
  async pullSpecificData(dataType, limit = 50) {
    console.log(`Pulling ${dataType} data...`);
    await this.ensureOutputDir();
    
    switch (dataType.toLowerCase()) {
      case 'shop':
      case 'shopinfo':
        return await this.pullShopInfo();
      
      case 'products':
        return await this.pullProducts(limit);
      
      case 'orders':
        return await this.pullOrders(limit);
      
      case 'customers':
        return await this.pullCustomers(limit);
      
      case 'yesterday':
      case 'yesterdaydata':
        return await this.pullYesterdayData();
      
      default:
        throw new Error(`Unknown data type: ${dataType}. Available types: shop, products, orders, customers, yesterday`);
    }
  }
}

// Helper function to pull data for all available shops
async function pullAllShopsData(dataType = "yesterday", limit = 50) {
  const availableShops = ShopifyClient.getAvailableShops();
  console.log("Available shops:", availableShops);
  ShopifyClient.logShopConfigurations();
  
  const results = {};
  
  for (const shopType of availableShops) {
    try {
      console.log(`\n🔄 Processing ${shopType}...`);
      const dataPuller = new DataPuller(shopType);
      
      if (dataType === "yesterday" || dataType === "yesterdaydata") {
        results[shopType] = await dataPuller.pullYesterdayData();
      } else {
        results[shopType] = await dataPuller.pullSpecificData(dataType, limit);
      }
    } catch (error) {
      console.error(`❌ Error processing ${shopType}:`, error.message);
      results[shopType] = { error: error.message };
    }
  }
  
  // Save combined results
  const combinedFilename = `all-shops-${dataType}-${new Date().toISOString().split('T')[0]}.json`;
  await fs.writeFile(
    path.join('./data', combinedFilename), 
    JSON.stringify(results, null, 2)
  );
  console.log(`\n📁 Combined results saved to: ./data/${combinedFilename}`);
  
  return results;
}

// Main execution
async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  const shopType = args[0];
  const dataType = args[1];
  const limit = parseInt(args[2]) || 50;
  
  try {
    if (shopType === "all" || shopType === "all-shops") {
      // Pull data for all shops
      await pullAllShopsData(dataType || "yesterday", limit);
    } else if (shopType) {
      // Pull data for specific shop
      const dataPuller = new DataPuller(shopType);
      
      if (dataType) {
        // Pull specific data type
        await dataPuller.pullSpecificData(dataType, limit);
      } else {
        // Pull yesterday's data by default
        await dataPuller.pullYesterdayData();
      }
    } else {
      // Show help
      console.log(`
🚀 Shopify Data Puller

Usage:
  node index.js [shop-type] [data-type] [limit]

Shop Types:
  ecommerce, vending, collect, franchise, b2b, brandstores, all

Data Types:
  yesterday, products, orders, customers, shop

Examples:
  node index.js ecommerce yesterday                    # Yesterday's metrics for ecommerce
  node index.js all yesterday                          # Yesterday's metrics for all shops
  node index.js vending products 100                   # 100 products from vending store
  node index.js collect orders 50                      # 50 orders from collect store

Available shops: ${ShopifyClient.getAvailableShops().join(', ')}
      `);
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

export default DataPuller;
