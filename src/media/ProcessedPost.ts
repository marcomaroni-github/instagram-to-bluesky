import { MediaProcessResult } from './MediaProcessResult.js';

export interface ProcessedPost {
  postDate: Date | null;
  postText: string;
  embeddedMedia: MediaProcessResult | MediaProcessResult[];
  mediaCount: number;
} 