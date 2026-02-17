class GraphQLClient {
  constructor() {
    this.timeout = 30000; // 30 seconds
  }

  async execute(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const startTime = performance.now();

    try {
      // Build GraphQL request body
      const body = {
        query: request.query,
      };

      if (request.variables) {
        try {
          body.variables = JSON.parse(request.variables);
        } catch {
          // If variables is not valid JSON, skip it
        }
      }

      if (request.operationName) {
        body.operationName = request.operationName;
      }

      const response = await fetch(request.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...request.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const elapsed = Math.round(performance.now() - startTime);

      // Extract headers
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Read response as text
      const rawBody = await response.text();
      const size = rawBody.length;

      // Parse GraphQL response
      let data, errors, extensions;
      try {
        const parsed = JSON.parse(rawBody);
        data = parsed.data;
        errors = parsed.errors;
        extensions = parsed.extensions;
      } catch {
        // Response is not valid JSON
      }

      return {
        statusCode: response.status,
        statusText: response.statusText,
        data,
        errors,
        extensions,
        time: elapsed,
        size,
        headers,
        rawBody,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = { GraphQLClient };
