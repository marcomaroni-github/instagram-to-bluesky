import fs from "fs";
import { InstagramMediaProcessor } from "./InstagramMediaProcessor";
import { InstagramExportedPost, VideoMedia, ImageMedia } from "../InstagramExportedPost";

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
jest.mock("../../logger/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));


describe("InstagramMediaProcessor", () => {
    const mockArchiveFolder = "/test/archive";
  
    beforeEach(() => {
      jest.clearAllMocks();
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("test"));
    });

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

    test("should process a post with mixed media (images and videos)", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1720384531,
        title: "What an incredible weekend day trip to celebrate Momma Olga's birthday.",
        media: [
          {
            uri: "photo1.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup1.jpg",
          } as ImageMedia,
          {
            uri: "photo2.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup2.jpg",
          } as ImageMedia,
          {
            uri: "video1.mp4",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup_video1.mp4",
            dubbing_info: [],
            media_variants: [],
          } as VideoMedia,
          {
            uri: "photo3.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup3.jpg",
          } as ImageMedia,
          {
            uri: "photo4.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup4.jpg",
          } as ImageMedia,
          {
            uri: "video2.mp4",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup_video2.mp4",
            dubbing_info: [],
            media_variants: [],
          } as VideoMedia,
          {
            uri: "photo5.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup5.jpg",
          } as ImageMedia,
        ],
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      // Should create 4 posts total
      expect(result).toHaveLength(4);

      // First post should have 4 images
      expect(result[0].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 1/4)");
      expect(result[0].embeddedMedia).toHaveLength(4);
      result[0].embeddedMedia.forEach(media => {
        expect(media.mimeType).toBe("image/jpeg");
      });

      // Second post should have 1 image
      expect(result[1].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 2/4)");
      expect(result[1].embeddedMedia).toHaveLength(1);
      expect(result[1].embeddedMedia[0].mimeType).toBe("image/jpeg");

      // Third post should have first video
      expect(result[2].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 3/4)");
      expect(result[2].embeddedMedia).toHaveLength(1);
      expect(result[2].embeddedMedia[0].mimeType).toBe("video/mp4");

      // Fourth post should have second video
      expect(result[3].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 4/4)");
      expect(result[3].embeddedMedia).toHaveLength(1);
      expect(result[3].embeddedMedia[0].mimeType).toBe("video/mp4");
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
      expect(result[0].postText.length).toBe(300); // 297 chars + "..."
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

      // Should create 2 posts total
      expect(result).toHaveLength(2);

      // First post should have 4 images
      expect(result[0].postText).toBe("Test Post with Many Images (Part 1/2)");
      expect(result[0].embeddedMedia).toHaveLength(4);
      result[0].embeddedMedia.forEach(media => {
        expect(media.mimeType).toBe("image/jpeg");
      });

      // Second post should have 2 images
      expect(result[1].postText).toBe("Test Post with Many Images (Part 2/2)");
      expect(result[1].embeddedMedia).toHaveLength(2);
      result[1].embeddedMedia.forEach(media => {
        expect(media.mimeType).toBe("image/jpeg");
      });
    });

    test("should split mixed media post into multiple posts based on media limits", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1720384531,
        title: "What an incredible weekend day trip to celebrate Momma Olga's birthday.",
        media: [
          {
            uri: "photo1.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup1.jpg",
          } as ImageMedia,
          {
            uri: "photo2.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup2.jpg",
          } as ImageMedia,
          {
            uri: "photo3.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup3.jpg",
          } as ImageMedia,
          {
            uri: "photo4.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup4.jpg",
          } as ImageMedia,
          {
            uri: "photo5.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup5.jpg",
          } as ImageMedia,
          {
            uri: "video1.mp4",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup_video1.mp4",
            dubbing_info: [],
            media_variants: [],
          } as VideoMedia,
          {
            uri: "video2.mp4",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup_video2.mp4",
            dubbing_info: [],
            media_variants: [],
          } as VideoMedia,
        ],
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      // Should create 4 posts total
      expect(result).toHaveLength(4);

      // First post should have 4 images
      expect(result[0].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 1/4)");
      expect(result[0].embeddedMedia).toHaveLength(4);
      result[0].embeddedMedia.forEach(media => {
        expect(media.mimeType).toBe("image/jpeg");
      });

      // Second post should have 1 image
      expect(result[1].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 2/4)");
      expect(result[1].embeddedMedia).toHaveLength(1);
      expect(result[1].embeddedMedia[0].mimeType).toBe("image/jpeg");

      // Third post should have first video
      expect(result[2].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 3/4)");
      expect(result[2].embeddedMedia).toHaveLength(1);
      expect(result[2].embeddedMedia[0].mimeType).toBe("video/mp4");

      // Fourth post should have second video
      expect(result[3].postText).toBe("What an incredible weekend day trip to celebrate Momma Olga's birthday. (Part 4/4)");
      expect(result[3].embeddedMedia).toHaveLength(1);
      expect(result[3].embeddedMedia[0].mimeType).toBe("video/mp4");
    });

    test("should ensure split posts have different timestamps to prevent Bluesky duplicates", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1720384531,
        title: "Test post with multiple media",
        media: [
          {
            uri: "photo1.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup1.jpg",
          } as ImageMedia,
          {
            uri: "photo2.jpg",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup2.jpg",
          } as ImageMedia,
          {
            uri: "video1.mp4",
            title: "",
            creation_timestamp: 1720384529,
            media_metadata: {
              camera_metadata: {
                has_camera_metadata: false
              }
            },
            cross_post_source: { source_app: "FB" },
            backup_uri: "backup_video1.mp4",
            dubbing_info: [],
            media_variants: [],
          } as VideoMedia,
        ],
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      // Should create 2 posts (1 for images, 1 for video)
      expect(result).toHaveLength(2);

      // Verify timestamps are different and increment by 1 second
      const baseTimestamp = result[0].postDate!.getTime();
      for (let i = 1; i < result.length; i++) {
        const currentTimestamp = result[i].postDate!.getTime();
        const previousTimestamp = result[i-1].postDate!.getTime();
        
        // Each post should be 1 second after the previous
        expect(currentTimestamp - previousTimestamp).toBe(1000);
        
        // Should be incrementally later than base timestamp
        expect(currentTimestamp - baseTimestamp).toBe(i * 1000);
      }

      // Verify post numbering
      expect(result[0].postText).toContain("(Part 1/2)");
      expect(result[1].postText).toContain("(Part 2/2)");
    });
  });