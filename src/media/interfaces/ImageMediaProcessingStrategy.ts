import { MIMEType } from './MIMEType';
import { ProcessStrategy } from './ProcessStrategy';
import { MediaProcessResult } from '../MediaProcessResult';

/**
 * Processes many images in a post into a normalized MediaProcessResult[].
 */
export interface ImageMediaProcessingStrategy extends ProcessStrategy<MediaProcessResult[]>, MIMEType {} 