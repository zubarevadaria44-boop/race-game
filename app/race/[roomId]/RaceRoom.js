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
  MAX_LIVES,
  MAX_SHIELDS,
  BOOST_DURATION,
  BOOST_MULTIPLIER,
  INVINCIBLE_MS,
  getRoundEndTime,
  getRoundTimeLeft,
  resolveCarCollision,
  isStunned,
  isInvincible,
  applyStun,
  createRocket,
  createSpreadRockets,
  updateRocket,
  createExplosion,
  createDefaultCar,
  respawnCar,
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
    lives: data.lives ?? existing?.lives ?? MAX_LIVES,
    shields: data.shields ?? existing?.shields ?? 0,
    stunnedUntil: data.stunnedUntil ?? existing?.stunnedUntil ?? 0,
    eliminated: data.eliminated ?? false,
  };
}

function formatTime(ms) {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RaceRoom() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const searchParams = useSearchParams();
  const playerColor = searchParams.get('color') || 'red';
  const playerName = searchParams.get('name') || 'Player';
  const collisionsEnabled = searchParams.get('collisions') !== '0';
  const track = getTrack();

  const playerIdRef = useRef(null);
  if (playerIdRef.current === null && typeof window !== 'undefined') {
    let id = sessionStorage.getItem('race-player-id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('race-player-id', id);
    }
    playerIdRef.current = id;
  }

  const carRef = useRef(createDefaultCar(track.start));
  const keysRef = useRef({});
  const raceRef = useRef({
    nextCheckpoint: 1,
    laps: 0,
    score: 0,
    roundEnd: getRoundEndTime(),
  });
  const othersRef = useRef({});
  const connectedRef = useRef(false);
  const viewSizeRef = useRef({ width: 1200, height: 720 });
  const rocketsRef = useRef([]);
  const explosionsRef = useRef([]);
  const pickupStateRef = useRef({});
  const rocketsAmmoRef = useRef(0);
  const spacePressedRef = useRef(false);

  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(MAX_LIVES);
  const [displayShields, setDisplayShields] = useState(0);
  const [displayRoundTime, setDisplayRoundTime] = useState(formatTime(getRoundTimeLeft()));
  const [displayRockets, setDisplayRockets] = useState(0);
  const [playerCount, setPlayerCount] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [roundMessage, setRoundMessage] = useState('');

  useEffect(() => {
    carRef.current = createDefaultCar(track.start);
    raceRef.current = {
      nextCheckpoint: 1,
      laps: 0,
      score: 0,
      roundEnd: getRoundEndTime(),
    };
    othersRef.current = {};
    rocketsRef.current = [];
    explosionsRef.current = [];
    rocketsAmmoRef.current = 0;
    pickupStateRef.current = Object.fromEntries(
      track.powerups.map((p) => [p.id, { active: true, respawnAt: 0 }]),
    );
    setRoundMessage('');

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

    function resetForNewRound() {
      carRef.current = createDefaultCar(track.start);
      raceRef.current.nextCheckpoint = 1;
      raceRef.current.laps = 0;
      raceRef.current.score = 0;
      raceRef.current.roundEnd = getRoundEndTime();
      rocketsAmmoRef.current = 0;
      rocketsRef.current = [];
      pickupStateRef.current = Object.fromEntries(
        track.powerups.map((p) => [p.id, { active: true, respawnAt: 0 }]),
      );
      setRoundMessage('New round!');
      setTimeout(() => setRoundMessage(''), 2500);
    }

    function takeHit(targetId, x, y, now) {
      const isLocal = targetId === playerIdRef.current;
      const entity = isLocal ? carRef.current : othersRef.current[targetId];
      if (!entity || entity.eliminated || isInvincible(entity, now)) return;

      explosionsRef.current.push(createExplosion(x, y));

      if (entity.shields > 0) {
        entity.shields -= 1;
        applyStun(entity, now, 0.8);
        entity.invincibleUntil = now + INVINCIBLE_MS;
        return;
      }

      entity.lives -= 1;
      applyStun(entity, now);

      if (entity.lives <= 0) {
        entity.eliminated = true;
        entity.speed = 0;
      } else if (isLocal) {
        respawnCar(entity, track.start);
      }

      entity.invincibleUntil = now + INVINCIBLE_MS;
    }

    function broadcastHit(targetId, x, y) {
      if (!connectedRef.current) return;
      channel.send({
        type: 'broadcast',
        event: 'hit',
        payload: { targetId, x, y, shooterId: playerIdRef.current },
      });
    }

    function tryFireRocket() {
      const car = carRef.current;
      const now = performance.now();
      if (car.eliminated || rocketsAmmoRef.current <= 0 || isStunned(car, now)) return;

      rocketsAmmoRef.current -= 1;
      const spawnX = car.x + Math.cos(car.angle) * 28;
      const spawnY = car.y + Math.sin(car.angle) * 28;

      const newRockets = car.spreadShot
        ? createSpreadRockets(spawnX, spawnY, car.angle, playerIdRef.current)
        : [createRocket(spawnX, spawnY, car.angle, playerIdRef.current)];

      car.spreadShot = false;
      rocketsRef.current.push(...newRockets);

      if (connectedRef.current) {
        newRockets.forEach((rocket) => {
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

    const channel = supabase.channel(`rocket-arena-${collisionsEnabled ? 'col' : 'noc'}`, {
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

    channel.on('broadcast', { event: 'rocket' }, (payload) => {
      const data = payload.payload;
      if (data.ownerId === playerIdRef.current) return;
      if (rocketsRef.current.some((r) => r.id === data.id)) return;
      rocketsRef.current.push({ ...data, speed: 620 });
    });

    channel.on('broadcast', { event: 'hit' }, (payload) => {
      const data = payload.payload;
      takeHit(data.targetId, data.x, data.y, performance.now());
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
        await channel.track({ name: playerName, color: playerColor, online_at: new Date().toISOString() });
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
      if (car.eliminated) return;

      track.powerups.forEach((pickup) => {
        const state = pickupStateRef.current[pickup.id];
        if (!state.active && now >= state.respawnAt) state.active = true;
        if (!state.active) return;
        if (distance(car.x, car.y, pickup.x, pickup.y) > PICKUP_RADIUS) return;

        if (pickup.type === 'rocket' && rocketsAmmoRef.current < MAX_ROCKETS) {
          rocketsAmmoRef.current += 1;
        } else if (pickup.type === 'shield' && car.shields < MAX_SHIELDS) {
          car.shields += 1;
        } else if (pickup.type === 'spread') {
          car.spreadShot = true;
          if (rocketsAmmoRef.current < MAX_ROCKETS) rocketsAmmoRef.current += 1;
        } else {
          return;
        }

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
            if (other.eliminated) continue;
            if (distance(rocket.x, rocket.y, other.x, other.y) < ROCKET_HIT_RADIUS) {
              takeHit(id, rocket.x, rocket.y, now);
              broadcastHit(id, rocket.x, rocket.y);
              return false;
            }
          }
        }

        if (
          rocket.ownerId !== playerIdRef.current &&
          !car.eliminated &&
          !isInvincible(car, now) &&
          distance(rocket.x, rocket.y, car.x, car.y) < ROCKET_HIT_RADIUS
        ) {
          takeHit(playerIdRef.current, rocket.x, rocket.y, now);
          return false;
        }

        return alive;
      });

      explosionsRef.current = explosionsRef.current.filter((ex) => now - ex.bornAt < ex.duration);
    }

    function checkRound(nowMs) {
      const roundEnd = getRoundEndTime(nowMs);
      if (raceRef.current.roundEnd !== roundEnd) {
        resetForNewRound();
      }
    }

    function update(deltaTime) {
      const car = carRef.current;
      const keys = keysRef.current;
      const race = raceRef.current;
      const now = performance.now();
      const nowMs = Date.now();

      checkRound(nowMs);

      if (car.eliminated) {
        updateRockets(now, deltaTime);
        return;
      }

      collectPickups(now);

      const stunned = isStunned(car, now);
      const boosted = car.boostedUntil && now < car.boostedUntil;
      const onTrack = track.isOnTrack(car.x, car.y);
      const acceleration = onTrack ? 300 : 200;
      const friction = onTrack ? 115 : 90;
      const turnSpeed = onTrack ? 3.2 : 2.4;
      let maxSpeed = onTrack ? 380 : 175;
      if (boosted) maxSpeed *= BOOST_MULTIPLIER;

      if (!stunned) {
        if (keys['ArrowUp'] || keys['w']) car.speed += acceleration * deltaTime;
        if (keys['ArrowDown'] || keys['s']) car.speed -= acceleration * deltaTime;

        const turnFactor = Math.max(Math.abs(car.speed) / 380, 0.35);
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

      if (collisionsEnabled) {
        Object.values(othersRef.current).forEach((other) => {
          if (!other.eliminated) resolveCarCollision(car, other);
        });
      }

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

    function drawLives(x, y, lives, shields) {
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      const hearts = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, MAX_LIVES - lives));
      ctx.fillText(hearts, x, y);
      if (shields > 0) ctx.fillText('🛡️', x, y + 16);
    }

    function drawCarAt(x, y, angle, color, name, score, car, now) {
      const stunned = isStunned(car, now);
      const invincible = isInvincible(car, now);
      const boosted = car.boostedUntil && now < car.boostedUntil;
      const eliminated = car.eliminated;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      if (eliminated) ctx.globalAlpha = 0.35;
      if (stunned) ctx.filter = 'hue-rotate(180deg) brightness(1.3)';
      if (invincible && !eliminated) {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 14;
      }
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
      ctx.fillRect(x - 48, y - 62, 96, eliminated ? 48 : 58);
      drawLives(x, y - 52, car.lives ?? MAX_LIVES, car.shields ?? 0);
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`${score} pts`, x, y - 32);
      ctx.fillStyle = eliminated ? '#888' : stunned ? '#ff6b6b' : '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(eliminated ? '💀 Out' : stunned ? '💫 Stunned' : name, x, y - 16);
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
      ctx.restore();
    }

    function drawExplosion(ex, now) {
      const t = (now - ex.bornAt) / ex.duration;
      ctx.fillStyle = `rgba(255, ${120 - t * 80}, 0, ${1 - t})`;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, 12 + t * 40, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawHud(width, car) {
      const timeLeft = getRoundTimeLeft();

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(width / 2 - 70, 8, 140, 36);
      ctx.fillStyle = timeLeft < 30000 ? '#ff6666' : '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatTime(timeLeft), width / 2, 32);

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(10, 10, 220, 88);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🚀 ${rocketsAmmoRef.current}/${MAX_ROCKETS}${car.spreadShot ? ' 💥spread ready' : ''}`, 20, 30);
      ctx.fillText('Space — fire', 20, 48);
      ctx.fillText(`❤️ Lives: ${car.lives}/${MAX_LIVES}`, 20, 66);
      ctx.fillText(`🛡️ Shield: ${car.shields}/${MAX_SHIELDS}`, 20, 84);
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
        drawCarAt(other.x, other.y, other.angle, other.color, other.name, other.score ?? 0, other, now);
      });

      drawCarAt(car.x, car.y, car.angle, playerColor, playerName, raceRef.current.score, car, now);
      ctx.restore();

      drawMinimap(ctx, track, camera, { width, height }, car, othersRef.current, playerColor);
      drawHud(width, car);

      if (roundMessage) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, height / 2 - 40, width, 80);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(roundMessage, width / 2, height / 2 + 10);
      }

      if (car.eliminated) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(width / 2 - 120, height - 60, 240, 44);
        ctx.fillStyle = '#ff8888';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Eliminated — wait for next round', width / 2, height - 32);
      }
    }

    function loop(currentTime) {
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      update(deltaTime);
      draw();

      if (currentTime - lastUiUpdate > 100) {
        lastUiUpdate = currentTime;
        const race = raceRef.current;
        const car = carRef.current;
        setDisplayScore(race.score);
        setDisplayLives(car.lives);
        setDisplayShields(car.shields);
        setDisplayRoundTime(formatTime(getRoundTimeLeft()));
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
            lives: car.lives,
            shields: car.shields,
            stunnedUntil: car.stunnedUntil || 0,
            eliminated: car.eliminated,
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
  }, [playerColor, playerName, collisionsEnabled, track]);

  return (
    <div style={{ backgroundColor: 'black', minHeight: '100vh' }}>
      <div
        style={{
          color: 'white',
          padding: '1rem',
          display: 'flex',
          gap: '1.2rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0 }}>🚀 Rocket Arena</h1>
        <div>Round: {displayRoundTime}</div>
        <div>Score: {displayScore}</div>
        <div>Lives: {'❤️'.repeat(displayLives)}{'🖤'.repeat(MAX_LIVES - displayLives)}</div>
        {displayShields > 0 && <div>🛡️ Shield</div>}
        <div>🚀 {displayRockets}/{MAX_ROCKETS}</div>
        <div>Players: {playerCount}</div>
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
