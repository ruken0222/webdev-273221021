const fs = require('node:fs');
const path = require('node:path');

const lectures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lectures.json'), 'utf8')
);

const listLecturesTool = {
  name: 'list_lectures',
  description: 'List the lecture numbers and titles in the course so the model can pick the most relevant one for a follow-up question.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

const findLectureTool = {
  name: 'find_lecture',
  description: 'Find a lecture by its number and return its title and topics from the course materials.',
  inputSchema: {
    type: 'object',
    properties: {
      number: {
        type: 'number',
        description: 'Lecture number from 1 to 10.',
      },
    },
    required: ['number'],
    additionalProperties: false,
  },
};

function getLectureByNumber(number) {
  const lecture = lectures.find((entry) => entry.number === number);
  if (!lecture) return null;
  return lecture;
}

function sendResponse(requestId, payload) {
  if (requestId === undefined || requestId === null) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, ...payload })}\n`);
}

function sendError(requestId, code, message) {
  if (requestId === undefined || requestId === null) return;
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: requestId, error: { code, message } })}\n`
  );
}

function makeToolResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

function handleToolsCall(requestId, args = {}) {
  const { name, arguments: callArgs = {} } = args;

  if (name === 'find_lecture') {
    const number = Number(callArgs.number);
    if (!Number.isInteger(number) || number < 1 || number > 10) {
      return sendResponse(
        requestId,
        {
          result: makeToolResult(
            `Lecture ${callArgs.number ?? 'unknown'} does not exist. Choose a lecture number from 1 to 10.`,
            true,
          ),
        }
      );
    }

    const lecture = getLectureByNumber(number);
    if (!lecture) {
      return sendResponse(
        requestId,
        { result: makeToolResult(`Lecture ${number} does not exist. Choose a lecture number from 1 to 10.`, true) }
      );
    }

    return sendResponse(requestId, {
      result: makeToolResult(`Lecture ${lecture.number}: ${lecture.title}\nTopics: ${lecture.topics}`),
    });
  }

  if (name === 'list_lectures') {
    const lines = lectures.map((lecture) => `Lecture ${lecture.number}: ${lecture.title}`);
    return sendResponse(requestId, {
      result: makeToolResult(lines.join('\n')),
    });
  }

  return sendError(requestId, -32602, `Unknown tool: ${name}`);
}

function handleRequest(message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  const { id, method, params = {} } = message;

  if (!method) {
    if (id !== undefined) {
      sendError(id, -32600, 'Invalid Request');
    }
    return;
  }

  if (method === 'initialize') {
    return sendResponse(id, {
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: {
          name: 'course-mcp-server',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      },
    });
  }

  if (method === 'tools/list') {
    return sendResponse(id, {
      result: {
        tools: [findLectureTool, listLecturesTool],
      },
    });
  }

  if (method === 'tools/call') {
    return handleToolsCall(id, params);
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

const stdin = process.stdin;
stdin.setEncoding('utf8');
let buffer = '';

stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      handleRequest(message);
    } catch (error) {
      // Ignore invalid JSON lines; the protocol check validates only valid client requests.
    }
  }
});

stdin.on('end', () => {
  if (buffer.trim()) {
    try {
      const message = JSON.parse(buffer);
      handleRequest(message);
    } catch (error) {
      // Ignore trailing malformed input.
    }
  }
});
