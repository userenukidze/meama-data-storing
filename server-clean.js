import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
import healthRoutes from './src/routes/health.js';
import shopsRoutes from './src/routes/shops.js';
import testRoutes from './src/routes/test.js';
import salesRoutes from './src/routes/sales.js';

// Routes
app.use('/health', healthRoutes);
app.use('/shops', shopsRoutes);
app.use('/test', testRoutes);
app.use('/sales', salesRoutes);

// Legacy route compatibility (redirects to new structure)
app.get('/sales-today', (req, res) => {
  res.redirect('/sales/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales-yesterday', (req, res) => {
  res.redirect('/sales/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/ecom/today', (req, res) => {
  res.redirect('/sales/ecom/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/ecom/yesterday', (req, res) => {
  res.redirect('/sales/ecom/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/brandstore/today', (req, res) => {
  res.redirect('/sales/brandstore/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/brandstore/yesterday', (req, res) => {
  res.redirect('/sales/brandstore/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales-by-source', (req, res) => {
  res.redirect('/sales/by-source' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
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
      'GET /sales/today?shop=ecommerce - Get today\'s sales for specific shop',
      'GET /sales/yesterday?shop=ecommerce - Get yesterday\'s sales for specific shop',
      'GET /sales/ecom/today?shop=ecommerce - Get ecom sales for today',
      'GET /sales/ecom/yesterday?shop=ecommerce - Get ecom sales for yesterday',
      'GET /sales/brandstore/today?shop=ecommerce - Get brand store sales for today',
      'GET /sales/brandstore/yesterday?shop=ecommerce - Get brand store sales for yesterday',
      'GET /sales/by-source?shop=ecommerce - Get sales separated by POS and online store',
      'GET /sales-today?shop=ecommerce - Legacy endpoint (redirects to /sales/today)',
      'GET /sales-yesterday?shop=ecommerce - Legacy endpoint (redirects to /sales/yesterday)',
      'GET /ecom/today?shop=ecommerce - Legacy endpoint (redirects to /sales/ecom/today)',
      'GET /ecom/yesterday?shop=ecommerce - Legacy endpoint (redirects to /sales/ecom/yesterday)',
      'GET /brandstore/today?shop=ecommerce - Legacy endpoint (redirects to /sales/brandstore/today)',
      'GET /brandstore/yesterday?shop=ecommerce - Legacy endpoint (redirects to /sales/brandstore/yesterday)',
      'GET /sales-by-source?shop=ecommerce - Legacy endpoint (redirects to /sales/by-source)'
    ],
    availableShops: ['ecommerce', 'vending', 'collect', 'franchise', 'b2b', 'brandstores']
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
  console.log(`   GET  http://localhost:${PORT}/sales/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/ecom/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/ecom/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/brandstore/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/brandstore/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales/by-source?shop=ecommerce`);
  console.log('');
  console.log('🔄 Legacy Endpoints (with redirects):');
  console.log(`   GET  http://localhost:${PORT}/sales-today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales-yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/ecom/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/ecom/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/brandstore/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/brandstore/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/sales-by-source?shop=ecommerce`);
  console.log('');
  console.log('🏪 Available Shops: ecommerce, vending, collect, franchise, b2b, brandstores');
  console.log('');
  console.log('🔧 Environment Check:');
  const { validateEnvironment } = await import('./src/config/environment.js');
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
