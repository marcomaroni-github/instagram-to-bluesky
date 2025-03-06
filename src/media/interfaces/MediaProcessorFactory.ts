import { ProcessStrategy } from './ProcessStrategy';
import { Media, ImageMedia, VideoMedia } from '../InstagramExportedPost';
import { MediaProcessResult } from '../MediaProcessResult';

export interface MediaProcessorFactory {
  createProcessor(media: ImageMedia[] | VideoMedia[], archiveFolder: string): ProcessStrategy<MediaProcessResult[]>;
  
  /**
   * returns if any of the media is a video.
   * @param media 
   */
  hasVideo(media: Media[]): boolean;
} 