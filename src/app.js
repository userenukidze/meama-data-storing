import express from 'express';
import cors from 'cors';
import { config } from './config/environment.js';
import { getAvailableShops } from './config/shopConfigs.js';

// Import routes
import healthRoutes from './routes/health.js';
import shopsRoutes from './routes/shops.js';
import testRoutes from './routes/test.js';
import salesRoutes from './routes/sales.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/shops', shopsRoutes);
app.use('/test', testRoutes);
app.use('/sales', salesRoutes);

// Legacy route compatibility
app.get('/sales-today', (req, res) => {
  res.redirect('/sales/today' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
});

app.get('/sales-yesterday', (req, res) => {
  res.redirect('/sales/yesterday' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''));
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
      'GET /sales-today?shop=ecommerce - Legacy endpoint (redirects to /sales/today)',
      'GET /sales-yesterday?shop=ecommerce - Legacy endpoint (redirects to /sales/yesterday)'
    ],
    availableShops: getAvailableShops()
  });
});

export default app;
