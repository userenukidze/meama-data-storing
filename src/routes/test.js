import express from 'express';
import { validateEnvironment } from '../config/environment.js';
import { getShopConfig } from '../config/shopConfigs.js';
import ShopifyClient from '../services/shopifyClient.js';

const router = express.Router();

// Test endpoint to check environment
router.get('/', async (req, res) => {
  try {
    const envCheck = validateEnvironment();
    
    if (!envCheck.valid) {
      return res.status(400).json({
        success: false,
        error: envCheck.message,
        environment: {
          valid: false,
          missing: envCheck.missing
        }
      });
    }
    
    // Try to get shop info
    const shopConfig = getShopConfig('ecommerce');
    const client = new ShopifyClient('ecommerce');
    const shopInfo = await client.getShopInfo();
    
    res.json({
      success: true,
      message: 'Environment is properly configured',
      shopInfo,
      environment: {
        valid: true,
        shop: shopConfig.shop,
        hasToken: !!shopConfig.accessToken
      }
    });
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      environment: {
        valid: false,
        message: 'Environment check failed'
      }
    });
  }
});

export default router;
