import { BlobRef } from '@atproto/api';

import fs from 'fs';

import { BlueskyClient } from './bluesky';

import { ImagesEmbedImpl, VideoEmbedImpl } from './types/index';

const TEST_VIDEO_PATH = './transfer/test_videos/AQM8KYlOYHTF5GlP43eMroHUpmnFHJh5CnCJUdRUeqWxG4tNX7D43eM77F152vfi4znTzgkFTTzzM4nHa_v8ugmP4WPRJtjKPZX5pko_17845940218109367.mp4';
const TEST_IMAGE_PATH = './transfer/test_images/454093999_1240420453752667_4632794683080840290_n_18047065138879510.jpg'
jest.mock('@atproto/api', () => ({
  AtpAgent: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    post: jest.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.post/123' }),
    uploadBlob: jest.fn()
  })),
  RichText: jest.fn().mockImplementation(() => ({
    detectFacets: jest.fn(),
    text: 'test text',
    facets: []
  })),
  BlobRef: jest.fn().mockImplementation((ref, mimeType, size) => ({
    ref,
    mimeType,
    size
  }))
}));

describe('BlueskyClient', () => {
  let client: BlueskyClient;
  let videoBuffer: Buffer;
  let imageBuffer: Buffer;
  let mockAgent: any;
  const mockBlobRefUpload = (buffer, { encoding }) => ({ 
    data: { 
      blob: {
        ref: { link: 'test-blob-ref' },
        mimeType: encoding,
        size: 1000
      }
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    client = new BlueskyClient('test-user', 'test-pass');
    mockAgent = jest.requireMock('@atproto/api').AtpAgent.mock.results[0].value;
    mockAgent.uploadBlob = jest.fn().mockImplementation(mockBlobRefUpload);
  });

  beforeAll(async () => {
    videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
  });

  test('should create post successfully', async () => {
    const postUrl = await client.createPost(
      new Date(),
      'Test post',
      new ImagesEmbedImpl([])
    );

    expect(postUrl).toContain('https://bsky.app/profile/test-user/post/');
  });

  test('should upload image successfully', async () => {
    const blob = await client.uploadMedia(imageBuffer, 'image/jpeg');

    expect(blob).toBeDefined();
    expect(mockAgent.uploadBlob).toHaveBeenCalledTimes(1);
    expect(mockAgent.uploadBlob).toHaveBeenCalledWith(imageBuffer, { encoding: 'image/jpeg' });
  });

  test('should upload video successfully', async () => {
    const blob = await client.uploadMedia(videoBuffer, 'video/mp4');

    expect(blob).toBeDefined();
    expect(mockAgent.uploadBlob).toHaveBeenCalledTimes(1);
    expect(mockAgent.uploadBlob).toHaveBeenCalledWith(videoBuffer, { encoding: 'video/mp4' });
  });

  test('should handle media upload failure', async () => {
    mockAgent.uploadBlob.mockRejectedValueOnce(new Error('Upload failed'));
    await expect(client.uploadMedia(imageBuffer, 'image/jpeg')).rejects.toThrow('Upload failed');
    expect(mockAgent.uploadBlob).toHaveBeenCalledTimes(1);
    expect(mockAgent.uploadBlob).toHaveBeenCalledWith(imageBuffer, { encoding: 'image/jpeg' });
  });

  test('should create video post successfully', async () => {
    const blob = await client.uploadMedia(videoBuffer, 'video/mp4');
    expect(mockAgent.uploadBlob).toHaveBeenCalledTimes(1);
    expect(mockAgent.uploadBlob).toHaveBeenCalledWith(videoBuffer, { encoding: 'video/mp4' });

    const videoEmbed = new VideoEmbedImpl(
      'test video',
      videoBuffer,
      'video/mp4',
      1000,
      blob
    );

    const postUrl = await client.createPost(
      new Date(),
      'Test video post',
      videoEmbed
    );

    expect(postUrl).toContain('https://bsky.app/profile/test-user/post/123');
  });
}); 