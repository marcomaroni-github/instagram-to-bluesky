import { pino } from 'pino';
import * as dotenv from 'dotenv';

// Get env varables from .env
dotenv.config();

/**
 * Logger shared across scripts.
 */ 
export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
  level: process.env.LOG_LEVEL ?? 'info',
});