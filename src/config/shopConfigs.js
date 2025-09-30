// Shop configurations for different Shopify stores
export const SHOP_CONFIGS = {
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
export const getShopConfig = (shopType = "ecommerce") => {
  return SHOP_CONFIGS[shopType] || SHOP_CONFIGS.ecommerce;
};

// Get available shop types
export const getAvailableShops = () => {
  return Object.keys(SHOP_CONFIGS);
};

// Debug: Log shop configurations
export const logShopConfigurations = () => {
  console.log("\n🔧 SHOP CONFIGURATIONS:");
  Object.entries(SHOP_CONFIGS).forEach(([shopName, config]) => {
    console.log(`  ${shopName}:`);
    console.log(`    shop: ${config.shop || 'UNDEFINED'}`);
    console.log(`    accessToken: ${config.accessToken ? 'SET' : 'NOT SET'}`);
    if (config.channel) {
      console.log(`    channel: ${config.channel}`);
    }
  });
};
