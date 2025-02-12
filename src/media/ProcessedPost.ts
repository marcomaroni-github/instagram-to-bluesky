import { MediaProcessResult } from "./MediaProcessResult.js";

export interface ProcessedPost {
  postDate: Date | null;
  postText: string;
  embeddedMedia: MediaProcessResult | MediaProcessResult[] | undefined;
  mediaCount: number;
}

// Implementation of the ProcessedPost interface
export class ProcessedPostImpl implements ProcessedPost {
  public mediaCount: number = 0;
  public embeddedMedia: MediaProcessResult | MediaProcessResult[] | undefined;
  constructor(
    public postDate: Date | null,
    public postText: string
  ) {}
}
