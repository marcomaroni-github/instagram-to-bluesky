import fs from "fs";

import { InstagramImageProcessor, InstagramMediaProcessor, InstagramVideoProcessor, decodeUTF8 } from "./media";
import { getImageSize } from "../image";
import { InstagramExportedPost, VideoMedia, ImageMedia } from "./InstagramExportedPost";

// Mock the file system
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

// Mock sharp
jest.mock("sharp", () => {
  return function(filePath: string) {
    // Mock different behavior based on file path for testing different scenarios
    if (filePath && filePath.includes('missing.jpg')) {
      throw new Error('Input file is missing');
    }
    
    if (filePath && filePath.includes('invalid.jpg')) {
      return {
        metadata: jest.fn().mockResolvedValue({})
      };
    }
    
    if (filePath && filePath.includes('landscape.jpg')) {
      return {
        metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 })
      };
    }
    
    if (filePath && filePath.includes('portrait.jpg')) {
      return {
        metadata: jest.fn().mockResolvedValue({ width: 1080, height: 1920 })
      };
    }
    
    // Default square image
    return {
      metadata: jest.fn().mockResolvedValue({ width: 1080, height: 1080 })
    };
  };
});

// Mock fluent-ffmpeg
jest.mock("fluent-ffmpeg", () => {
  return {
    setFfprobePath: jest.fn(),
    ffprobe: (path: string, callback: (err: Error | null, data: any) => void) => {
      callback(null, {
        streams: [
          {
            codec_type: "video",
            width: 1920,
            height: 1080,
          },
        ],
      });
    },
  };
});

// Mock @ffprobe-installer/ffprobe
jest.mock("@ffprobe-installer/ffprobe", () => ({
  path: "/mock/ffprobe/path",
}));

// Mock the logger
jest.mock("../logger/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));


// TODO breakdown into processors.test.ts or a test suite per processor instance.
describe("Instagram Media Processing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("test"));
  });

  describe("InstagramMediaProcessor", () => {
    const mockArchiveFolder = "/test/archive";
    
    test("should process a post with multiple images", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Post",
        media: [
          {
            uri: "photo1.jpg",
            title: "Image 1",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup1.jpg",
          },
          {
            uri: "photo2.jpg",
            title: "Image 2",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup2.jpg",
          },
        ] as ImageMedia[],
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].postText).toBe("Test Post");
      expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
      expect(result[0].embeddedMedia).toHaveLength(2);
    });

    test("should process a post with a single video", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Video Post",
        media: [{
          uri: "video.mp4",
          title: "Test Video",
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: "backup_video.mp4",
          dubbing_info: [],
          media_variants: [],
        } as VideoMedia],
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].postText).toBe("Test Video Post");
      expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
    });

    test("should truncate post title when it exceeds limit", async () => {
      const longTitle = "A".repeat(400); // Create a title longer than POST_TEXT_LIMIT (300)
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: longTitle,
        media: [
          {
            uri: "photo1.jpg",
            title: "Image 1",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup1.jpg",
          },
        ] as ImageMedia[],
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].postText.length).toBe(303); // 300 chars + "..."
      expect(result[0].postText.endsWith("...")).toBe(true);
    });

    test("should use media title if no post title is available", async () => {
      // Create a post without a title property using type casting
      const mockPost = {
        creation_timestamp: 1458732736,
        media: [
          {
            uri: "AQM8KYlOYHTF5GlP43eMroHUpmnFHJh5CnCJUdRUeqWxG4tNX7D43eM77F152vfi4znTzgkFTTzzM4nHa_v8ugmP4WPRJtjKPZX5pko_17845940218109367.mp4",
            creation_timestamp: 1458732736,
            media_metadata: {
              video_metadata: {
                exif_data: [
                  {
                    latitude: 53.141186112,
                    longitude: 11.038734576
                  }
                ]
              }
            },
            title: "No filter needed. 😍🌱 #waterfall #nature",
            cross_post_source: {
              source_app: "FB"
            },
            backup_uri: "backup_video.mp4",
            dubbing_info: [],
            media_variants: []
          } as VideoMedia],
      } as InstagramExportedPost; // Cast to InstagramExportedPost without providing title

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].postText).toBe("No filter needed. 😍🌱 #waterfall #nature");
      expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
    });

    test("should limit media to maximum allowed images", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Post with Many Images",
        media: Array(6).fill(null).map((_, index) => ({
          uri: `photo${index + 1}.jpg`,
          title: `Image ${index + 1}`,
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: `backup${index + 1}.jpg`,
        })) as ImageMedia[], // Create 6 images, more than MAX_IMAGES_PER_POST (4)
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].embeddedMedia).toHaveLength(4); // Should be limited to 4 images
    });
  });

  describe("InstagramImageProcessor", () => {
    test("should process multiple images", async () => {
      const mockImages: ImageMedia[] = [
        {
          uri: "photo1.jpg",
          title: "Image 1",
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: "backup1.jpg",
        },
        {
          uri: "photo2.jpg",
          title: "Image 2",
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: "backup2.jpg",
        },
      ];

      const processor = new InstagramImageProcessor(mockImages, "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(2);
      expect(result[0].mimeType).toBe("image/jpeg");
      expect(result[1].mimeType).toBe("image/jpeg");
    });

    test("should handle unsupported image types", async () => {
      const mockImages: ImageMedia[] = [{
        uri: "photo.xyz",
        title: "Invalid Image",
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup_invalid.jpg",
      }];

      const processor = new InstagramImageProcessor(mockImages, "/test/archive");
      const result = await processor.process();
      
      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("");
    });

    test("should truncate image caption when it exceeds limit", async () => {
      const longCaption = "B".repeat(400); // Create a caption longer than POST_TEXT_LIMIT (300)
      const mockImages: ImageMedia[] = [{
        uri: "photo1.jpg",
        title: longCaption,
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup1.jpg",
      }];

      const processor = new InstagramImageProcessor(mockImages, "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].mediaText.length).toBe(303); // 300 chars + "..."
      expect(result[0].mediaText.endsWith("...")).toBe(true);
    });

    test("should limit to maximum allowed images when processing multiple images", async () => {
      const mockImages: ImageMedia[] = Array(6).fill(null).map((_, index) => ({
        uri: `photo${index + 1}.jpg`,
        title: `Image ${index + 1}`,
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: `backup${index + 1}.jpg`,
      })); // Create 6 images, more than MAX_IMAGES_PER_POST (4)

      const processor = new InstagramImageProcessor(mockImages, "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(4); // Should be limited to 4 images
    });
  });

  describe("InstagramVideoProcessor", () => {
    test("should process a video", async () => {
      const mockVideo: VideoMedia = {
        uri: "video.mp4",
        title: "Test Video",
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup_video.mp4",
        dubbing_info: [],
        media_variants: [],
      };

      const processor = new InstagramVideoProcessor([mockVideo], "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("video/mp4");
      expect(result[0].mediaText).toBe("Test Video");
    });

    test("should handle unsupported video types", async () => {
      const mockVideo: VideoMedia = {
        uri: "video.xyz",
        title: "Invalid Video",
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup_invalid.mp4",
        dubbing_info: [],
        media_variants: [],
      };

      const processor = new InstagramVideoProcessor([mockVideo], "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("");
    });

    test("should truncate video title when it exceeds limit", async () => {
      const longTitle = "C".repeat(400); // Create a title longer than POST_TEXT_LIMIT (300)
      const mockVideo: VideoMedia = {
        uri: "video.mp4",
        title: longTitle,
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup_video.mp4",
        dubbing_info: [],
        media_variants: [],
      };

      const processor = new InstagramVideoProcessor([mockVideo], "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].mediaText.length).toBe(303); // 300 chars + "..."
      expect(result[0].mediaText.endsWith("...")).toBe(true);
    });
  });

  describe("MediaProcessorFactory", () => {
    test("should use DefaultMediaProcessorFactory for image processing", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Post",
        media: [
          {
            uri: "test.jpg",
            title: "Test",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup_test.jpg",
          },
        ] as ImageMedia[],
      };

      const processor = new InstagramMediaProcessor([mockPost], "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].embeddedMedia).toBeDefined();
      expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
    });

    test("should use DefaultMediaProcessorFactory for video processing", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Video Post",
        media: [
          {
            uri: "test.mp4",
            title: "Test Video",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup_test.mp4",
            dubbing_info: [],
            media_variants: [],
          },
        ] as VideoMedia[],
      };

      const processor = new InstagramMediaProcessor([mockPost], "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].embeddedMedia).toBeDefined();
      expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
    });
  });
});

describe("decodeUTF8", () => {
  test("should decode Instagram Unicode escape sequences", () => {
    const input = "Basil, Eucalyptus, Thyme \u00f0\u009f\u0098\u008d\u00f0\u009f\u008c\u00b1";
    const result = decodeUTF8(input);
    expect(result).toBe("Basil, Eucalyptus, Thyme 😍🌱");
  });
});

describe("getImageSize", () => {
  test("should return correct dimensions for a square image", async () => {
    const result = await getImageSize("/path/to/square.jpg");
    expect(result).toEqual({ width: 1080, height: 1080 });
  });

  test("should return correct dimensions for a landscape image", async () => {
    const result = await getImageSize("/path/to/landscape.jpg");
    expect(result).toEqual({ width: 1920, height: 1080 });
  });

  test("should return correct dimensions for a portrait image", async () => {
    const result = await getImageSize("/path/to/portrait.jpg");
    expect(result).toEqual({ width: 1080, height: 1920 });
  });

  test("should return null when metadata is missing width or height", async () => {
    const result = await getImageSize("/path/to/invalid.jpg");
    expect(result).toBeNull();
  });

  test("should log error when image processing fails", async () => {
    // Import the logger mock
    const { logger } = require("../logger/logger");
    
    // Call the function with a path that will trigger an error
    const result = await getImageSize("/path/to/missing.jpg");
    
    // Verify the logger.error was called with the expected message pattern
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to get image aspect ratio; image path: \/path\/to\/missing\.jpg, error:/)
    );
    
    // Verify the function returns null when an error occurs
    expect(result).toBeNull();
  });
});
