// Example GraphQL queries for Shopify data
// You can use these as templates or modify them for your specific needs

export const QUERIES = {
  // Shop Information
  shopInfo: `
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
        billingAddress {
          address1
          city
          province
          country
          zip
        }
        createdAt
        updatedAt
      }
    }
  `,

  // Products with detailed information
  products: `
    query getProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
        edges {
          node {
            id
            title
            handle
            description
            descriptionHtml
            vendor
            productType
            createdAt
            updatedAt
            publishedAt
            status
            tags
            seo {
              title
              description
            }
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                  width
                  height
                }
              }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  price
                  compareAtPrice
                  sku
                  barcode
                  inventoryQuantity
                  availableForSale
                  weight
                  weightUnit
                  selectedOptions {
                    name
                    value
                  }
                  image {
                    id
                    url
                    altText
                  }
                }
              }
            }
            options {
              id
              name
              values
            }
            metafields(first: 20) {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                  type
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
  `,

  // Orders with detailed information
  orders: `
    query getOrders($first: Int!, $after: String, $query: String) {
      orders(first: $first, after: $after, query: $query) {
        edges {
          node {
            id
            name
            email
            phone
            createdAt
            updatedAt
            processedAt
            cancelledAt
            closedAt
            totalPrice
            subtotalPrice
            totalTax
            totalShippingPrice
            totalDiscounts
            currencyCode
            financialStatus
            fulfillmentStatus
            cancelReason
            note
            tags
            customer {
              id
              email
              firstName
              lastName
              phone
              totalSpent
              ordersCount
            }
            shippingAddress {
              id
              address1
              address2
              city
              province
              country
              zip
              phone
              firstName
              lastName
              company
            }
            billingAddress {
              id
              address1
              address2
              city
              province
              country
              zip
              phone
              firstName
              lastName
              company
            }
            lineItems(first: 100) {
              edges {
                node {
                  id
                  title
                  quantity
                  price
                  originalPrice
                  discountedPrice
                  variant {
                    id
                    title
                    sku
                    barcode
                    image {
                      id
                      url
                      altText
                    }
                    product {
                      id
                      title
                      handle
                    }
                  }
                  customAttributes {
                    key
                    value
                  }
                }
              }
            }
            fulfillments {
              id
              status
              createdAt
              updatedAt
              trackingCompany
              trackingNumbers
              trackingUrls
            }
            refunds {
              id
              createdAt
              note
              totalRefunded
              refundLineItems(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    restockType
                    lineItem {
                      id
                      title
                    }
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
  `,

  // Customers with detailed information
  customers: `
    query getCustomers($first: Int!, $after: String, $query: String) {
      customers(first: $first, after: $after, query: $query) {
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
            acceptsMarketing
            emailMarketingConsent {
              marketingState
              marketingOptInLevel
              consentUpdatedAt
            }
            smsMarketingConsent {
              marketingState
              marketingOptInLevel
              consentUpdatedAt
            }
            defaultAddress {
              id
              address1
              address2
              city
              province
              country
              zip
              phone
              firstName
              lastName
              company
            }
            addresses(first: 10) {
              edges {
                node {
                  id
                  address1
                  address2
                  city
                  province
                  country
                  zip
                  phone
                  firstName
                  lastName
                  company
                }
              }
            }
            orders(first: 10) {
              edges {
                node {
                  id
                  name
                  createdAt
                  totalPrice
                  financialStatus
                  fulfillmentStatus
                }
              }
            }
            metafields(first: 20) {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                  type
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
  `,

  // Collections
  collections: `
    query getCollections($first: Int!, $after: String) {
      collections(first: $first, after: $after) {
        edges {
          node {
            id
            title
            handle
            description
            descriptionHtml
            createdAt
            updatedAt
            publishedAt
            image {
              id
              url
              altText
              width
              height
            }
            seo {
              title
              description
            }
            products(first: 10) {
              edges {
                node {
                  id
                  title
                  handle
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
  `,

  // Inventory levels
  inventoryLevels: `
    query getInventoryLevels($first: Int!, $after: String) {
      inventoryLevels(first: $first, after: $after) {
        edges {
          node {
            id
            available
            item {
              id
              sku
              variant {
                id
                title
                product {
                  id
                  title
                }
              }
            }
            location {
              id
              name
              address {
                address1
                city
                province
                country
                zip
              }
            }
            updatedAt
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
  `,

  // Locations
  locations: `
    query getLocations($first: Int!, $after: String) {
      locations(first: $first, after: $after) {
        edges {
          node {
            id
            name
            address {
              address1
              address2
              city
              province
              country
              zip
              phone
            }
            isActive
            isPrimary
            isFulfillmentService
            isLocalPickupAvailable
            isLocalDeliveryAvailable
            createdAt
            updatedAt
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
  `,

  // Analytics queries (if available)
  analytics: {
    // Note: Analytics queries may require different permissions
    salesByProduct: `
      query getSalesByProduct($first: Int!, $after: String) {
        productVariants(first: $first, after: $after) {
          edges {
            node {
              id
              title
              sku
              product {
                id
                title
              }
              totalInventory
              inventoryQuantity
              availableForSale
            }
          }
        }
      }
    `
  }
};

// Helper function to build custom queries
export function buildCustomQuery(type, fields, filters = {}) {
  const filterString = Object.keys(filters).length > 0 
    ? `, query: "${Object.entries(filters).map(([key, value]) => `${key}:${value}`).join(' AND ')}"`
    : '';
  
  return `
    query get${type}($first: Int!, $after: String) {
      ${type}(first: $first, after: $after${filterString}) {
        edges {
          node {
            ${fields.join('\n            ')}
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
}

export default QUERIES;
