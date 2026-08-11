'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  WORLD,
  START,
  CHECKPOINTS,
  CHECKPOINT_RADIUS,
  POINTS_PER_CHECKPOINT,
  POINTS_PER_LAP,
  isOnTrack,
  clampCamera,
  drawTrack,
  drawCheckpoints,
  distance,
} from '@/lib/track';

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
    score: data.score ?? existing?.score ?? 0,
  };
}

export default function RaceRoom({ roomId }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const searchParams = useSearchParams();
  const playerColor = searchParams.get('color') || 'red';
  const playerName = searchParams.get('name') || 'Игрок';

  const playerIdRef = useRef(null);
  if (playerIdRef.current === null && typeof window !== 'undefined') {
    let id = sessionStorage.getItem('race-player-id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('race-player-id', id);
    }
    playerIdRef.current = id;
  }

  const carRef = useRef({
    x: START.x,
    y: START.y,
    angle: START.angle,
    speed: 0,
  });
  const keysRef = useRef({});
  const raceRef = useRef({
    nextCheckpoint: 1,
    laps: 0,
    score: 0,
    startTime: performance.now(),
  });
  const othersRef = useRef({});
  const connectedRef = useRef(false);
  const viewSizeRef = useRef({ width: 1200, height: 720 });

  const [displayScore, setDisplayScore] = useState(0);
  const [displayLaps, setDisplayLaps] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [playerCount, setPlayerCount] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      const width = Math.min(container.clientWidth, 1280);
      const height = Math.min(Math.floor(width * 0.62), window.innerHeight - 120);
      canvas.width = width;
      canvas.height = height;
      viewSizeRef.current = { width, height };
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const handleKeyDown = (e) => {
      keysRef.current[e.key] = true;
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.key] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const channel = supabase.channel(`race-room-${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: playerIdRef.current },
      },
    });

    channel.on('broadcast', { event: 'position' }, (payload) => {
      const data = payload.payload;
      if (data.id === playerIdRef.current) return;
      upsertOther(othersRef, data);
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const activeIds = new Set(Object.keys(state));

      Object.keys(othersRef.current).forEach((id) => {
        if (!activeIds.has(id)) {
          delete othersRef.current[id];
        }
      });
      setPlayerCount(activeIds.size);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        connectedRef.current = true;
        setConnectionStatus('connected');
        await channel.track({
          name: playerName,
          color: playerColor,
          online_at: new Date().toISOString(),
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        connectedRef.current = false;
        setConnectionStatus('error');
      }
    });

    let lastTime = performance.now();
    let animationId;
    let lastUiUpdate = 0;
    let lastNetworkSend = 0;

    function update(deltaTime) {
      const car = carRef.current;
      const keys = keysRef.current;
      const race = raceRef.current;

      const onTrack = isOnTrack(car.x, car.y);
      const acceleration = onTrack ? 280 : 160;
      const friction = onTrack ? 140 : 220;
      const turnSpeed = onTrack ? 2.8 : 1.8;
      const maxSpeed = onTrack ? 360 : 110;

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

      const turnFactor = Math.max(Math.abs(car.speed) / 360, 0.25);
      if (keys['ArrowLeft'] || keys['a']) car.angle -= turnSpeed * deltaTime * turnFactor;
      if (keys['ArrowRight'] || keys['d']) car.angle += turnSpeed * deltaTime * turnFactor;

      car.x += Math.cos(car.angle) * car.speed * deltaTime;
      car.y += Math.sin(car.angle) * car.speed * deltaTime;

      car.x = Math.max(20, Math.min(car.x, WORLD.width - 20));
      car.y = Math.max(20, Math.min(car.y, WORLD.height - 20));

      const target = CHECKPOINTS[race.nextCheckpoint];
      if (distance(car.x, car.y, target.x, target.y) < CHECKPOINT_RADIUS) {
        race.score += POINTS_PER_CHECKPOINT;
        race.nextCheckpoint++;

        if (race.nextCheckpoint >= CHECKPOINTS.length) {
          race.nextCheckpoint = 0;
          race.laps++;
          race.score += POINTS_PER_LAP;
        }
      }

      Object.values(othersRef.current).forEach((other) => {
        const lerpFactor = Math.min(deltaTime * 10, 1);
        other.x += (other.targetX - other.x) * lerpFactor;
        other.y += (other.targetY - other.y) * lerpFactor;
        other.angle += (other.targetAngle - other.angle) * lerpFactor;
      });
    }

    function drawCarAt(x, y, angle, color, name, score) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.fillRect(-16, -11, 32, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-10, -8, 14, 16);
      ctx.restore();

      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 42, y - 48, 84, 34);
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`${score} puan`, x, y - 30);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(name, x, y - 14);
    }

    function draw() {
      const car = carRef.current;
      const { width, height } = viewSizeRef.current;
      const camera = clampCamera(car.x - width / 2, car.y - height / 2, width, height);

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      drawTrack(ctx);
      drawCheckpoints(ctx, raceRef.current.nextCheckpoint);

      Object.values(othersRef.current).forEach((other) => {
        drawCarAt(other.x, other.y, other.angle, other.color, other.name, other.score ?? 0);
      });

      drawCarAt(car.x, car.y, car.angle, playerColor, playerName, raceRef.current.score);
      ctx.restore();
    }

    function loop(currentTime) {
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      update(deltaTime);
      draw();

      if (currentTime - lastUiUpdate > 100) {
        lastUiUpdate = currentTime;
        const race = raceRef.current;
        setDisplayScore(race.score);
        setDisplayLaps(race.laps);
        setDisplayTime((currentTime - race.startTime) / 1000);
      }

      if (connectedRef.current && currentTime - lastNetworkSend > 66) {
        lastNetworkSend = currentTime;
        const car = carRef.current;
        channel.send({
          type: 'broadcast',
          event: 'position',
          payload: {
            id: playerIdRef.current,
            x: car.x,
            y: car.y,
            angle: car.angle,
            color: playerColor,
            name: playerName,
            score: raceRef.current.score,
          },
        });
      }

      animationId = requestAnimationFrame(loop);
    }

    animationId = requestAnimationFrame(loop);

    return () => {
      connectedRef.current = false;
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [roomId, playerColor, playerName]);

  return (
    <div style={{ backgroundColor: 'black', minHeight: '100vh' }}>
      <div
        style={{
          color: 'white',
          padding: '1rem',
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0 }}>Комната: {roomId}</h1>
        <div>Puan: {displayScore}</div>
        <div>Tur: {displayLaps}</div>
        <div>Süre: {displayTime.toFixed(1)}s</div>
        <div>Oyuncu: {playerCount}</div>
        <div style={{ opacity: 0.7 }}>
          {connectionStatus === 'connected' && '🟢 Online'}
          {connectionStatus === 'connecting' && '🟡 Bağlanıyor...'}
          {connectionStatus === 'error' && '🔴 Bağlantı hatası'}
        </div>
      </div>
      <div ref={containerRef} style={{ width: '100%', maxWidth: '1280px', margin: '0 auto' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', backgroundColor: '#1a1a1a', borderRadius: '8px' }}
        />
      </div>
    </div>
  );
}
