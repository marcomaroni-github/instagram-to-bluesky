import { MIMEType } from './MIMEType';
import { ProcessStrategy } from './ProcessStrategy';
import { MediaProcessResult } from '../MediaProcessResult';

/**
 * Processes single video post media into a normalized MediaProcessResult.
 */
export interface VideoMediaProcessingStrategy extends ProcessStrategy<MediaProcessResult[]>, MIMEType {} 