import { MediaProcessResult } from "./MediaProcessResult";

/**
 * Normalized post structure.
 */
export interface ProcessedPost {
  postDate: Date | null;
  postText: string;
  embeddedMedia: MediaProcessResult[];
  mediaCount: number;
}

/**
 * Processed post with media count based on embedded media.
 */

export class ProcessedPostImpl implements ProcessedPost {
  public embeddedMedia: MediaProcessResult[] = [];
  get mediaCount(): number {
    return this.embeddedMedia.length;
  };
  constructor(
    public postDate: Date | null,
    public postText: string
  ) {}
}
