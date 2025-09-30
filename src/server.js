import app from './app.js';
import { config } from './config/environment.js';
import { validateEnvironment } from './config/environment.js';
import { getAvailableShops } from './config/shopConfigs.js';

const PORT = config.port;

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
  console.log('');
  console.log('🏪 Available Shops:', getAvailableShops().join(', '));
  console.log('');
  console.log('🔧 Environment Check:');
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

export default server;
