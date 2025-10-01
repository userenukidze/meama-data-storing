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
app.use('/', salesRoutes);

// Legacy route compatibility (redirects to new structure)
app.get('/sales-today', (req, res) => {
  res.redirect('/general-ecom/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales-yesterday', (req, res) => {
  res.redirect('/general-ecom/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/ecom/today', (req, res) => {
  res.redirect('/ecom/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/ecom/yesterday', (req, res) => {
  res.redirect('/ecom/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/brandstore/today', (req, res) => {
  res.redirect('/brandstores/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/brandstore/yesterday', (req, res) => {
  res.redirect('/brandstores/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

// Additional legacy redirects for old /sales/ format
app.get('/sales/brandstore/today', (req, res) => {
  res.redirect('/brandstores/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales/brandstore/yesterday', (req, res) => {
  res.redirect('/brandstores/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales/ecom/today', (req, res) => {
  res.redirect('/ecom/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales/ecom/yesterday', (req, res) => {
  res.redirect('/ecom/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales/today', (req, res) => {
  res.redirect('/general-ecom/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales/yesterday', (req, res) => {
  res.redirect('/general-ecom/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
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
      'GET /general-ecom/today?shop=ecommerce - All sales from ecommerce shop today',
      'GET /general-ecom/yesterday?shop=ecommerce - All sales from ecommerce shop yesterday',
      'GET /ecom/today?shop=ecommerce - Online orders only today',
      'GET /ecom/yesterday?shop=ecommerce - Online orders only yesterday',
      'GET /brandstores/today?shop=ecommerce - POS orders only today',
      'GET /brandstores/yesterday?shop=ecommerce - POS orders only yesterday',
      'GET /vending/today - All sales from vending store today',
      'GET /vending/yesterday - All sales from vending store yesterday',
      'GET /collect/today - All sales from collect store today',
      'GET /collect/yesterday - All sales from collect store yesterday',
      'GET /franchise/today - All sales from franchise store today',
      'GET /franchise/yesterday - All sales from franchise store yesterday',
      'GET /b2b/today - All sales from b2b store today',
      'GET /b2b/yesterday - All sales from b2b store yesterday'
    ],
    availableShops: ['ecommerce', 'vending', 'collect', 'franchise', 'b2b', 'brandstores']
  });
});

// Start server with error handling
const server = app.listen(PORT, async () => {
  console.log('🚀 Shopify Data Puller Server Started');
  console.log('=====================================');
  console.log(`🌐 Server running on: http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Available Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/shops`);
  console.log(`   GET  http://localhost:${PORT}/test`);
  console.log('');
  console.log('🏪 ECOMMERCE SHOP:');
  console.log(`   GET  http://localhost:${PORT}/general-ecom/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/general-ecom/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/ecom/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/ecom/yesterday?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/brandstores/today?shop=ecommerce`);
  console.log(`   GET  http://localhost:${PORT}/brandstores/yesterday?shop=ecommerce`);
  console.log('');
  console.log('🏪 OTHER STORES:');
  console.log(`   GET  http://localhost:${PORT}/vending/today`);
  console.log(`   GET  http://localhost:${PORT}/vending/yesterday`);
  console.log(`   GET  http://localhost:${PORT}/collect/today`);
  console.log(`   GET  http://localhost:${PORT}/collect/yesterday`);
  console.log(`   GET  http://localhost:${PORT}/franchise/today`);
  console.log(`   GET  http://localhost:${PORT}/franchise/yesterday`);
  console.log(`   GET  http://localhost:${PORT}/b2b/today`);
  console.log(`   GET  http://localhost:${PORT}/b2b/yesterday`);
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
