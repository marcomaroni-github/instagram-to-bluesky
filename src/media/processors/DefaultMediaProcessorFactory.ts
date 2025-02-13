import { MediaProcessorFactory } from "../interfaces/MediaProcessorFactory";
import { ProcessStrategy } from "../interfaces/ProcessStrategy";
import { Media, VideoMedia } from "../InstagramExportedPost";
import { MediaProcessResult } from "../MediaProcessResult";
import { InstagramImageProcessor } from "./InstagramImageProcessor";
import { InstagramVideoProcessor } from "./InstagramVideoProcessor";
import { getVideoMimeType } from "../../video/video";

/**
 * Processor factory that handles images and video.
 */
export class DefaultMediaProcessorFactory implements MediaProcessorFactory {
  createProcessor(media: Media | Media[], archiveFolder: string): ProcessStrategy<MediaProcessResult[]> {
    if (Array.isArray(media) && !this.hasVideo(media)) {
      return new InstagramImageProcessor(media, archiveFolder);
    }
    return new InstagramVideoProcessor(media as VideoMedia[], archiveFolder);
  }

  hasVideo(media: Media[]) {
    let hasVideo = false;
    for(const file of media) {
      const fileType: string = file.uri.substring(file.uri.lastIndexOf(".") + 1);
      const mimeType = getVideoMimeType(fileType);
      hasVideo = mimeType.includes('video/');
    }

    return hasVideo;
  }
} 