import fetch from 'node-fetch';
import { getShopConfig, getAvailableShops, logShopConfigurations } from '../config/shopConfigs.js';
import { config } from '../config/environment.js';
import { buildQueryParts } from '../utils/queryBuilder.js';
import { calculateDetailedMetrics } from '../utils/metricsCalculator.js';

class ShopifyClient {
  constructor(shopType = "ecommerce") {
    this.shopType = shopType;
    this.shopConfig = getShopConfig(shopType);
    this.apiVersion = config.apiVersion;
    
    if (!this.shopConfig.shop || !this.shopConfig.accessToken) {
      throw new Error(`Missing required environment variables for shop type: ${shopType}`);
    }
    
    this.baseUrl = `https://${this.shopConfig.shop}/admin/api/${this.apiVersion}/graphql.json`;
  }

  // Helper function to build query parts with source code filtering
  buildQueryParts(startISO, endISO, shopType = "ecommerce") {
    return buildQueryParts(startISO, endISO, shopType);
  }

  async query(query, variables = {}) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.shopConfig.accessToken,
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`);
      }

      return data.data;
    } catch (error) {
      console.error('Error executing GraphQL query:', error);
      throw error;
    }
  }

  // Helper method to get shop information
  async getShopInfo() {
    const query = `
      query {
        shop {
          id
          name
          email
          domain
          currencyCode
          timezone
          plan {
            displayName
          }
        }
      }
    `;
    
    return await this.query(query);
  }

  // Helper method to get products
  async getProducts(first = 10, after = null) {
    const query = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              description
              vendor
              productType
              createdAt
              updatedAt
              status
              tags
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    compareAtPrice
                    sku
                    inventoryQuantity
                    availableForSale
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;
    
    return await this.query(query, { first, after });
  }

  // Helper method to get orders
  async getOrders(first = 10, after = null) {
    const query = `
      query getOrders($first: Int!, $after: String) {
        orders(first: $first, after: $after) {
          edges {
            node {
              id
              name
              email
              createdAt
              updatedAt
              processedAt
              totalPrice
              subtotalPrice
              totalTax
              currencyCode
              financialStatus
              fulfillmentStatus
              customer {
                id
                email
                firstName
                lastName
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    price
                    variant {
                      id
                      title
                      sku
                    }
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;
    
    return await this.query(query, { first, after });
  }

  // Helper method to get customers
  async getCustomers(first = 10, after = null) {
    const query = `
      query getCustomers($first: Int!, $after: String) {
        customers(first: $first, after: $after) {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              createdAt
              updatedAt
              totalSpent
              ordersCount
              tags
              defaultAddress {
                id
                address1
                address2
                city
                province
                country
                zip
                phone
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;
    
    return await this.query(query, { first, after });
  }

  // Fetch yesterday's data for a specific shop with detailed metrics
  async fetchYesterdayData(requestId = "unknown") {
    // Set date range to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endDate = new Date(yesterday);
    endDate.setHours(23, 59, 59, 999);

    const startISO = yesterday.toISOString();
    const endISO = endDate.toISOString();

    const qParts = this.buildQueryParts(startISO, endISO, this.shopType);
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
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Fetch all orders with pagination
    let cursor = null;
    let allOrders = [];
    let iterations = 0;
    const maxIterations = 100;

    do {
      iterations++;
      if (iterations > maxIterations) {
        console.warn(`[${requestId}] Maximum iterations reached for ${this.shopType}`);
        break;
      }

      const response = await this.query(GQL, { cursor, q: orderQueryString });
      const orders = response.orders.nodes;
      allOrders = allOrders.concat(orders);

      cursor = response.orders.pageInfo.hasNextPage
        ? response.orders.pageInfo.endCursor
        : null;
    } while (cursor);

    // Calculate detailed metrics
    const metrics = this.calculateDetailedMetrics(allOrders, startISO, endISO);
    
    return {
      shopType: this.shopType,
      shop: this.shopConfig.shop,
      ...metrics
    };
  }

  // Calculate detailed metrics from orders
  calculateDetailedMetrics(orders, startISO, endISO) {
    return calculateDetailedMetrics(orders, startISO, endISO);
  }

  // Get available shop types
  static getAvailableShops() {
    return getAvailableShops();
  }

  // Debug: Log shop configurations
  static logShopConfigurations() {
    return logShopConfigurations();
  }
}

export default ShopifyClient;
