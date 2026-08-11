export function getWsUrl(roomId, playerId) {
  const base = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
  const params = new URLSearchParams({ room: roomId, id: playerId });
  return `${base}?${params.toString()}`;
}
