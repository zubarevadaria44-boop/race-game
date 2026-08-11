export const CAR_RADIUS = 20;
export const PICKUP_RADIUS = 38;
export const ROCKET_SPEED = 620;
export const ROCKET_HIT_RADIUS = 32;
export const STUN_DURATION = 1.8;
export const PICKUP_RESPAWN = 12;
export const MAX_ROCKETS = 2;
export const MAX_LIVES = 3;
export const MAX_SHIELDS = 1;
export const BOOST_DURATION = 1.8;
export const BOOST_MULTIPLIER = 1.35;
export const INVINCIBLE_MS = 2200;
export const ROUND_DURATION_MS = 180000;

export function getRoundEndTime(now = Date.now()) {
  return Math.ceil(now / ROUND_DURATION_MS) * ROUND_DURATION_MS;
}

export function getRoundTimeLeft(now = Date.now()) {
  return Math.max(0, getRoundEndTime(now) - now);
}

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
  return {
    id: crypto.randomUUID(),
    x,
    y,
    angle,
    ownerId,
    speed: ROCKET_SPEED,
  };
}

export function createSpreadRockets(x, y, angle, ownerId) {
  return [-0.22, 0, 0.22].map((offset) =>
    createRocket(
      x + Math.cos(angle + offset) * 20,
      y + Math.sin(angle + offset) * 20,
      angle + offset,
      ownerId,
    ),
  );
}

export function updateRocket(rocket, deltaTime, world) {
  rocket.x += Math.cos(rocket.angle) * rocket.speed * deltaTime;
  rocket.y += Math.sin(rocket.angle) * rocket.speed * deltaTime;

  return (
    rocket.x > -40 &&
    rocket.x < world.width + 40 &&
    rocket.y > -40 &&
    rocket.y < world.height + 40
  );
}

export function createExplosion(x, y) {
  return {
    x,
    y,
    bornAt: performance.now(),
    duration: 450,
  };
}

export function createDefaultCar(start) {
  return {
    x: start.x,
    y: start.y,
    angle: start.angle,
    speed: 0,
    lives: MAX_LIVES,
    shields: 0,
    stunnedUntil: 0,
    invincibleUntil: 0,
    boostedUntil: 0,
    eliminated: false,
    spreadShot: false,
  };
}

export function respawnCar(car, start) {
  car.x = start.x;
  car.y = start.y;
  car.angle = start.angle;
  car.speed = 0;
}
