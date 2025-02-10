import { main, formatDuration, calculateEstimatedTime } from '../src/app';
import { BlueskyClient } from '../src/bluesky';
import { processPost } from '../src/media';
import { logger } from '../src/logger';
import fs from 'fs';
import { createVideoEmbed } from '../src/video';

// Mock all dependencies
jest.mock('fs');
jest.mock('../src/bluesky');
jest.mock('../src/media');
jest.mock('../src/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));
jest.mock('../src/video', () => ({
  prepareVideoUpload: jest.fn().mockReturnValue({
    ref: '', // This will be filled by the upload process with the CID
    mimeType: 'video/mp4',
    size: 1000,
    dimensions: {
      width: 640,
      height: 640
    }
  }),
  createVideoEmbed: jest.fn(),
  validateVideo: jest.fn(),
  getVideoDimensions: jest.fn()
}));

// Add this mock before the tests
jest.mock('../src/app', () => {
  const originalModule = jest.requireActual('../src/app');
  return {
    ...originalModule,
    getArchiveFolder: () => '/test/folder'
  };
});

describe('Main App', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset env before each test
    process.env = { 
      ...originalEnv,
      ARCHIVE_FOLDER: '/test/folder',
      BLUESKY_USERNAME: 'test_user',
      BLUESKY_PASSWORD: 'test_pass',
      SIMULATE: '0',
      TEST_MODE: '0'
    };

    // Setup default mocks
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([{
      creation_timestamp: Date.now() / 1000,
      title: 'Test Post 1',
      media: [{
        creation_timestamp: Date.now() / 1000,
        title: 'Test Media 1'
      }]
    }]));

    (processPost as jest.Mock).mockResolvedValue({
      postDate: new Date(),
      postText: 'Test post',
      embeddedMedia: [],
      mediaCount: 1
    });

    // Reset BlueskyClient mock
    jest.mocked(BlueskyClient).mockClear();
    jest.mocked(BlueskyClient).prototype.login = jest.fn();
    jest.mocked(BlueskyClient).prototype.createPost = jest.fn().mockResolvedValue('https://bsky.app/test/post');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should process posts in simulate mode', async () => {
    process.env.SIMULATE = '1';
    
    await main();

    expect(jest.mocked(BlueskyClient)).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SIMULATE mode is enabled')
    );
  });

  test('should process posts and create Bluesky posts in normal mode', async () => {
    const mockPost = {
      creation_timestamp: Date.now() / 1000,
      title: 'Test Post',
      media: [{
        creation_timestamp: Date.now() / 1000,
        title: 'Test Media'
      }]
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));

    await main();

    expect(jest.mocked(BlueskyClient)).toHaveBeenCalled();
    expect(processPost).toHaveBeenCalledWith(
      expect.objectContaining(mockPost),
      expect.stringContaining('/test/folder')
    );
  });

  test('should handle date filtering with MIN_DATE', async () => {
    process.env.MIN_DATE = '2024-01-01';
    
    const oldPost = {
      creation_timestamp: new Date('2023-01-01').getTime() / 1000,
      title: 'Old Post',
      media: [{
        creation_timestamp: new Date('2023-01-01').getTime() / 1000,
        title: 'Old Media'
      }]
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([oldPost]));

    await main();

    expect(logger.warn).toHaveBeenCalledWith(
      'Skipping post - Before MIN_DATE: [Sun, 01 Jan 2023 00:00:00 GMT]'
    );
  });

  test('should handle date filtering with MAX_DATE', async () => {
    process.env.MAX_DATE = '2024-01-01';
    
    const futurePost = {
      creation_timestamp: new Date('2025-01-01').getTime() / 1000,
      title: 'Future Post',
      media: [{
        creation_timestamp: new Date('2025-01-01').getTime() / 1000,
        title: 'Future Media'
      }]
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([futurePost]));

    await main();

    expect(logger.warn).toHaveBeenCalledWith('Skipping post - After MAX_DATE [Wed, 01 Jan 2025 00:00:00 GMT]');
  });

  test('should handle posts with missing dates', async () => {
    const invalidPost = {
      title: 'Invalid Post',
      media: [{ title: 'Invalid Media' }]
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([invalidPost]));

    await main();

    expect(logger.warn).toHaveBeenCalledWith('Skipping post - No date');
  });

  test('should handle file reading errors', async () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('File read error');
    });

    await expect(main()).rejects.toThrow('File read error');
  });

  test('should handle Bluesky posting errors', async () => {
    const mockPost = {
      creation_timestamp: Date.now() / 1000,
      title: 'Test Post',
      media: [{
        creation_timestamp: Date.now() / 1000,
        title: 'Test Media'
      }]
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));
    jest.mocked(BlueskyClient).prototype.createPost = jest.fn().mockRejectedValue(new Error('Post failed'));

    await main();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Import finished')
    );
  });

  test('should calculate correct estimated time in simulate mode', async () => {
    process.env.SIMULATE = '1';
    
    const mockPost = {
      creation_timestamp: Date.now() / 1000,
      title: 'Test Post',
      media: [{
        creation_timestamp: Date.now() / 1000,
        title: 'Test Media'
      }]
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));
    
    (processPost as jest.Mock).mockResolvedValue({
      postDate: new Date(),
      postText: 'Test post',
      embeddedMedia: [],
      mediaCount: 10 // 10 media items
    });

    await main();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Estimated time for real import')
    );
  });

  test('should handle video posts correctly', async () => {
    const mockVideoPost = {
      creation_timestamp: Date.now() / 1000,
      title: 'Test Video Post',
      media: [{
        type: 'Video',
        creation_timestamp: Date.now() / 1000,
        media_url: 'test.mp4',
        buffer: Buffer.from('test')
      }]
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockVideoPost]));
    
    // Mock BlueskyClient uploadVideo method
    jest.mocked(BlueskyClient).prototype.uploadVideo = jest.fn().mockResolvedValue({
      ref: { $link: 'test-ref' }
    });

    // Mock the video embed result
    const mockVideoEmbed = {
      $type: 'app.bsky.embed.video',
      video: {
        $type: 'blob',
        ref: { $link: 'test-ref' },
        mimeType: 'video/mp4',
        size: 1000
      },
      aspectRatio: { width: 640, height: 480 }
    };

    (createVideoEmbed as jest.Mock).mockReturnValue(mockVideoEmbed);

    await main();

    expect(BlueskyClient.prototype.uploadVideo).toHaveBeenCalled();
    expect(BlueskyClient.prototype.createPost).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(String),
      expect.objectContaining({
        $type: 'app.bsky.embed.video'
      })
    );
  });
});

describe('Time Formatting Functions', () => {
  describe('formatDuration', () => {
    test('should format duration with hours and minutes', () => {
      const cases = [
        { input: 3600000, expected: '1 hours and 0 minutes' },     // 1 hour
        { input: 5400000, expected: '1 hours and 30 minutes' },    // 1.5 hours
        { input: 900000, expected: '0 hours and 15 minutes' },     // 15 minutes
        { input: 7200000, expected: '2 hours and 0 minutes' },     // 2 hours
        { input: 8100000, expected: '2 hours and 15 minutes' },    // 2.25 hours
      ];

      cases.forEach(({ input, expected }) => {
        expect(formatDuration(input)).toBe(expected);
      });
    });
  });

  describe('calculateEstimatedTime', () => {
    test('should calculate estimated time based on media count', () => {
      // API_RATE_LIMIT_DELAY is 3000ms, with 1.1 multiplier
      const cases = [
        { mediaCount: 20, expected: '0 hours and 1 minutes' },     // 20 * 3000 * 1.1 = 66000ms
        { mediaCount: 40, expected: '0 hours and 2 minutes' },    // 40 * 3000 * 1.1 = 132000ms
        { mediaCount: 10, expected: '0 hours and 0 minutes' },    // 10 * 3000 * 1.1 = 33000ms
      ];

      cases.forEach(({ mediaCount, expected }) => {
        expect(calculateEstimatedTime(mediaCount)).toBe(expected);
      });
    });
  });
});
