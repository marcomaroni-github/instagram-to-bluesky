import { ProcessStrategy } from './ProcessStrategy';
import { MIMEType } from './MIMEType';
import { MediaProcessResult } from '../MediaProcessResult';

/**
 * Processes single video post media into a normalized MediaProcessResult.
 */
export interface VideoMediaProcessingStrategy extends ProcessStrategy<MediaProcessResult[]>, MIMEType {} 