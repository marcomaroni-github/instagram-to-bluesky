import { validateVideo, getVideoDimensions } from '../src/video';
import fs from 'fs';
import path from 'path';

describe('Video Processing', () => {
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
      const testVideoPath = path.join(__dirname, '../transfer/test_videos/AQM8KYlOYHTF5GlP43eMroHUpmnFHJh5CnCJUdRUeqWxG4tNX7D43eM77F152vfi4znTzgkFTTzzM4nHa_v8ugmP4WPRJtjKPZX5pko_17845940218109367.mp4');
      const dimensions = await getVideoDimensions(testVideoPath);
      expect(dimensions).toEqual({
        width: 640,
        height: 640
      });
    });
  });
}); 