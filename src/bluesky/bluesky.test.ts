import { BlobRef } from '@atproto/api';

import { CID } from 'multiformats';

import fs from 'fs';

import { BlueskyClient } from './bluesky.js';

import { ImagesEmbedImpl, VideoEmbedImpl } from './types/index.js';

const TEST_VIDEO_PATH = './transfer/test_videos/AQM8KYlOYHTF5GlP43eMroHUpmnFHJh5CnCJUdRUeqWxG4tNX7D43eM77F152vfi4znTzgkFTTzzM4nHa_v8ugmP4WPRJtjKPZX5pko_17845940218109367.mp4';

jest.mock('@atproto/api', () => ({
  AtpAgent: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    post: jest.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.post/123' }),
    uploadBlob: jest.fn().mockResolvedValue({ 
      data: { blob: { $type: 'blob', ref: { $link: 'test-blob-ref' } } }
    }),
    api: {
      app: {
        bsky: {
          video: {
            uploadVideo: jest.fn().mockResolvedValue({
              data: {
                jobStatus: {
                  jobId: 'test-job-id'
                }
              }
            }),
            getJobStatus: jest.fn().mockResolvedValue({
              data: {
                jobStatus: {
                  state: 'JOB_STATE_COMPLETED',
                  blob: {
                    $type: 'blob',
                    ref: { $link: 'test-blob-ref' },
                    mimeType: 'video/mp4',
                    size: 1000
                  }
                }
              }
            })
          }
        }
      }
    }
  })),
  RichText: jest.fn().mockImplementation(() => ({
    detectFacets: jest.fn(),
    text: 'test text',
    facets: []
  }))
}));

describe('BlueskyClient', () => {
  let client: BlueskyClient;
  let mockCID: CID;
  let videoBuffer: Buffer;

  beforeEach(() => {
    client = new BlueskyClient('test-user', 'test-pass');
  });

  beforeAll(async () => {
    videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    /**
     * CID from test video uploaded to Pinata.cloud.
     * Creating CID from the video proved to be too challenging.
     */
    mockCID = CID.parse('bafybeibssikmpbeu3z7ezozo7447go7gpneqgblsyo2owed4qleljptmeu')
  });

  test('should create post successfully', async () => {
    const postUrl = await client.createPost(
      new Date(),
      'Test post',
      new ImagesEmbedImpl([])
    );

    expect(postUrl).toContain('https://bsky.app/profile/test-user/post/');
  });

  xtest('should upload video successfully', async () => {
    const buffer = Buffer.from('test video');
    const blob = await client.uploadVideo(buffer, 'video/mp4');

    expect(blob).toBeDefined();
    expect(blob.ref).toBe('test-blob-ref');
  });

  xtest('should handle video upload failure', async () => {
    const mockAgent = jest.requireMock('@atproto/api').AtpAgent.mock.results[0].value;
    mockAgent.api.app.bsky.video.getJobStatus.mockResolvedValueOnce({
      data: {
        jobStatus: {
          state: 'JOB_STATE_FAILED',
          error: 'Test error'
        }
      }
    });

    const buffer = Buffer.from('test video');
    await expect(client.uploadVideo(buffer, 'video/mp4')).rejects.toThrow('Video upload failed: Test error');
  });

  test('should create video post successfully', async () => {
    const videoEmbed = new VideoEmbedImpl(
      'test video',
      videoBuffer,
      'video/mp4',
      1000,
      new BlobRef(mockCID, 'video/mp4', 1000)
    );

    const postUrl = await client.createPost(
      new Date(),
      'Test video post',
      videoEmbed
    );

    expect(postUrl).toContain('https://bsky.app/profile/test-user/post/123');
  });

  xtest('should handle video upload timeout', async () => {
    const mockAgent = jest.requireMock('@atproto/api').AtpAgent.mock.results[0].value;
    mockAgent.api.app.bsky.video.getJobStatus.mockResolvedValue({
      data: {
        jobStatus: {
          state: 'JOB_STATE_PROCESSING'
        }
      }
    });

    const buffer = Buffer.from('test video');
    await expect(client.uploadVideo(buffer, 'video/mp4')).rejects.toThrow('Video upload timed out');
  });
}); 