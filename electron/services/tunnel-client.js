class TunnelClient {
  constructor() {
    this.timeout = 30000;
  }

  async forwardRequest(request) {
    const { localPort, method, path, headers, body } = request;
    const url = `http://localhost:${localPort}${path}`;

    // Decode base64 body if present
    const bodyBuffer = body ? Buffer.from(body, 'base64') : undefined;

    // Filter out problematic headers
    const filteredHeaders = { ...headers };
    delete filteredHeaders['Host'];
    delete filteredHeaders['host'];
    delete filteredHeaders['Connection'];
    delete filteredHeaders['connection'];
    delete filteredHeaders['Content-Length'];
    delete filteredHeaders['content-length'];

    try {
      const response = await fetch(url, {
        method,
        headers: filteredHeaders,
        body: method !== 'GET' && method !== 'HEAD' ? bodyBuffer : undefined,
        signal: AbortSignal.timeout(this.timeout),
      });

      const respBuffer = await response.arrayBuffer();
      const respBody = Buffer.from(respBuffer).toString('base64');

      const respHeaders = {};
      response.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      return {
        requestId: request.requestId,
        statusCode: response.status,
        headers: respHeaders,
        body: respBody,
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        statusCode: 502,
        headers: {},
        body: '',
        error: error.message,
      };
    }
  }
}

module.exports = { TunnelClient };
