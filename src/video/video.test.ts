import { validateVideo, getVideoDimensions, processVideoPost } from './video.js';
import path from 'path';
import { BlueskyClient } from '@bluesky/bluesky.js';

describe('Video Processing', () => {
  const testVideoPath = path.join(__dirname, '../transfer/test_videos/AQM8KYlOYHTF5GlP43eMroHUpmnFHJh5CnCJUdRUeqWxG4tNX7D43eM77F152vfi4znTzgkFTTzzM4nHa_v8ugmP4WPRJtjKPZX5pko_17845940218109367.mp4');
  
  describe('validateVideo', () => {
    test('should reject videos larger than 100MB', () => {
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024); // 101MB
      expect(validateVideo(largeBuffer)).toBe(false);
    });

    test('should accept videos smaller than 100MB', () => {
      const smallBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      expect(validateVideo(smallBuffer)).toBe(true);
    });
  });

  describe('getVideoDimensions', () => {
    test('should get correct dimensions from test video', async () => {
      const dimensions = await getVideoDimensions(testVideoPath);
      expect(dimensions).toEqual({
        width: 640,
        height: 640
      });
    });

    test('should throw error for non-existent file', async () => {
      await expect(
        getVideoDimensions('nonexistent/video.mp4')
      ).rejects.toThrow();
    });

    test('should throw error for invalid video file', async () => {
      const invalidFilePath = path.join(__dirname, 'video.test.ts'); // Using this test file as invalid video
      await expect(
        getVideoDimensions(invalidFilePath)
      ).rejects.toThrow();
    });
  });

  describe('processVideoPost', () => {
    const mockVideoBuffer = Buffer.from('test video content');
    
    // Mock BlueskyClient
    const mockBluesky = {
      uploadVideo: jest.fn().mockResolvedValue({
        ref: {
          $link: 'test-cid'
        }
      })
    } as unknown as BlueskyClient;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should process video successfully with upload', async () => {
      const result = await processVideoPost(
        testVideoPath,
        mockVideoBuffer,
        mockBluesky,
        false // not simulating
      );

      expect(mockBluesky.uploadVideo).toHaveBeenCalledWith(mockVideoBuffer);
      expect(result).toMatchObject({
        $type: 'app.bsky.embed.video',
        video: {
          $type: 'blob',
          ref: {
            $link: 'test-cid'
          }
        },
        aspectRatio: {
          width: 640,
          height: 640
        }
      });
    });

    test('should process video in simulation mode without upload', async () => {
      const result = await processVideoPost(
        testVideoPath,
        mockVideoBuffer,
        mockBluesky,
        true // simulating
      );

      expect(mockBluesky.uploadVideo).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        $type: 'app.bsky.embed.video',
        video: {
          $type: 'blob',
          ref: {
            $link: ''
          }
        }
      });
    });

    test('should process video without Bluesky client', async () => {
      const result = await processVideoPost(
        testVideoPath,
        mockVideoBuffer,
        null,
        false
      );

      expect(result).toMatchObject({
        $type: 'app.bsky.embed.video',
        video: {
          $type: 'blob',
          ref: {
            $link: ''
          }
        }
      });
    });

    test('should throw error for undefined buffer', async () => {
      await expect(
        processVideoPost(testVideoPath, undefined as unknown as Buffer, mockBluesky, false)
      ).rejects.toThrow('Video buffer is undefined');
    });

    test('should throw error when upload fails', async () => {
      const failingBluesky = {
        uploadVideo: jest.fn().mockResolvedValue(null)
      } as unknown as BlueskyClient;

      await expect(
        processVideoPost(testVideoPath, mockVideoBuffer, failingBluesky, false)
      ).rejects.toThrow('Failed to get video upload reference');
    });
  });
}); 