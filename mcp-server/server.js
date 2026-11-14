const {
  listFutureEvents,
  listMyRegistrations,
  getEventSummary,
  registerForEvent,
  cancelRegistration,
  RegistrationConflictError,
  NotFoundError,
} = require('../services/registrationService');

const upcomingEventsTool = {
  name: 'upcoming_events',
  description: 'Lists future club events with the remaining free places for each event.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

const myRegistrationsTool = {
  name: 'my_registrations',
  description: 'Shows the signed-in member only their own registrations and event names.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'integer', description: 'The signed-in member id.' },
      token: { type: 'string', description: 'Session token for this user.' },
    },
    required: ['userId', 'token'],
    additionalProperties: false,
  },
};

const registerTool = {
  name: 'register',
  description: 'Registers a member for an event and refuses a request that is already full.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'integer', description: 'The member signing up.' },
      eventId: { type: 'integer', description: 'The event to sign up for.' },
      token: { type: 'string', description: 'Session token for the member.' },
    },
    required: ['userId', 'eventId', 'token'],
    additionalProperties: false,
  },
};

const clubEventDetailsTool = {
  name: 'club_event_details',
  description: 'Returns the selected event title, date, place and remaining capacity.',
  inputSchema: {
    type: 'object',
    properties: {
      eventId: { type: 'integer', description: 'The event id to inspect.' },
    },
    required: ['eventId'],
    additionalProperties: false,
  },
};

function sendResponse(requestId, payload) {
  if (requestId === undefined || requestId === null) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, ...payload })}\n`);
}

function sendError(requestId, code, message) {
  if (requestId === undefined || requestId === null) return;
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: requestId, error: { code, message } })}\n`,
  );
}

function makeToolResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

function authorizeUser(callArgs = {}) {
  const token = callArgs.token || '';
  if (process.env.MCP_TOKEN && token !== process.env.MCP_TOKEN) {
    return null;
  }
  const userId = Number(callArgs.userId ?? 1);
  if (!Number.isInteger(userId) || userId < 1) {
    return null;
  }
  return { id: userId, email: callArgs.email || `member${userId}@club.test` };
}

function handleToolsCall(requestId, args = {}) {
  const { name, arguments: callArgs = {} } = args;

  if (name === 'upcoming_events') {
    return sendResponse(requestId, {
      result: makeToolResult(JSON.stringify(listFutureEvents(), null, 2)),
    });
  }

  if (name === 'my_registrations') {
    const user = authorizeUser(callArgs);
    if (!user) {
      return sendResponse(requestId, {
        result: makeToolResult('The caller is not authorized to read registrations.', true),
      });
    }

    return sendResponse(requestId, {
      result: makeToolResult(JSON.stringify(listMyRegistrations(user.id), null, 2)),
    });
  }

  if (name === 'register') {
    const user = authorizeUser(callArgs);
    if (!user) {
      return sendResponse(requestId, {
        result: makeToolResult('The caller is not authorized to register.', true),
      });
    }

    const eventId = Number(callArgs.eventId ?? callArgs.event_id);
    try {
      const result = registerForEvent(user.id, eventId);
      return sendResponse(requestId, {
        result: makeToolResult(JSON.stringify(result, null, 2)),
      });
    } catch (error) {
      const message = error instanceof RegistrationConflictError ? error.message : 'Registration failed';
      return sendResponse(requestId, {
        result: makeToolResult(message, true),
      });
    }
  }

  if (name === 'club_event_details') {
    const eventId = Number(callArgs.eventId ?? callArgs.event_id);
    try {
      const event = getEventSummary(eventId);
      return sendResponse(requestId, {
        result: makeToolResult(JSON.stringify(event, null, 2)),
      });
    } catch (error) {
      return sendResponse(requestId, {
        result: makeToolResult(error instanceof NotFoundError ? 'Event not found.' : 'Unavailable', true),
      });
    }
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
          name: 'club-events-mcp-server',
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
        tools: [upcomingEventsTool, myRegistrationsTool, registerTool, clubEventDetailsTool],
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
      // Ignore malformed payloads sent during protocol tests.
    }
  }
});

stdin.on('end', () => {
  if (buffer.trim()) {
    try {
      const message = JSON.parse(buffer);
      handleRequest(message);
    } catch (error) {
      // Ignore trailing malformed payloads.
    }
  }
});
