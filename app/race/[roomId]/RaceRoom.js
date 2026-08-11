'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  WORLD,
  SPAWN,
  DRAGON_SPAWN,
  POWERUPS,
  clampCamera,
  drawArena,
  drawPowerups,
  drawMinimap,
  drawHealthBar,
  distance,
} from '@/lib/arena';
import {
  CAR_RADIUS,
  PICKUP_RADIUS,
  ROCKET_HIT_RADIUS,
  FIRE_HIT_RADIUS,
  PICKUP_RESPAWN,
  MAX_ROCKETS,
  MAX_PLAYER_HP,
  MAX_SHIELDS,
  ROCKET_PLAYER_DAMAGE,
  FIRE_DAMAGE,
  DRAGON_BODY_DAMAGE,
  DRAGON_BODY_RADIUS,
  INVINCIBLE_MS,
  RESPAWN_MS,
  DRAGON_MAX_HP,
  ROCKET_DAMAGE,
  DRAGON_BREATH_INTERVAL,
  DRAGON_BREATH_ENRAGED,
  DRAGON_RESPAWN_MS,
  DRAGON_SPEED,
  DRAGON_ENRAGED_SPEED,
  resolveCarCollision,
  isInvincible,
  applyDamage,
  hpPercent,
  createRocket,
  createSpreadRockets,
  createFireball,
  updateProjectile,
  createExplosion,
  createDefaultPlayer,
  respawnPlayer,
  createDragon,
  getNearestTarget,
} from '@/lib/gameplay';

function upsertOther(othersRef, data) {
  const e = othersRef.current[data.id];
  othersRef.current[data.id] = {
    x: e ? e.x : data.x,
    y: e ? e.y : data.y,
    angle: e ? e.angle : data.angle,
    targetX: data.x,
    targetY: data.y,
    targetAngle: data.angle,
    color: data.color,
    name: data.name,
    kills: data.kills ?? e?.kills ?? 0,
    dragonDamage: data.dragonDamage ?? e?.dragonDamage ?? 0,
    hp: data.hp ?? e?.hp ?? MAX_PLAYER_HP,
    maxHp: MAX_PLAYER_HP,
    shields: data.shields ?? e?.shields ?? 0,
    dead: data.dead ?? false,
  };
}

export default function RaceRoom() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const searchParams = useSearchParams();
  const playerColor = searchParams.get('color') || 'red';
  const playerName = searchParams.get('name') || 'Player';
  const collisionsEnabled = searchParams.get('collisions') !== '0';

  const playerIdRef = useRef(null);
  if (playerIdRef.current === null && typeof window !== 'undefined') {
    let id = sessionStorage.getItem('race-player-id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('race-player-id', id);
    }
    playerIdRef.current = id;
  }

  const playerRef = useRef(createDefaultPlayer(SPAWN));
  const dragonRef = useRef(createDragon(DRAGON_SPAWN));
  const keysRef = useRef({});
  const othersRef = useRef({});
  const connectedRef = useRef(false);
  const viewSizeRef = useRef({ width: 1200, height: 720 });
  const projectilesRef = useRef([]);
  const explosionsRef = useRef([]);
  const pickupStateRef = useRef({});
  const rocketsAmmoRef = useRef(1);
  const spacePressedRef = useRef(false);
  const dragonTouchCooldownRef = useRef(0);

  const [displayKills, setDisplayKills] = useState(0);
  const [displayDragonDmg, setDisplayDragonDmg] = useState(0);
  const [displayHp, setDisplayHp] = useState(100);
  const [displayDragonHp, setDisplayDragonHp] = useState(100);
  const [displayRockets, setDisplayRockets] = useState(1);
  const [playerCount, setPlayerCount] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const victoryMsgRef = useRef('');

  useEffect(() => {
    playerRef.current = createDefaultPlayer(SPAWN);
    dragonRef.current = createDragon(DRAGON_SPAWN);
    othersRef.current = {};
    projectilesRef.current = [];
    explosionsRef.current = [];
    rocketsAmmoRef.current = 1;
    dragonTouchCooldownRef.current = 0;
    pickupStateRef.current = Object.fromEntries(POWERUPS.map((p) => [p.id, { active: true, respawnAt: 0 }]));
    victoryMsgRef.current = '';

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

    function allPlayers() {
      const list = [{ ...playerRef.current, id: playerIdRef.current, color: playerColor, name: playerName }];
      Object.entries(othersRef.current).forEach(([id, o]) => list.push({ ...o, id }));
      return list;
    }

    function broadcast(event, payload) {
      if (connectedRef.current) channel.send({ type: 'broadcast', event, payload });
    }

    function killPlayer(entity, now, killerId) {
      entity.dead = true;
      entity.respawnAt = now + RESPAWN_MS;
      entity.hp = 0;
      if (killerId === playerIdRef.current) playerRef.current.kills += 1;
    }

    function damagePlayer(targetId, amount, x, y, now, killerId) {
      const isLocal = targetId === playerIdRef.current;
      const entity = isLocal ? playerRef.current : othersRef.current[targetId];
      if (!entity || entity.dead || isInvincible(entity, now)) return;

      explosionsRef.current.push(createExplosion(x, y));
      const died = applyDamage(entity, amount, now);
      if (died) killPlayer(entity, now, killerId);
    }

    function damageDragon(amount) {
      const dragon = dragonRef.current;
      if (!dragon.alive) return;

      dragon.hp = Math.max(0, dragon.hp - amount);
      dragon.enraged = dragon.hp / dragon.maxHp < 0.3;
      playerRef.current.dragonDamage += amount;
      broadcast('dragon-hit', { hp: dragon.hp, damage: amount, by: playerIdRef.current });

      if (dragon.hp <= 0) {
        dragon.alive = false;
        dragon.defeatedAt = performance.now();
        victoryMsgRef.current = '🎉 DRAGON DEFEATED! 🎉';
        broadcast('dragon-dead', { by: playerName });
      }
    }

    function tryFire() {
      const p = playerRef.current;
      const now = performance.now();
      if (p.dead || rocketsAmmoRef.current <= 0) return;

      rocketsAmmoRef.current -= 1;
      const sx = p.x + Math.cos(p.angle) * 28;
      const sy = p.y + Math.sin(p.angle) * 28;
      const rockets = p.spreadShot
        ? createSpreadRockets(sx, sy, p.angle, playerIdRef.current)
        : [createRocket(sx, sy, p.angle, playerIdRef.current)];
      p.spreadShot = false;
      projectilesRef.current.push(...rockets);
      rockets.forEach((r) =>
        broadcast('rocket', { id: r.id, x: r.x, y: r.y, angle: r.angle, ownerId: r.ownerId }),
      );
    }

    const handleKeyDown = (e) => {
      keysRef.current[e.key] = true;
      if (e.code === 'Space' && !spacePressedRef.current) {
        spacePressedRef.current = true;
        e.preventDefault();
        tryFire();
      }
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.key] = false;
      if (e.code === 'Space') spacePressedRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const channel = supabase.channel(`dragon-battle-${collisionsEnabled ? 'col' : 'noc'}`, {
      config: { broadcast: { self: false }, presence: { key: playerIdRef.current } },
    });

    channel.on('broadcast', { event: 'position' }, ({ payload: data }) => {
      if (data.id === playerIdRef.current) return;
      upsertOther(othersRef, data);
    });

    channel.on('broadcast', { event: 'rocket' }, ({ payload: data }) => {
      if (data.ownerId === playerIdRef.current) return;
      if (projectilesRef.current.some((p) => p.id === data.id)) return;
      projectilesRef.current.push({ ...data, speed: 620, kind: 'rocket' });
    });

    channel.on('broadcast', { event: 'hit' }, ({ payload: data }) => {
      damagePlayer(data.targetId, data.amount, data.x, data.y, performance.now(), data.killerId);
    });

    channel.on('broadcast', { event: 'dragon-hit' }, ({ payload: data }) => {
      const dragon = dragonRef.current;
      if (data.by !== playerIdRef.current) dragon.hp = Math.min(dragon.hp, data.hp);
      dragon.enraged = dragon.hp / dragon.maxHp < 0.3;
      if (dragon.hp <= 0 && dragon.alive) {
        dragon.alive = false;
        dragon.defeatedAt = performance.now();
        victoryMsgRef.current = '🎉 DRAGON DEFEATED! 🎉';
      }
    });

    channel.on('broadcast', { event: 'dragon-dead' }, ({ payload: data }) => {
      if (data.by !== playerName) victoryMsgRef.current = `🎉 ${data.by} led the final blow! 🎉`;
    });

    channel.on('broadcast', { event: 'pickup' }, ({ payload: data }) => {
      pickupStateRef.current[data.pickupId] = { active: false, respawnAt: data.respawnAt };
    });

    channel.on('presence', { event: 'sync' }, () => {
      const ids = new Set(Object.keys(channel.presenceState()));
      Object.keys(othersRef.current).forEach((id) => {
        if (!ids.has(id)) delete othersRef.current[id];
      });
      setPlayerCount(ids.size);
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

    function updateDragon(now, deltaTime) {
      const dragon = dragonRef.current;

      if (!dragon.alive) {
        if (now - dragon.defeatedAt > DRAGON_RESPAWN_MS) {
          dragonRef.current = createDragon(DRAGON_SPAWN);
          victoryMsgRef.current = '';
        }
        return;
      }

      dragon.enraged = dragon.hp / dragon.maxHp < 0.3;
      const speed = dragon.enraged ? DRAGON_ENRAGED_SPEED : DRAGON_SPEED;
      const breathInterval = dragon.enraged ? DRAGON_BREATH_ENRAGED : DRAGON_BREATH_INTERVAL;

      const target = getNearestTarget(dragon.x, dragon.y, allPlayers());
      if (target) {
        const dx = target.x - dragon.x;
        const dy = target.y - dragon.y;
        const dist = Math.hypot(dx, dy) || 1;
        const targetAngle = Math.atan2(dy, dx);

        let diff = targetAngle - dragon.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        dragon.angle += diff * Math.min(deltaTime * 3, 1);

        if (dist > 200) {
          dragon.x += (dx / dist) * speed * deltaTime;
          dragon.y += (dy / dist) * speed * deltaTime;
        } else if (dist < 140) {
          dragon.x -= (dx / dist) * speed * 0.6 * deltaTime;
          dragon.y -= (dy / dist) * speed * 0.6 * deltaTime;
        }

        dragon.x = Math.max(150, Math.min(dragon.x, WORLD.width - 150));
        dragon.y = Math.max(150, Math.min(dragon.y, WORLD.height - 150));
      }

      dragon.breathing = false;
      if (now - dragon.lastBreath > breathInterval) {
        dragon.lastBreath = now;
        dragon.breathing = true;
        const spread = dragon.enraged ? 3 : 2;
        for (let i = -spread; i <= spread; i++) {
          const a = dragon.angle + i * 0.11;
          projectilesRef.current.push(
            createFireball(
              dragon.x + Math.cos(a) * 140,
              dragon.y + Math.sin(a) * 140,
              a,
            ),
          );
        }
      }
    }

    function checkDragonBody(now) {
      const dragon = dragonRef.current;
      if (!dragon.alive) return;

      const p = playerRef.current;
      if (!p.dead && !isInvincible(p, now) && distance(p.x, p.y, dragon.x, dragon.y) < DRAGON_BODY_RADIUS) {
        if (now - dragonTouchCooldownRef.current > 800) {
          dragonTouchCooldownRef.current = now;
          const died = applyDamage(p, DRAGON_BODY_DAMAGE, now);
          if (died) killPlayer(p, now, null);
        }
      }
    }

    function collectPickups(now) {
      const p = playerRef.current;
      if (p.dead) return;

      POWERUPS.forEach((pickup) => {
        const state = pickupStateRef.current[pickup.id];
        if (!state.active && now >= state.respawnAt) state.active = true;
        if (!state.active || distance(p.x, p.y, pickup.x, pickup.y) > PICKUP_RADIUS) return;

        if (pickup.type === 'rocket' && rocketsAmmoRef.current < MAX_ROCKETS) rocketsAmmoRef.current += 1;
        else if (pickup.type === 'shield' && p.shields < MAX_SHIELDS) p.shields += 1;
        else if (pickup.type === 'spread') {
          p.spreadShot = true;
          if (rocketsAmmoRef.current < MAX_ROCKETS) rocketsAmmoRef.current += 1;
        } else return;

        state.active = false;
        state.respawnAt = now + PICKUP_RESPAWN * 1000;
        broadcast('pickup', { pickupId: pickup.id, respawnAt: state.respawnAt });
      });
    }

    function updateProjectiles(now, deltaTime) {
      const p = playerRef.current;
      const dragon = dragonRef.current;

      projectilesRef.current = projectilesRef.current.filter((proj) => {
        const alive = updateProjectile(proj, deltaTime, WORLD);

        if (proj.kind === 'rocket') {
          if (proj.ownerId === playerIdRef.current) {
            if (distance(proj.x, proj.y, p.x, p.y) < ROCKET_HIT_RADIUS) return alive;

            if (dragon.alive && distance(proj.x, proj.y, dragon.x, dragon.y) < 100) {
              damageDragon(ROCKET_DAMAGE);
              explosionsRef.current.push(createExplosion(proj.x, proj.y));
              return false;
            }

            for (const [id, other] of Object.entries(othersRef.current)) {
              if (other.dead) continue;
              if (distance(proj.x, proj.y, other.x, other.y) < ROCKET_HIT_RADIUS) {
                damagePlayer(id, ROCKET_PLAYER_DAMAGE, proj.x, proj.y, now, playerIdRef.current);
                broadcast('hit', {
                  targetId: id,
                  amount: ROCKET_PLAYER_DAMAGE,
                  x: proj.x,
                  y: proj.y,
                  killerId: playerIdRef.current,
                });
                return false;
              }
            }
          }

          if (
            proj.ownerId !== playerIdRef.current &&
            !p.dead &&
            !isInvincible(p, now) &&
            distance(proj.x, proj.y, p.x, p.y) < ROCKET_HIT_RADIUS
          ) {
            damagePlayer(playerIdRef.current, ROCKET_PLAYER_DAMAGE, proj.x, proj.y, now, proj.ownerId);
            return false;
          }
        }

        if (proj.kind === 'fire') {
          if (!p.dead && !isInvincible(p, now) && distance(proj.x, proj.y, p.x, p.y) < FIRE_HIT_RADIUS) {
            const died = applyDamage(p, FIRE_DAMAGE, now);
            explosionsRef.current.push(createExplosion(proj.x, proj.y));
            if (died) killPlayer(p, now, null);
            return false;
          }
        }

        return alive;
      });
    }

    function update(deltaTime) {
      const p = playerRef.current;
      const now = performance.now();
      const dragon = dragonRef.current;

      if (p.dead) {
        if (now >= p.respawnAt) respawnPlayer(p, SPAWN);
        updateDragon(now, deltaTime);
        updateProjectiles(now, deltaTime);
        return;
      }

      collectPickups(now);
      updateDragon(now, deltaTime);
      checkDragonBody(now);

      const acceleration = 320;
      const friction = 100;
      const turnSpeed = 3.4;
      const maxSpeed = 400;

      const keys = keysRef.current;
      if (keys['ArrowUp'] || keys['w']) p.speed += acceleration * deltaTime;
      if (keys['ArrowDown'] || keys['s']) p.speed -= acceleration * deltaTime;
      const tf = Math.max(Math.abs(p.speed) / 400, 0.35);
      if (keys['ArrowLeft'] || keys['a']) p.angle -= turnSpeed * deltaTime * tf;
      if (keys['ArrowRight'] || keys['d']) p.angle += turnSpeed * deltaTime * tf;

      if (p.speed > maxSpeed) p.speed = maxSpeed;
      if (p.speed < -maxSpeed / 2) p.speed = -maxSpeed / 2;

      const throttle =
        keysRef.current['ArrowUp'] ||
        keysRef.current['w'] ||
        keysRef.current['ArrowDown'] ||
        keysRef.current['s'];
      if (!throttle) {
        if (p.speed > 0) p.speed = Math.max(0, p.speed - friction * deltaTime);
        else if (p.speed < 0) p.speed = Math.min(0, p.speed + friction * deltaTime);
      }

      p.x += Math.cos(p.angle) * p.speed * deltaTime;
      p.y += Math.sin(p.angle) * p.speed * deltaTime;
      p.x = Math.max(CAR_RADIUS, Math.min(p.x, WORLD.width - CAR_RADIUS));
      p.y = Math.max(CAR_RADIUS, Math.min(p.y, WORLD.height - CAR_RADIUS));

      if (collisionsEnabled) {
        Object.values(othersRef.current).forEach((o) => {
          if (!o.dead) resolveCarCollision(p, o);
        });
      }

      Object.values(othersRef.current).forEach((o) => {
        const lf = Math.min(deltaTime * 10, 1);
        o.x += (o.targetX - o.x) * lf;
        o.y += (o.targetY - o.y) * lf;
        o.angle += (o.targetAngle - o.angle) * lf;
      });

      updateProjectiles(now, deltaTime);
    }

    function drawPlayer(x, y, angle, color, name, pl, now) {
      const inv = isInvincible(pl, now);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      if (pl.dead) ctx.globalAlpha = 0.3;
      if (inv && !pl.dead) {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 14;
      }
      ctx.fillStyle = color;
      ctx.fillRect(-16, -11, 32, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-10, -8, 14, 16);
      ctx.restore();

      if (!pl.dead) {
        const hpColor = pl.hp / pl.maxHp > 0.3 ? '#44cc66' : '#ff4444';
        drawHealthBar(ctx, x, y, pl.hp, pl.maxHp, name, hpColor);
        if (pl.shields > 0) {
          ctx.fillStyle = '#88bbff';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🛡️', x, y - 58);
        }
        if (pl.kills > 0) {
          ctx.fillStyle = '#ffd700';
          ctx.fillText(`⚔️ ${pl.kills}`, x, y + 8);
        }
      } else {
        ctx.fillStyle = '#888';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💀 Respawning', x, y - 30);
      }
    }

    function drawProjectile(proj) {
      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.rotate(proj.angle);
      if (proj.kind === 'fire') {
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffee00';
        ctx.beginPath();
        ctx.arc(4, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff4500';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-7, -5);
        ctx.lineTo(-7, 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    function drawExplosion(ex, now) {
      const t = (now - ex.bornAt) / ex.duration;
      ctx.fillStyle = `rgba(255,${100 - t * 80},0,${1 - t})`;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, 10 + t * 45, 0, Math.PI * 2);
      ctx.fill();
    }

    function draw() {
      const p = playerRef.current;
      const dragon = dragonRef.current;
      const now = performance.now();
      const { width, height } = viewSizeRef.current;
      const camera = clampCamera(p.x - width / 2, p.y - height / 2, width, height);

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(-camera.x, -camera.y);

      drawArena(ctx, dragon, now);
      drawPowerups(ctx, pickupStateRef.current, now);
      explosionsRef.current.forEach((ex) => drawExplosion(ex, now));
      projectilesRef.current.forEach(drawProjectile);

      Object.values(othersRef.current).forEach((o) => drawPlayer(o.x, o.y, o.angle, o.color, o.name, o, now));
      drawPlayer(p.x, p.y, p.angle, playerColor, playerName, p, now);
      ctx.restore();

      drawMinimap(ctx, camera, { width, height }, p, othersRef.current, playerColor, dragon);

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(10, 10, 240, 72);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🚀 Rockets: ${rocketsAmmoRef.current}/${MAX_ROCKETS}${p.spreadShot ? ' 💥' : ''}`, 20, 30);
      ctx.fillText('Space — fire at dragon / players', 20, 48);
      ctx.fillText(`🔥 Dragon DMG: ${p.dragonDamage}`, 20, 66);

      if (dragon.enraged && dragon.alive) {
        ctx.fillStyle = 'rgba(255,40,0,0.75)';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ DRAGON ENRAGED', width / 2, 28);
      }

      if (victoryMsgRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(width / 2 - 200, height / 2 - 50, 400, 100);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(victoryMsgRef.current, width / 2, height / 2 + 10);
      }

      if (p.dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(width / 2 - 130, height - 56, 260, 40);
        ctx.fillStyle = '#ff8888';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Respawning...', width / 2, height - 30);
      }
    }

    function loop(currentTime) {
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;
      update(deltaTime);
      draw();

      if (currentTime - lastUiUpdate > 100) {
        lastUiUpdate = currentTime;
        const pl = playerRef.current;
        const dr = dragonRef.current;
        setDisplayKills(pl.kills);
        setDisplayDragonDmg(pl.dragonDamage);
        setDisplayHp(hpPercent(pl.hp, pl.maxHp));
        setDisplayDragonHp(hpPercent(dr.hp, dr.maxHp));
        setDisplayRockets(rocketsAmmoRef.current);
      }

      if (connectedRef.current && currentTime - lastNetworkSend > 66) {
        lastNetworkSend = currentTime;
        const pl = playerRef.current;
        channel.send({
          type: 'broadcast',
          event: 'position',
          payload: {
            id: playerIdRef.current,
            x: pl.x,
            y: pl.y,
            angle: pl.angle,
            color: playerColor,
            name: playerName,
            kills: pl.kills,
            dragonDamage: pl.dragonDamage,
            hp: pl.hp,
            shields: pl.shields,
            dead: pl.dead,
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
  }, [playerColor, playerName, collisionsEnabled]);

  return (
    <div style={{ backgroundColor: '#0a0808', minHeight: '100vh' }}>
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
        <h1 style={{ margin: 0 }}>🐉 Dragon Battle</h1>
        <div>🐉 {displayDragonHp}%</div>
        <div>❤️ HP {displayHp}%</div>
        <div>⚔️ Kills: {displayKills}</div>
        <div>🔥 Dmg: {displayDragonDmg}</div>
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
          style={{ display: 'block', width: '100%', backgroundColor: '#1a1010', borderRadius: '8px' }}
        />
      </div>
    </div>
  );
}
