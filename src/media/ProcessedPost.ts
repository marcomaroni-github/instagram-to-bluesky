import { MediaProcessResult } from './MediaProcessResult.js';

export interface ProcessedPost {
  postDate: Date | null;
  postText: string;
  embeddedMedia: MediaProcessResult | MediaProcessResult[];
  mediaCount: number;
}

// Implementation of the ProcessedPost interface
export class ProcessedPostImpl implements ProcessedPost {
  constructor(
    public postDate: Date | null,
    public postText: string,
    public embeddedMedia: MediaProcessResult | MediaProcessResult[],
    public mediaCount: number
  ) {}
}

