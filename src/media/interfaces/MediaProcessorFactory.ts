import { ProcessStrategy } from './ProcessStrategy';
import { MediaProcessResult } from '../MediaProcessResult';
import { Media } from '../InstagramExportedPost';

export interface MediaProcessorFactory {
  createProcessor(media: Media | Media[], archiveFolder: string): ProcessStrategy<MediaProcessResult[]>;
  
  /**
   * returns if any of the media is a video.
   * @param media 
   */
  hasVideo(media: Media[]): boolean;
} 