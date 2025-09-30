import express from 'express';
import { validateEnvironment } from '../config/environment.js';
import { getAvailableShops } from '../config/shopConfigs.js';

const router = express.Router();

// Health check endpoint
router.get('/', (req, res) => {
  const envCheck = validateEnvironment();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      valid: envCheck.valid,
      missing: envCheck.missing || [],
      availableShops: getAvailableShops()
    }
  });
});

export default router;
