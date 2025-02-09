import { BlueskyClient } from '../src/bluesky';

jest.mock('@atproto/api', () => ({
  AtpAgent: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    post: jest.fn().mockResolvedValue({ uri: 'test/uri/123' }),
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

  beforeEach(() => {
    client = new BlueskyClient('test-user', 'test-pass');
  });

  test('should create post successfully', async () => {
    const postUrl = await client.createPost(
      new Date(),
      'Test post',
      []
    );

    expect(postUrl).toContain('https://bsky.app/profile/test-user/post/');
  });

  test('should upload video successfully', async () => {
    const buffer = Buffer.from('test video');
    const blob = await client.uploadVideo(buffer, 'video/mp4');

    expect(blob).toBeDefined();
    expect(blob.ref.$link).toBe('test-blob-ref');
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
    const videoEmbed = {
      $type: 'app.bsky.embed.video',
      video: {
        $type: 'blob',
        ref: { $link: '' }, // Empty ref to trigger upload
        mimeType: 'video/mp4',
        size: 1000,
        buffer: Buffer.from('test video') // Add buffer for upload
      },
      aspectRatio: { width: 640, height: 480 }
    };

    const postUrl = await client.createPost(
      new Date(),
      'Test video post',
      videoEmbed
    );

    expect(postUrl).toContain('https://bsky.app/profile/test-user/post/');
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