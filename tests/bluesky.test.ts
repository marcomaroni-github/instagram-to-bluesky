import { BlueskyClient } from '../src/bluesky';

jest.mock('@atproto/api', () => ({
  AtpAgent: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    post: jest.fn().mockResolvedValue({ uri: 'test/uri/123' }),
    uploadBlob: jest.fn().mockResolvedValue({
      data: {
        blob: {
          ref: { $link: 'test-blob-ref' }
        }
      }
    })
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
    const blob = await client.uploadVideo(buffer);

    expect(blob.ref.$link).toBe('test-blob-ref');
  });

  test('should create video post successfully', async () => {
    const videoEmbed = {
      $type: 'app.bsky.embed.video',
      video: {
        $type: 'blob',
        ref: { $link: 'test-ref' },
        mimeType: 'video/mp4',
        size: 1000
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
}); 