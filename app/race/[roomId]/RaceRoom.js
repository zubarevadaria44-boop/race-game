'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getWsUrl } from '@/lib/ws';

const TRACK = {
  centerX: 400,
  centerY: 300,
  outerRx: 350,
  outerRy: 250,
  innerRx: 150,
  innerRy: 100,
};

const CHECKPOINTS = [
  { x: 400, y: 50 },
  { x: 750, y: 300 },
  { x: 400, y: 550 },
  { x: 50, y: 300 },
];

const CHECKPOINT_RADIUS = 60;

function isOnTrack(x, y) {
  const outerVal =
    (x - TRACK.centerX) ** 2 / TRACK.outerRx ** 2 +
    (y - TRACK.centerY) ** 2 / TRACK.outerRy ** 2;
  const innerVal =
    (x - TRACK.centerX) ** 2 / TRACK.innerRx ** 2 +
    (y - TRACK.centerY) ** 2 / TRACK.innerRy ** 2;
  return outerVal <= 1 && innerVal >= 1;
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function upsertOther(othersRef, data) {
  const existing = othersRef.current[data.id];
  othersRef.current[data.id] = {
    x: existing ? existing.x : data.x,
    y: existing ? existing.y : data.y,
    angle: existing ? existing.angle : data.angle,
    targetX: data.x,
    targetY: data.y,
    targetAngle: data.angle,
    color: data.color,
    name: data.name,
  };
}

function updatePlayerCount(othersRef, setPlayerCount) {
  setPlayerCount(Object.keys(othersRef.current).length + 1);
}

export default function RaceRoom({ roomId }) {
  const canvasRef = useRef(null);
  const searchParams = useSearchParams();
  const playerColor = searchParams.get('color') || 'red';
  const playerName = searchParams.get('name') || 'Игрок';

  const playerIdRef = useRef(null);
  if (playerIdRef.current === null) {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('race-player-id');
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('race-player-id', id);
      }
      playerIdRef.current = id;
    }
  }

  const carRef = useRef({
    x: 400,
    y: 50,
    angle: 0,
    speed: 0,
  });
  const keysRef = useRef({});
  const raceRef = useRef({
    nextCheckpoint: 0,
    laps: 0,
    startTime: performance.now(),
  });
  const othersRef = useRef({});
  const wsRef = useRef(null);

  const [displayLaps, setDisplayLaps] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [playerCount, setPlayerCount] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let closed = false;

    const handleKeyDown = (e) => {
      keysRef.current[e.key] = true;
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.key] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    function handleMessage(event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.id === playerIdRef.current) return;

      if (data.type === 'sync') {
        data.players.forEach((player) => upsertOther(othersRef, player));
        updatePlayerCount(othersRef, setPlayerCount);
        return;
      }

      if (data.type === 'join') {
        upsertOther(othersRef, data);
        updatePlayerCount(othersRef, setPlayerCount);
        return;
      }

      if (data.type === 'leave') {
        delete othersRef.current[data.id];
        updatePlayerCount(othersRef, setPlayerCount);
        return;
      }

      if (data.type === 'position') {
        upsertOther(othersRef, data);
      }
    }

    function connect() {
      if (closed || !playerIdRef.current) return;

      const ws = new WebSocket(getWsUrl(roomId, playerIdRef.current));
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        const car = carRef.current;
        ws.send(
          JSON.stringify({
            type: 'join',
            name: playerName,
            color: playerColor,
            x: car.x,
            y: car.y,
            angle: car.angle,
          }),
        );
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        setConnectionStatus('reconnecting');
        if (!closed) {
          setTimeout(connect, 1000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    let lastTime = performance.now();
    let animationId;
    let lastUiUpdate = 0;
    let lastNetworkSend = 0;

    function update(deltaTime) {
      const car = carRef.current;
      const keys = keysRef.current;
      const race = raceRef.current;

      const acceleration = 300;
      const friction = 150;
      const turnSpeed = 3;

      const onTrack = isOnTrack(car.x, car.y);
      const maxSpeed = onTrack ? 400 : 200;

      if (keys['ArrowUp'] || keys['w']) car.speed += acceleration * deltaTime;
      if (keys['ArrowDown'] || keys['s']) car.speed -= acceleration * deltaTime;

      if (car.speed > maxSpeed) car.speed = maxSpeed;
      if (car.speed < -maxSpeed / 2) car.speed = -maxSpeed / 2;

      if (car.speed > 0) {
        car.speed -= friction * deltaTime;
        if (car.speed < 0) car.speed = 0;
      } else if (car.speed < 0) {
        car.speed += friction * deltaTime;
        if (car.speed > 0) car.speed = 0;
      }

      if (keys['ArrowLeft'] || keys['a']) car.angle -= turnSpeed * deltaTime * (car.speed / 400);
      if (keys['ArrowRight'] || keys['d']) car.angle += turnSpeed * deltaTime * (car.speed / 400);

      car.x += Math.cos(car.angle) * car.speed * deltaTime;
      car.y += Math.sin(car.angle) * car.speed * deltaTime;

      const target = CHECKPOINTS[race.nextCheckpoint];
      const dist = distance(car.x, car.y, target.x, target.y);
      if (dist < CHECKPOINT_RADIUS) {
        race.nextCheckpoint++;
        if (race.nextCheckpoint >= CHECKPOINTS.length) {
          race.nextCheckpoint = 0;
          race.laps++;
        }
      }

      Object.values(othersRef.current).forEach((other) => {
        const lerpFactor = Math.min(deltaTime * 10, 1);
        other.x += (other.targetX - other.x) * lerpFactor;
        other.y += (other.targetY - other.y) * lerpFactor;
        other.angle += (other.targetAngle - other.angle) * lerpFactor;
      });
    }

    function drawTrack() {
      ctx.fillStyle = '#3a5a3a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.ellipse(TRACK.centerX, TRACK.centerY, TRACK.outerRx, TRACK.outerRy, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#555';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(TRACK.centerX, TRACK.centerY, TRACK.innerRx, TRACK.innerRy, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#3a5a3a';
      ctx.fill();
    }

    function drawCheckpoints() {
      const race = raceRef.current;
      CHECKPOINTS.forEach((cp, index) => {
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, CHECKPOINT_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = index === race.nextCheckpoint ? 'yellow' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    }

    function drawCarAt(x, y, angle, color, name) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.fillRect(-15, -10, 30, 20);
      ctx.restore();

      if (name) {
        ctx.fillStyle = 'white';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(name, x, y - 20);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawTrack();
      drawCheckpoints();

      Object.values(othersRef.current).forEach((other) => {
        drawCarAt(other.x, other.y, other.angle, other.color, other.name);
      });

      const car = carRef.current;
      drawCarAt(car.x, car.y, car.angle, playerColor, playerName);
    }

    function loop(currentTime) {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      update(deltaTime);
      draw();

      if (currentTime - lastUiUpdate > 100) {
        lastUiUpdate = currentTime;
        setDisplayLaps(raceRef.current.laps);
        setDisplayTime((currentTime - raceRef.current.startTime) / 1000);
      }

      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && currentTime - lastNetworkSend > 66) {
        lastNetworkSend = currentTime;
        const car = carRef.current;
        ws.send(
          JSON.stringify({
            type: 'position',
            id: playerIdRef.current,
            x: car.x,
            y: car.y,
            angle: car.angle,
            color: playerColor,
            name: playerName,
          }),
        );
      }

      animationId = requestAnimationFrame(loop);
    }

    animationId = requestAnimationFrame(loop);

    return () => {
      closed = true;
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      wsRef.current?.close();
    };
  }, [roomId, playerColor, playerName]);

  return (
    <div style={{ backgroundColor: 'black', minHeight: '100vh' }}>
      <div style={{ color: 'white', padding: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <h1>Комната: {roomId}</h1>
        <div>Круги: {displayLaps}</div>
        <div>Время: {displayTime.toFixed(1)}с</div>
        <div>Игроков: {playerCount}</div>
        <div style={{ opacity: 0.7 }}>
          {connectionStatus === 'connected' ? '🟢 Online' : '🟡 Подключение...'}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ display: 'block', margin: '0 auto', backgroundColor: '#333' }}
      />
    </div>
  );
}
