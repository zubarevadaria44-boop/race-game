const { WebSocketServer } = require('ws');

const PORT = process.env.WS_PORT || 3001;
const wss = new WebSocketServer({ port: PORT });

/** @type {Map<string, Map<string, { ws: import('ws').WebSocket, name: string, color: string, x: number, y: number, angle: number }>>} */
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
}

function broadcast(roomId, exceptWs, data) {
  const room = rooms.get(roomId);
  if (!room) return;

  const message = JSON.stringify(data);
  for (const player of room.values()) {
    if (player.ws !== exceptWs && player.ws.readyState === 1) {
      player.ws.send(message);
    }
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');
  const playerId = url.searchParams.get('id');

  if (!roomId || !playerId) {
    ws.close(4000, 'room and id required');
    return;
  }

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const room = getRoom(roomId);

    if (data.type === 'join') {
      const player = {
        ws,
        name: data.name,
        color: data.color,
        x: data.x ?? 400,
        y: data.y ?? 50,
        angle: data.angle ?? 0,
      };
      room.set(playerId, player);

      const others = [];
      for (const [id, p] of room) {
        if (id !== playerId) {
          others.push({
            id,
            name: p.name,
            color: p.color,
            x: p.x,
            y: p.y,
            angle: p.angle,
          });
        }
      }

      if (others.length > 0) {
        ws.send(JSON.stringify({ type: 'sync', players: others }));
      }

      broadcast(roomId, ws, {
        type: 'join',
        id: playerId,
        name: player.name,
        color: player.color,
        x: player.x,
        y: player.y,
        angle: player.angle,
      });
      return;
    }

    if (data.type === 'position') {
      const player = room.get(playerId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        player.angle = data.angle;
      }
      broadcast(roomId, ws, data);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.delete(playerId);
    if (room.size === 0) {
      rooms.delete(roomId);
    } else {
      broadcast(roomId, null, { type: 'leave', id: playerId });
    }
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
