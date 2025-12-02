module.exports = async function (context) {
  context.log('Health check called');

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      status: 'healthy',
      timestamp: new Date().toISOString()
    }
  };
};
