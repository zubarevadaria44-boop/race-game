export const ROAD_WIDTH = 68;
export const CHECKPOINT_RADIUS = 55;
export const POINTS_PER_CHECKPOINT = 10;
export const POINTS_PER_LAP = 100;

const ARENA = {
  id: 'arena',
  name: 'Rocket Arena',
  world: { width: 2200, height: 1400 },
  waypoints: [
    [380, 1180], [380, 880], [380, 580], [520, 320], [780, 180],
    [1080, 150], [1420, 240], [1720, 420], [1920, 680], [1880, 940],
    [1620, 1120], [1280, 1220], [920, 1200], [580, 1180], [380, 1180],
  ],
};

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function sampleCenterline(waypoints, stepsPerSegment = 24) {
  const points = [];
  const extended = [waypoints[0], ...waypoints, waypoints[waypoints.length - 1]];

  for (let i = 1; i < extended.length - 2; i++) {
    for (let step = 0; step < stepsPerSegment; step++) {
      const t = step / stepsPerSegment;
      points.push(catmullRom(extended[i - 1], extended[i], extended[i + 1], extended[i + 2], t));
    }
  }

  return points;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointAt(centerline, fraction) {
  const index = Math.floor(centerline.length * fraction);
  const [x, y] = centerline[Math.min(index, centerline.length - 1)];
  return { x, y };
}

function buildTrack(def) {
  const centerline = sampleCenterline(def.waypoints);
  const step = Math.max(Math.floor(centerline.length / 12), 1);
  const checkpoints = Array.from({ length: 12 }, (_, i) => {
    const index = Math.min(i * step, centerline.length - 1);
    const [x, y] = centerline[index];
    return { x, y };
  });

  const start = {
    x: checkpoints[0].x,
    y: checkpoints[0].y,
    angle: Math.atan2(centerline[1][1] - centerline[0][1], centerline[1][0] - centerline[0][0]),
  };

  const powerups = [
    { id: 'rocket-0', type: 'rocket', ...pointAt(centerline, 0.18) },
    { id: 'rocket-1', type: 'rocket', ...pointAt(centerline, 0.42) },
    { id: 'rocket-2', type: 'rocket', ...pointAt(centerline, 0.68) },
    { id: 'shield-0', type: 'shield', ...pointAt(centerline, 0.3) },
    { id: 'shield-1', type: 'shield', ...pointAt(centerline, 0.55) },
    { id: 'spread-0', type: 'spread', ...pointAt(centerline, 0.82) },
  ];

  const boostPads = [0.36, 0.61].map((fraction, idx) => ({
    id: `boost-${idx}`,
    ...pointAt(centerline, fraction),
  }));

  function isOnTrack(x, y) {
    const halfWidth = ROAD_WIDTH / 2;
    let minDist = Infinity;

    for (let i = 0; i < centerline.length - 1; i++) {
      const [x1, y1] = centerline[i];
      const [x2, y2] = centerline[i + 1];
      minDist = Math.min(minDist, distToSegment(x, y, x1, y1, x2, y2));
    }

    return minDist <= halfWidth;
  }

  function drawTrack(ctx) {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, def.world.width, def.world.height);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerline[0][0], centerline[0][1]);
    for (let i = 1; i < centerline.length; i++) {
      ctx.lineTo(centerline[i][0], centerline[i][1]);
    }
    ctx.closePath();

    ctx.strokeStyle = '#555';
    ctx.lineWidth = ROAD_WIDTH + 12;
    ctx.stroke();

    ctx.strokeStyle = '#444';
    ctx.lineWidth = ROAD_WIDTH;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 14]);
    ctx.stroke();
    ctx.setLineDash([]);

    const [sx, sy] = centerline[0];
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 28, sy - 6, 56, 12);
    ctx.fillStyle = '#111';
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(sx - 24 + i * 8, sy - 6, 4, 12);
    }
  }

  function drawCheckpoints(ctx, nextCheckpoint) {
    checkpoints.forEach((cp, index) => {
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, CHECKPOINT_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = index === nextCheckpoint ? '#ffd700' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = index === nextCheckpoint ? 4 : 2;
      ctx.stroke();
    });
  }

  return {
    id: def.id,
    name: def.name,
    world: def.world,
    centerline,
    checkpoints,
    powerups,
    boostPads,
    start,
    isOnTrack,
    drawTrack,
    drawCheckpoints,
  };
}

const TRACK = buildTrack(ARENA);

export function getTrack() {
  return TRACK;
}

export function clampCamera(x, y, viewWidth, viewHeight, world) {
  return {
    x: Math.max(0, Math.min(x, world.width - viewWidth)),
    y: Math.max(0, Math.min(y, world.height - viewHeight)),
  };
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

const POWERUP_ICONS = {
  rocket: '🚀',
  shield: '🛡️',
  spread: '💥',
};

const POWERUP_COLORS = {
  rocket: '#ff6600',
  shield: '#4488ff',
  spread: '#ff44aa',
};

export function drawPowerups(ctx, track, pickupState, now) {
  track.boostPads.forEach((pad) => {
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.fillStyle = 'rgba(0, 200, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡', 0, 6);
    ctx.restore();
  });

  track.powerups.forEach((pickup) => {
    const state = pickupState[pickup.id];
    if (state && !state.active) {
      if (now < state.respawnAt) return;
    }

    const pulse = 1 + Math.sin(now / 160 + pickup.id.length) * 0.1;
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = `${POWERUP_COLORS[pickup.type]}44`;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = POWERUP_COLORS[pickup.type];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(POWERUP_ICONS[pickup.type], 0, 7);
    ctx.restore();
  });
}

export function drawMinimap(ctx, track, camera, viewSize, localCar, others, localColor) {
  const mapSize = 168;
  const pad = 10;
  const mapX = viewSize.width - mapSize - pad;
  const mapY = pad;

  const scale = Math.min(mapSize / track.world.width, mapSize / track.world.height);
  const drawnW = track.world.width * scale;
  const drawnH = track.world.height * scale;
  const offsetX = mapX + (mapSize - drawnW) / 2;
  const offsetY = mapY + (mapSize - drawnH) / 2;

  const toMap = (wx, wy) => [offsetX + wx * scale, offsetY + wy * scale];

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(mapX - 6, mapY - 22, mapSize + 12, mapSize + 28, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Map', mapX, mapY - 8);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapX, mapY, mapSize, mapSize);
  ctx.clip();

  ctx.fillStyle = '#1e331e';
  ctx.fillRect(mapX, mapY, mapSize, mapSize);

  ctx.strokeStyle = '#777';
  ctx.lineWidth = Math.max(2, ROAD_WIDTH * scale * 0.55);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  track.centerline.forEach(([px, py], index) => {
    const [mx, my] = toMap(px, py);
    if (index === 0) ctx.moveTo(mx, my);
    else ctx.lineTo(mx, my);
  });
  ctx.closePath();
  ctx.stroke();

  Object.values(others).forEach((other) => {
    const [mx, my] = toMap(other.x, other.y);
    ctx.fillStyle = other.color;
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  const [lx, ly] = toMap(localCar.x, localCar.y);
  ctx.fillStyle = localColor;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(lx, ly, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    offsetX + camera.x * scale,
    offsetY + camera.y * scale,
    viewSize.width * scale,
    viewSize.height * scale,
  );

  ctx.restore();
  ctx.restore();
}
