import { validateVideo, getVideoDimensions } from './video';
import ffmpeg from 'fluent-ffmpeg';

// Mock ffmpeg
jest.mock('fluent-ffmpeg', () => {
  const mockFfprobe = jest.fn();
  const mockFfmpeg: jest.MockedFunction<typeof ffmpeg> & {
    setFfprobePath: jest.Mock;
    ffprobe: jest.Mock;
  } = Object.assign(
    jest.fn(() => ({
      ffprobe: mockFfprobe
    })),
    {
      setFfprobePath: jest.fn(),
      ffprobe: mockFfprobe
    }
  );
  return mockFfmpeg;
});

// Mock @ffprobe-installer/ffprobe
jest.mock('@ffprobe-installer/ffprobe', () => ({
  path: '/mock/ffprobe/path'
}));

describe('video utilities', () => {
  describe('validateVideo', () => {
    test('should return true for videos under 100MB', () => {
      const buffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      expect(validateVideo(buffer)).toBe(true);
    });

    test('should return false for videos over 100MB', () => {
      const buffer = Buffer.alloc(150 * 1024 * 1024); // 150MB
      expect(validateVideo(buffer)).toBe(false);
    });
  });

  describe('getVideoDimensions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return video dimensions when ffprobe succeeds', async () => {
      const mockMetadata = {
        streams: [
          {
            codec_type: 'video',
            width: 1920,
            height: 1080
          }
        ]
      };

      (ffmpeg.ffprobe as jest.Mock).mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });

      const dimensions = await getVideoDimensions('test.mp4');
      expect(dimensions).toEqual({ width: 1920, height: 1080 });
    });

    test('should use default dimensions when width/height not found', async () => {
      const mockMetadata = {
        streams: [
          {
            codec_type: 'video'
          }
        ]
      };

      (ffmpeg.ffprobe as jest.Mock).mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });

      const dimensions = await getVideoDimensions('test.mp4');
      expect(dimensions).toEqual({ width: 640, height: 640 });
    });

    test('should reject when no video stream found', async () => {
      const mockMetadata = {
        streams: [
          {
            codec_type: 'audio'
          }
        ]
      };

      (ffmpeg.ffprobe as jest.Mock).mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });

      await expect(getVideoDimensions('test.mp4')).rejects.toThrow('No video stream found');
    });

    test('should reject when ffprobe fails', async () => {
      (ffmpeg.ffprobe as jest.Mock).mockImplementation((path, callback) => {
        callback(new Error('FFprobe failed'), null);
      });

      await expect(getVideoDimensions('test.mp4')).rejects.toThrow('FFprobe failed');
    });
  });
});
