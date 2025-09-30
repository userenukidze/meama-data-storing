# Project Structure Documentation

This document explains the reorganized structure of the Shopify Data Storing project.

## 📁 Directory Structure

```
meama-data-storing/
├── src/                          # Main source code directory
│   ├── app.js                    # Express app configuration and middleware
│   ├── server.js                 # Server startup and error handling
│   ├── config/                   # Configuration files
│   │   ├── environment.js        # Environment validation and config
│   │   └── shopConfigs.js        # Shopify shop configurations
│   ├── routes/                   # API route handlers
│   │   ├── health.js             # Health check endpoints
│   │   ├── shops.js              # Shop management endpoints
│   │   ├── test.js               # Test/validation endpoints
│   │   └── sales.js              # Sales data endpoints
│   ├── services/                 # Business logic services
│   │   └── shopifyClient.js      # Shopify API client
│   ├── utils/                    # Utility functions
│   │   ├── dateUtils.js          # Date handling utilities
│   │   ├── metricsCalculator.js  # Metrics calculation functions
│   │   ├── queries.js            # GraphQL query templates
│   │   └── queryBuilder.js       # Query building utilities
│   ├── controllers/              # Route controllers (empty for now)
│   └── middleware/               # Custom middleware (empty for now)
├── data/                         # Data output directory
├── index.js                      # CLI data puller (legacy)
├── get-metrics.js                # Metrics CLI tool
├── server.js                     # Legacy server file (redirects to src/server.js)
├── package.json                  # Dependencies and scripts
└── README.md                     # Project documentation
```

## 🚀 How to Run

### Development Server
```bash
npm run server:dev
```

### Production Server
```bash
npm run server
```

### CLI Data Puller
```bash
npm start [shop-type] [data-type] [limit]
```

### Metrics Tool
```bash
npm run metrics [shop-type]
npm run metrics:all
```

## 📋 API Endpoints

### Health & Status
- `GET /health` - Health check and environment status
- `GET /shops` - List available shops and configurations
- `GET /test` - Test environment configuration

### Sales Data
- `GET /sales/today?shop=ecommerce` - Today's sales metrics
- `GET /sales/yesterday?shop=ecommerce` - Yesterday's sales metrics

### Legacy Compatibility
- `GET /sales-today?shop=ecommerce` - Redirects to `/sales/today`
- `GET /sales-yesterday?shop=ecommerce` - Redirects to `/sales/yesterday`

## 🏗️ Architecture

### Configuration Layer (`src/config/`)
- **environment.js**: Environment validation and configuration
- **shopConfigs.js**: Shopify shop configurations and helpers

### Service Layer (`src/services/`)
- **shopifyClient.js**: Shopify GraphQL API client with all business logic

### Route Layer (`src/routes/`)
- **health.js**: Health check and status endpoints
- **shops.js**: Shop management endpoints
- **test.js**: Testing and validation endpoints
- **sales.js**: Sales data endpoints with detailed metrics

### Utility Layer (`src/utils/`)
- **dateUtils.js**: Date range calculations and formatting
- **metricsCalculator.js**: Sales metrics calculations
- **queries.js**: GraphQL query templates
- **queryBuilder.js**: Dynamic query building

### Application Layer (`src/`)
- **app.js**: Express app setup, middleware, and route mounting
- **server.js**: Server startup, error handling, and port management

## 🔧 Key Features

1. **Modular Structure**: Clean separation of concerns
2. **Route Organization**: Logical grouping of related endpoints
3. **Service Layer**: Centralized business logic
4. **Utility Functions**: Reusable helper functions
5. **Configuration Management**: Centralized config handling
6. **Error Handling**: Comprehensive error management
7. **Legacy Compatibility**: Backward compatibility with old endpoints

## 📊 Available Shops

- `ecommerce` - Main ecommerce store
- `vending` - Vending machine store
- `collect` - Collection store
- `franchise` - Franchise store
- `b2b` - B2B store
- `brandstores` - Brand stores (Point of Sale)

## 🛠️ Development

The project uses ES6 modules and requires Node.js 14+ with the `--experimental-modules` flag or Node.js 16+ for native ES module support.

All imports have been updated to use the new structure, and the code maintains the same functionality while being much more organized and maintainable.
