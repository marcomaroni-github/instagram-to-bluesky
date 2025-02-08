import { getMimeType, processMedia, processPost } from '../src/media';
import path from 'path';
import fs from 'fs';

// Mock the file system
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

// Mock the logger to avoid console noise during tests
jest.mock('../src/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock the video validation
jest.mock('../src/video', () => ({
  validateVideo: jest.fn().mockReturnValue(true),
  getVideoDimensions: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
}));

describe('Media Processing', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Setup default mock for readFileSync
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('test'));
  });

  describe('getMimeType', () => {
    test('should return correct mime types for supported files', () => {
      expect(getMimeType('jpg')).toBe('image/jpeg');
      expect(getMimeType('mp4')).toBe('video/mp4');
      expect(getMimeType('mov')).toBe('video/quicktime');
    });

    test('should return empty string for unsupported files', () => {
      expect(getMimeType('xyz')).toBe('');
    });
  });

  describe('processMedia', () => {
    const testMedia = {
      uri: 'test.mp4',
      creation_timestamp: Date.now() / 1000,
      title: 'Test Media',
      media_metadata: {
        photo_metadata: {
          exif_data: [{
            latitude: 45.5,
            longitude: -122.5
          }]
        }
      }
    };

    test('should process video media file correctly', async () => {
      const result = await processMedia(
        testMedia,
        path.join(__dirname, '../transfer/test_videos'),
        true
      );
      
      expect(result.mimeType).toBe('video/mp4');
      expect(result.isVideo).toBe(true);
      expect(result.mediaBuffer).toBeTruthy();
      expect(result.mediaText).toContain('Test Media');
      expect(result.mediaText).toContain('geo:45.5,-122.5');
    });

    test('should handle missing media file', async () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await processMedia(
        testMedia,
        path.join(__dirname, '../transfer/test_videos'),
        true
      );
      
      expect(result.mimeType).toBeNull();
      expect(result.mediaBuffer).toBeNull();
    });
  });

  describe('processPost', () => {
    const testPost = {
      creation_timestamp: Date.now() / 1000,
      title: 'Test Post',
      media: [{
        uri: 'test.mp4',
        creation_timestamp: Date.now() / 1000,
        title: 'Test Media'
      }]
    };

    test('should process post correctly', async () => {
      const result = await processPost(
        testPost,
        path.join(__dirname, '../transfer/test_videos'),
        true,
        true
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe('Test Post');
      expect(Array.isArray(result.embeddedMedia)).toBe(true);
      expect(result.mediaCount).toBe(1);
    });

    test('should handle post with no media', async () => {
      const emptyPost = {
        creation_timestamp: Date.now() / 1000,
        title: 'Empty Post',
        media: []
      };

      const result = await processPost(
        emptyPost,
        path.join(__dirname, '../transfer/test_videos'),
        true,
        true
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe('Empty Post');
      expect(result.embeddedMedia).toHaveLength(0);
      expect(result.mediaCount).toBe(0);
    });

    test('should truncate long post text', async () => {
      const longPost = {
        creation_timestamp: Date.now() / 1000,
        title: 'A'.repeat(400), // Create a string longer than POST_TEXT_LIMIT
        media: []
      };

      const result = await processPost(
        longPost,
        path.join(__dirname, '../transfer/test_videos'),
        true,
        true
      );

      expect(result.postText.length).toBeLessThanOrEqual(300);
      expect(result.postText.endsWith('...')).toBe(true);
    });
  });
}); 