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
  drawPowerups,
  distance,
} from '@/lib/track';
import {
  CAR_RADIUS,
  PICKUP_RADIUS,
  ROCKET_HIT_RADIUS,
  PICKUP_RESPAWN,
  MAX_ROCKETS,
  BOOST_DURATION,
  BOOST_MULTIPLIER,
  resolveCarCollision,
  isStunned,
  applyStun,
  createRocket,
  updateRocket,
  createExplosion,
} from '@/lib/gameplay';

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
    stunnedUntil: data.stunnedUntil ?? existing?.stunnedUntil ?? 0,
  };
}

export default function RaceRoom({ roomId }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const searchParams = useSearchParams();
  const playerColor = searchParams.get('color') || 'red';
  const playerName = searchParams.get('name') || 'Player';
  const trackId = searchParams.get('track') || 'forest';
  const collisionsEnabled = searchParams.get('collisions') !== '0';
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
    carRef.current = { x: start.x, y: start.y, angle: start.angle, speed: 0, stunnedUntil: 0, boostedUntil: 0 };
  }

  const keysRef = useRef({});
  const raceRef = useRef({ nextCheckpoint: 1, laps: 0, score: 0, startTime: performance.now() });
  const othersRef = useRef({});
  const connectedRef = useRef(false);
  const viewSizeRef = useRef({ width: 1200, height: 720 });
  const rocketsRef = useRef([]);
  const explosionsRef = useRef([]);
  const pickupStateRef = useRef({});
  const rocketsAmmoRef = useRef(0);
  const spacePressedRef = useRef(false);

  const [displayScore, setDisplayScore] = useState(0);
  const [displayLaps, setDisplayLaps] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [displayRockets, setDisplayRockets] = useState(0);
  const [playerCount, setPlayerCount] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    const track = getTrack(trackId);

    carRef.current = {
      x: track.start.x,
      y: track.start.y,
      angle: track.start.angle,
      speed: 0,
      stunnedUntil: 0,
      boostedUntil: 0,
    };
    raceRef.current = { nextCheckpoint: 1, laps: 0, score: 0, startTime: performance.now() };
    othersRef.current = {};
    rocketsRef.current = [];
    explosionsRef.current = [];
    rocketsAmmoRef.current = 0;
    pickupStateRef.current = Object.fromEntries(
      track.rocketPickups.map((p) => [p.id, { active: true, respawnAt: 0 }]),
    );

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

    function tryFireRocket() {
      if (rocketsAmmoRef.current <= 0) return;
      const car = carRef.current;
      const now = performance.now();
      if (isStunned(car, now)) return;

      rocketsAmmoRef.current -= 1;
      const rocket = createRocket(
        car.x + Math.cos(car.angle) * 28,
        car.y + Math.sin(car.angle) * 28,
        car.angle,
        playerIdRef.current,
      );
      rocketsRef.current.push(rocket);

      if (connectedRef.current) {
        channel.send({
          type: 'broadcast',
          event: 'rocket',
          payload: {
            id: rocket.id,
            x: rocket.x,
            y: rocket.y,
            angle: rocket.angle,
            ownerId: playerIdRef.current,
          },
        });
      }
    }

    const handleKeyDown = (e) => {
      keysRef.current[e.key] = true;
      if (e.code === 'Space' && !spacePressedRef.current) {
        spacePressedRef.current = true;
        e.preventDefault();
        tryFireRocket();
      }
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.key] = false;
      if (e.code === 'Space') spacePressedRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const channel = supabase.channel(
      `race-room-${roomId}-${track.id}-${collisionsEnabled ? 'col' : 'noc'}`,
      {
        config: {
          broadcast: { self: false },
          presence: { key: playerIdRef.current },
        },
      },
    );

    channel.on('broadcast', { event: 'position' }, (payload) => {
      const data = payload.payload;
      if (data.id === playerIdRef.current) return;
      upsertOther(othersRef, data);
    });

    channel.on('broadcast', { event: 'rocket' }, (payload) => {
      const data = payload.payload;
      if (data.ownerId === playerIdRef.current) return;
      if (rocketsRef.current.some((r) => r.id === data.id)) return;
      rocketsRef.current.push({ ...data, speed: 680 });
    });

    channel.on('broadcast', { event: 'hit' }, (payload) => {
      const data = payload.payload;
      const now = performance.now();

      if (data.targetId === playerIdRef.current) {
        applyStun(carRef.current, now);
      }
      if (othersRef.current[data.targetId]) {
        applyStun(othersRef.current[data.targetId], now);
      }
      explosionsRef.current.push(createExplosion(data.x, data.y));
    });

    channel.on('broadcast', { event: 'pickup' }, (payload) => {
      const { pickupId, respawnAt } = payload.payload;
      pickupStateRef.current[pickupId] = { active: false, respawnAt };
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const activeIds = new Set(Object.keys(state));
      Object.keys(othersRef.current).forEach((id) => {
        if (!activeIds.has(id)) delete othersRef.current[id];
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
          collisions: collisionsEnabled,
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

    function collectPickups(now) {
      const car = carRef.current;

      track.rocketPickups.forEach((pickup) => {
        const state = pickupStateRef.current[pickup.id];
        if (!state.active && now >= state.respawnAt) {
          state.active = true;
        }
        if (!state.active) return;
        if (distance(car.x, car.y, pickup.x, pickup.y) > PICKUP_RADIUS) return;
        if (rocketsAmmoRef.current >= MAX_ROCKETS) return;

        rocketsAmmoRef.current += 1;
        state.active = false;
        state.respawnAt = now + PICKUP_RESPAWN * 1000;

        if (connectedRef.current) {
          channel.send({
            type: 'broadcast',
            event: 'pickup',
            payload: { pickupId: pickup.id, respawnAt: state.respawnAt },
          });
        }
      });

      track.boostPads.forEach((pad) => {
        if (distance(car.x, car.y, pad.x, pad.y) < 46) {
          car.boostedUntil = now + BOOST_DURATION * 1000;
        }
      });
    }

    function updateRockets(now, deltaTime) {
      const car = carRef.current;

      rocketsRef.current = rocketsRef.current.filter((rocket) => {
        const alive = updateRocket(rocket, deltaTime, track.world);

        if (rocket.ownerId === playerIdRef.current) {
          if (distance(rocket.x, rocket.y, car.x, car.y) < ROCKET_HIT_RADIUS) return alive;

          for (const [id, other] of Object.entries(othersRef.current)) {
            if (distance(rocket.x, rocket.y, other.x, other.y) < ROCKET_HIT_RADIUS) {
              applyStun(other, now);
              explosionsRef.current.push(createExplosion(rocket.x, rocket.y));
              if (connectedRef.current) {
                channel.send({
                  type: 'broadcast',
                  event: 'hit',
                  payload: { targetId: id, x: rocket.x, y: rocket.y, shooterId: playerIdRef.current },
                });
              }
              return false;
            }
          }
        }

        if (rocket.ownerId !== playerIdRef.current && distance(rocket.x, rocket.y, car.x, car.y) < ROCKET_HIT_RADIUS) {
          applyStun(car, now);
          explosionsRef.current.push(createExplosion(rocket.x, rocket.y));
          return false;
        }

        return alive;
      });

      explosionsRef.current = explosionsRef.current.filter(
        (ex) => now - ex.bornAt < ex.duration,
      );
    }

    function updateCollisions() {
      if (!collisionsEnabled) return;
      const car = carRef.current;
      Object.values(othersRef.current).forEach((other) => {
        resolveCarCollision(car, other);
      });
    }

    function update(deltaTime) {
      const car = carRef.current;
      const keys = keysRef.current;
      const race = raceRef.current;
      const now = performance.now();
      const stunned = isStunned(car, now);
      const boosted = car.boostedUntil && now < car.boostedUntil;

      collectPickups(now);

      const onTrack = track.isOnTrack(car.x, car.y);
      const acceleration = onTrack ? 420 : 280;
      const friction = onTrack ? 110 : 85;
      const turnSpeed = onTrack ? 3.4 : 2.6;
      let maxSpeed = onTrack ? 520 : 240;
      if (boosted) maxSpeed *= BOOST_MULTIPLIER;

      if (!stunned) {
        if (keys['ArrowUp'] || keys['w']) car.speed += acceleration * deltaTime;
        if (keys['ArrowDown'] || keys['s']) car.speed -= acceleration * deltaTime;

        const turnFactor = Math.max(Math.abs(car.speed) / 420, 0.35);
        if (keys['ArrowLeft'] || keys['a']) car.angle -= turnSpeed * deltaTime * turnFactor;
        if (keys['ArrowRight'] || keys['d']) car.angle += turnSpeed * deltaTime * turnFactor;
      } else {
        car.angle += deltaTime * 8;
      }

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

      car.x += Math.cos(car.angle) * car.speed * deltaTime;
      car.y += Math.sin(car.angle) * car.speed * deltaTime;

      car.x = Math.max(CAR_RADIUS, Math.min(car.x, track.world.width - CAR_RADIUS));
      car.y = Math.max(CAR_RADIUS, Math.min(car.y, track.world.height - CAR_RADIUS));

      updateCollisions();

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

      updateRockets(now, deltaTime);
    }

    function drawCarAt(x, y, angle, color, name, score, stunned, boosted) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      if (stunned) ctx.filter = 'hue-rotate(180deg) brightness(1.3)';
      if (boosted) {
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 16;
      }
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
      ctx.fillText(`${score} pts`, x, y - 30);
      ctx.fillStyle = stunned ? '#ff6b6b' : '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(stunned ? '💫 Stunned!' : name, x, y - 14);
    }

    function drawRocket(r) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.angle);
      ctx.fillStyle = '#ff4500';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -6);
      ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.arc(-10, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawExplosion(ex, now) {
      const t = (now - ex.bornAt) / ex.duration;
      const radius = 12 + t * 40;
      ctx.fillStyle = `rgba(255, ${120 - t * 80}, 0, ${1 - t})`;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function draw() {
      const car = carRef.current;
      const now = performance.now();
      const { width, height } = viewSizeRef.current;
      const camera = clampCamera(car.x - width / 2, car.y - height / 2, width, height, track.world);

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      track.drawTrack(ctx);
      drawPowerups(ctx, track, pickupStateRef.current, now);
      track.drawCheckpoints(ctx, raceRef.current.nextCheckpoint);

      explosionsRef.current.forEach((ex) => drawExplosion(ex, now));
      rocketsRef.current.forEach(drawRocket);

      Object.values(othersRef.current).forEach((other) => {
        drawCarAt(
          other.x,
          other.y,
          other.angle,
          other.color,
          other.name,
          other.score ?? 0,
          isStunned(other, now),
          false,
        );
      });

      drawCarAt(
        car.x,
        car.y,
        car.angle,
        playerColor,
        playerName,
        raceRef.current.score,
        isStunned(car, now),
        car.boostedUntil && now < car.boostedUntil,
      );
      ctx.restore();

      drawMinimap(ctx, track, camera, { width, height }, car, othersRef.current, playerColor);

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(10, 10, 210, collisionsEnabled ? 72 : 56);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🚀 Rockets: ${rocketsAmmoRef.current}/${MAX_ROCKETS}`, 20, 30);
      ctx.fillText('Space — fire rocket', 20, 48);
      if (collisionsEnabled) ctx.fillText('💥 Collisions ON', 20, 64);
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
        setDisplayRockets(rocketsAmmoRef.current);
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
            stunnedUntil: car.stunnedUntil || 0,
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
  }, [roomId, playerColor, playerName, trackId, collisionsEnabled]);

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
        <h1 style={{ margin: 0 }}>Room: {roomId}</h1>
        <div>{trackName}</div>
        <div>Score: {displayScore}</div>
        <div>Lap: {displayLaps}</div>
        <div>Time: {displayTime.toFixed(1)}s</div>
        <div>Players: {playerCount}</div>
        <div>🚀 {displayRockets}/{MAX_ROCKETS}</div>
        {collisionsEnabled && <div>💥 Collisions</div>}
        <div style={{ opacity: 0.7 }}>
          {connectionStatus === 'connected' && '🟢 Online'}
          {connectionStatus === 'connecting' && '🟡 Connecting...'}
          {connectionStatus === 'error' && '🔴 Connection error'}
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
