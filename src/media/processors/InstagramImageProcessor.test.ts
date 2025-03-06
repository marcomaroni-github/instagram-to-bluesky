import { InstagramImageProcessor } from "../";
import { ImageMedia } from "../InstagramExportedPost";

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
      expect(result[0].mediaText.length).toBe(300); // 297 chars + "..."
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
      }));
  
      const processor = new InstagramImageProcessor(mockImages, "/test/archive");
      const result = await processor.process();
  
      // No longer limits images at this level
      expect(result).toHaveLength(6);
      result.forEach((media, index) => {
        expect(media.mimeType).toBe("image/jpeg");
        expect(media.mediaText).toBe(`Image ${index + 1}`);
      });
    });
  });