import dotenv from 'dotenv';

dotenv.config();

// Environment validation
export function validateEnvironment() {
  const requiredVars = [
    'SHOPIFY_SHOP',
    'SHOPIFY_ACCESS_TOKEN'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      message: `Missing required environment variables: ${missing.join(', ')}`
    };
  }
  
  return { valid: true };
}

// Environment configuration
export const config = {
  port: process.env.PORT || 3001,
  apiVersion: process.env.SHOPIFY_API_VERSION || '2023-10',
  nodeEnv: process.env.NODE_ENV || 'development',
};
