export const CAR_RADIUS = 20;
export const PICKUP_RADIUS = 38;
export const ROCKET_SPEED = 620;
export const ROCKET_HIT_RADIUS = 32;
export const FIRE_SPEED = 480;
export const FIRE_HIT_RADIUS = 28;
export const STUN_DURATION = 1.5;
export const PICKUP_RESPAWN = 10;
export const MAX_ROCKETS = 3;
export const MAX_LIVES = 3;
export const MAX_SHIELDS = 1;
export const BOOST_DURATION = 1.8;
export const BOOST_MULTIPLIER = 1.35;
export const INVINCIBLE_MS = 2000;
export const RESPAWN_MS = 2500;
export const DRAGON_MAX_HP = 600;
export const ROCKET_DAMAGE = 14;
export const DRAGON_BREATH_INTERVAL = 2800;
export const DRAGON_RESPAWN_MS = 8000;

export function resolveCarCollision(a, b, radius = CAR_RADIUS) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  const minDist = radius * 2;
  if (dist >= minDist || dist === 0) return false;

  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x += nx * overlap * 0.55;
  a.y += ny * overlap * 0.55;
  a.speed *= 0.75;
  return true;
}

export function isStunned(entity, now) {
  return entity.stunnedUntil && now < entity.stunnedUntil;
}

export function isInvincible(entity, now) {
  return entity.invincibleUntil && now < entity.invincibleUntil;
}

export function applyStun(entity, now, duration = STUN_DURATION) {
  entity.stunnedUntil = now + duration * 1000;
  entity.speed *= 0.15;
}

export function createRocket(x, y, angle, ownerId) {
  return { id: crypto.randomUUID(), x, y, angle, ownerId, speed: ROCKET_SPEED, kind: 'rocket' };
}

export function createSpreadRockets(x, y, angle, ownerId) {
  return [-0.25, 0, 0.25].map((offset) =>
    createRocket(
      x + Math.cos(angle + offset) * 20,
      y + Math.sin(angle + offset) * 20,
      angle + offset,
      ownerId,
    ),
  );
}

export function createFireball(x, y, angle) {
  return { id: crypto.randomUUID(), x, y, angle, speed: FIRE_SPEED, kind: 'fire' };
}

export function updateProjectile(p, deltaTime, world) {
  p.x += Math.cos(p.angle) * p.speed * deltaTime;
  p.y += Math.sin(p.angle) * p.speed * deltaTime;
  return p.x > -40 && p.x < world.width + 40 && p.y > -40 && p.y < world.height + 40;
}

export function createExplosion(x, y) {
  return { x, y, bornAt: performance.now(), duration: 500 };
}

export function createDefaultPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    speed: 0,
    lives: MAX_LIVES,
    shields: 0,
    kills: 0,
    dragonDamage: 0,
    stunnedUntil: 0,
    invincibleUntil: 0,
    boostedUntil: 0,
    dead: false,
    respawnAt: 0,
    spreadShot: false,
  };
}

export function respawnPlayer(p, spawn) {
  p.x = spawn.x + (Math.random() - 0.5) * 60;
  p.y = spawn.y + (Math.random() - 0.5) * 60;
  p.angle = spawn.angle;
  p.speed = 0;
  p.lives = MAX_LIVES;
  p.shields = 0;
  p.dead = false;
  p.stunnedUntil = 0;
  p.invincibleUntil = performance.now() + INVINCIBLE_MS;
}

export function createDragon(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    hp: DRAGON_MAX_HP,
    maxHp: DRAGON_MAX_HP,
    angle: 0,
    breathing: false,
    lastBreath: 0,
    alive: true,
    defeatedAt: 0,
  };
}

export function getNearestTarget(x, y, players) {
  let nearest = null;
  let minDist = Infinity;
  for (const p of players) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < minDist) {
      minDist = d;
      nearest = p;
    }
  }
  return nearest;
}
