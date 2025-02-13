
/**
 * Creation timestamp in milliseconds.
 */
interface CreationTimestamp {
  creation_timestamp: number;
}


export interface CrossPostSource {
  source_app: string;
}

export interface CameraMetadata {
  has_camera_metadata: boolean;
}
export interface MediaMetadata {
  photo_metadata?: PhotoMetadata
  camera_metadata?: CameraMetadata
}

export interface PhotoMetadata {
  exif_data: ExifDaum[]
}

export interface ExifDaum {
  device_id: string
  date_time_digitized: string
  date_time_original: string
  source_type: string
  latitude?: number
  longitude?: number
  scene_capture_type?: string
  software?: string
  scene_type?: number
}

interface BaseMedia extends CreationTimestamp {
  uri: string;
  media_metadata: MediaMetadata;
  title: string;
  cross_post_source: CrossPostSource;
  backup_uri: string;
}

export interface ImageMedia extends BaseMedia {}

export interface VideoMedia extends BaseMedia {
  dubbing_info: any[];
  media_variants: any[];
}

export type Media = ImageMedia | VideoMedia;

/**
 * Represents posts_1.json data export from Instagram as of 2025/02/11.
 */
export interface InstagramExportedPost extends CreationTimestamp {
  media: Media[] | Media;
  title: string;
}