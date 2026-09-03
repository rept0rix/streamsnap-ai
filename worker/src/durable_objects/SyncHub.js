export class SyncHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      // Allow internal POST requests to broadcast state changes
      if (request.method === "POST") {
        try {
          const body = await request.json();
          this.broadcast(body);
          return new Response("Broadcasted", { status: 200 });
        } catch (e) {
          return new Response(e.message, { status: 400 });
        }
      }
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];
    
    // Accept the WebSocket connection
    server.accept();
    
    // Register the session
    const session = { webSocket: server };
    this.sessions.push(session);
    
    // Handle disconnects
    server.addEventListener("close", () => {
      this.sessions = this.sessions.filter(s => s !== session);
    });
    
    server.addEventListener("error", () => {
      this.sessions = this.sessions.filter(s => s !== session);
    });
    
    // Handle incoming messages
    server.addEventListener("message", (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
        } else if (data.type === "broadcast") {
          this.broadcast(data.payload);
        }
      } catch (err) {
        // Ignore parse errors
      }
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
  
  broadcast(msg) {
    const data = JSON.stringify(msg);
    this.sessions.forEach(session => {
      try {
        session.webSocket.send(data);
      } catch (err) {
        // Will be cleaned up by close/error
      }
    });
  }
}
