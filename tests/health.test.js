const healthFunction = require('../health/index');

describe('Health Function', () => {
  let context;
  let req;

  beforeEach(() => {
    context = createMockContext();
    req = createMockRequest();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should return 200 status with health information', async () => {
    await healthFunction(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.headers['Content-Type']).toBe('application/json');
    expect(context.res.body).toHaveProperty('status', 'healthy');
    expect(context.res.body).toHaveProperty('timestamp');
    expect(typeof context.res.body.timestamp).toBe('string');
  });

  test('should log health check call', async () => {
    await healthFunction(context, req);

    expect(context.log).toHaveBeenCalledWith('Health check called');
  });

  test('should return valid ISO timestamp', async () => {
    await healthFunction(context, req);

    const timestamp = context.res.body.timestamp;
    const date = new Date(timestamp);

    expect(date.toISOString()).toBe(timestamp);
    expect(date.getTime()).not.toBeNaN();
  });

  test('should handle different HTTP methods', async () => {
    const postReq = createMockRequest({ method: 'POST' });

    await healthFunction(context, postReq);

    expect(context.res.status).toBe(200);
    expect(context.res.body.status).toBe('healthy');
  });
});
