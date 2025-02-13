import { ProcessStrategy } from './ProcessStrategy';
import { ProcessedPost } from '../ProcessedPost';

/**
 * Processes instagram posts with media to embed.
 */
export interface InstagramPostProcessingStrategy extends ProcessStrategy<ProcessedPost[]> {
  /**
   * Processes instagram post and media data into a format easily mapped to Blueskys requirements.
   */
  process(): Promise<ProcessedPost[]>;
} 