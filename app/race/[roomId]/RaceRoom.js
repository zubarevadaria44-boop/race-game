'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  getTrack,
  CHECKPOINT_RADIUS,
  POINTS_PER_CHECKPOINT,
  POINTS_PER_LAP,
  clampCamera,
  drawMinimap,
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
  const playerName = searchParams.get('name') || 'Oyuncu';
  const trackId = searchParams.get('track') || 'forest';
  const trackName = getTrack(trackId).name;

  const playerIdRef = useRef(null);
  if (playerIdRef.current === null && typeof window !== 'undefined') {
    let id = sessionStorage.getItem('race-player-id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('race-player-id', id);
    }
    playerIdRef.current = id;
  }

  const carRef = useRef(null);
  if (!carRef.current) {
    const start = getTrack(trackId).start;
    carRef.current = { x: start.x, y: start.y, angle: start.angle, speed: 0 };
  }
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
    const track = getTrack(trackId);

    carRef.current = {
      x: track.start.x,
      y: track.start.y,
      angle: track.start.angle,
      speed: 0,
    };
    raceRef.current = {
      nextCheckpoint: 1,
      laps: 0,
      score: 0,
      startTime: performance.now(),
    };
    othersRef.current = {};

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

    const channel = supabase.channel(`race-room-${roomId}-${track.id}`, {
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
          track: track.id,
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

      const onTrack = track.isOnTrack(car.x, car.y);
      const acceleration = onTrack ? 420 : 280;
      const friction = onTrack ? 110 : 85;
      const turnSpeed = onTrack ? 3.4 : 2.6;
      const maxSpeed = onTrack ? 520 : 240;

      if (keys['ArrowUp'] || keys['w']) car.speed += acceleration * deltaTime;
      if (keys['ArrowDown'] || keys['s']) car.speed -= acceleration * deltaTime;

      if (car.speed > maxSpeed) car.speed = maxSpeed;
      if (car.speed < -maxSpeed / 2) car.speed = -maxSpeed / 2;

      const throttleHeld = keys['ArrowUp'] || keys['w'] || keys['ArrowDown'] || keys['s'];
      if (!throttleHeld) {
        if (car.speed > 0) {
          car.speed -= friction * deltaTime;
          if (car.speed < 0) car.speed = 0;
        } else if (car.speed < 0) {
          car.speed += friction * deltaTime;
          if (car.speed > 0) car.speed = 0;
        }
      } else if (Math.abs(car.speed) > 0) {
        const drag = friction * 0.35 * deltaTime;
        if (car.speed > 0) car.speed = Math.max(0, car.speed - drag);
        else car.speed = Math.min(0, car.speed + drag);
      }

      const turnFactor = Math.max(Math.abs(car.speed) / 420, 0.35);
      if (keys['ArrowLeft'] || keys['a']) car.angle -= turnSpeed * deltaTime * turnFactor;
      if (keys['ArrowRight'] || keys['d']) car.angle += turnSpeed * deltaTime * turnFactor;

      car.x += Math.cos(car.angle) * car.speed * deltaTime;
      car.y += Math.sin(car.angle) * car.speed * deltaTime;

      car.x = Math.max(20, Math.min(car.x, track.world.width - 20));
      car.y = Math.max(20, Math.min(car.y, track.world.height - 20));

      const target = track.checkpoints[race.nextCheckpoint];
      if (distance(car.x, car.y, target.x, target.y) < CHECKPOINT_RADIUS) {
        race.score += POINTS_PER_CHECKPOINT;
        race.nextCheckpoint++;

        if (race.nextCheckpoint >= track.checkpoints.length) {
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
      const camera = clampCamera(car.x - width / 2, car.y - height / 2, width, height, track.world);

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      track.drawTrack(ctx);
      track.drawCheckpoints(ctx, raceRef.current.nextCheckpoint);

      Object.values(othersRef.current).forEach((other) => {
        drawCarAt(other.x, other.y, other.angle, other.color, other.name, other.score ?? 0);
      });

      drawCarAt(car.x, car.y, car.angle, playerColor, playerName, raceRef.current.score);
      ctx.restore();

      drawMinimap(ctx, track, camera, { width, height }, car, othersRef.current, playerColor);
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
  }, [roomId, playerColor, playerName, trackId]);

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
        <h1 style={{ margin: 0 }}>Oda: {roomId}</h1>
        <div>{trackName}</div>
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
