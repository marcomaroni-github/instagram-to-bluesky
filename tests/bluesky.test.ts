import { BlueskyClient } from '../src/bluesky';

jest.mock('@atproto/api', () => ({
  AtpAgent: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    post: jest.fn().mockResolvedValue({ uri: 'test/uri/123' })
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
}); 