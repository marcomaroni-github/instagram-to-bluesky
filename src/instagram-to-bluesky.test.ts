import fs from 'fs';

import { main, formatDuration, calculateEstimatedTime } from '../src/instagram-to-bluesky';
import { BlueskyClient } from '../src/bluesky/bluesky';
import { logger } from '../src/logger/logger';
import { InstagramMediaProcessor } from '../src/media/media';
import type { InstagramExportedPost } from '../src/media/InstagramExportedPost';

// Mock all dependencies
jest.mock('fs');
jest.mock('../src/bluesky/bluesky', () => {
  return {
    BlueskyClient: jest.fn().mockImplementation(() => ({
      login: jest.fn().mockResolvedValue(undefined),
      uploadMedia: jest.fn().mockResolvedValue({
        ref: 'test-blob-ref',
        mimeType: 'image/jpeg',
        size: 1000
      }),
      createPost: jest.fn().mockResolvedValue('https://bsky.app/profile/test/post/test')
    }))
  };
});
jest.mock('../src/media/media', () => {
  const mockProcess = jest.fn().mockResolvedValue([{
    postDate: new Date(),
    postText: 'Test post',
    embeddedMedia: [],
    mediaCount: 1
  }]);

  const mockMediaProcessor = {
    process: jest.fn().mockResolvedValue([{
      mediaText: 'Test media',
      mimeType: 'image/jpeg',
      mediaBuffer: Buffer.from('test')
    }])
  };

  return {
    InstagramMediaProcessor: jest.fn().mockImplementation(
      (posts: InstagramExportedPost[], folder: string) => ({
        mediaProcessorFactory: {
          createProcessor: () => mockMediaProcessor
        },
        instagramPosts: posts,
        archiveFolder: folder,
        process: mockProcess
      })
    ),
    decodeUTF8: jest.fn(x => x)
  };
});
jest.mock('../src/logger/logger', () => ({
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
  getVideoDimensions: jest.fn(),
  processVideoPost: jest.fn()
}));

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
    expect(InstagramMediaProcessor).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringContaining('/test/folder')
    );
    expect(jest.mocked(InstagramMediaProcessor).mock.results[0].value.process).toHaveBeenCalled();
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
    
    await main();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Estimated time for real import')
    );
  });

  test('should process posts successfully', async () => {
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
    expect(InstagramMediaProcessor).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringContaining('/test/folder')
    );
    expect(jest.mocked(InstagramMediaProcessor).mock.results[0].value.process).toHaveBeenCalled();
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
