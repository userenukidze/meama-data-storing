import { getShopConfig } from '../config/shopConfigs.js';

/**
 * Build query parts with source code filtering
 * @param {string} startISO - Start date in ISO format
 * @param {string} endISO - End date in ISO format
 * @param {string} shopType - Type of shop (ecommerce, vending, etc.)
 * @returns {Array} Array of query parts
 */
export function buildQueryParts(startISO, endISO, shopType = "ecommerce") {
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
}

/**
 * Build order query string
 * @param {string} startISO - Start date in ISO format
 * @param {string} endISO - End date in ISO format
 * @param {string} shopType - Type of shop
 * @returns {string} Query string for orders
 */
export function buildOrderQueryString(startISO, endISO, shopType = "ecommerce") {
  const qParts = buildQueryParts(startISO, endISO, shopType);
  return qParts.join(" ");
}
