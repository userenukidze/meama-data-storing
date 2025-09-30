import express from 'express';
import { SHOP_CONFIGS } from '../config/shopConfigs.js';

const router = express.Router();

// Get available shops
router.get('/', (req, res) => {
  try {
    const shopConfigs = {};
    
    Object.keys(SHOP_CONFIGS).forEach(shopType => {
      const config = SHOP_CONFIGS[shopType];
      shopConfigs[shopType] = {
        shop: config.shop || 'UNDEFINED',
        hasToken: !!config.accessToken,
        status: config.shop && config.accessToken ? 'configured' : 'not_configured',
        channel: config.channel || null
      };
    });
    
    res.json({
      availableShops: Object.keys(SHOP_CONFIGS),
      configurations: shopConfigs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
