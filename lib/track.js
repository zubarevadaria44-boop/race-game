export const ROAD_WIDTH = 68;
export const CHECKPOINT_RADIUS = 55;
export const POINTS_PER_CHECKPOINT = 10;
export const POINTS_PER_LAP = 100;

const TRACK_DEFS = {
  forest: {
    id: 'forest',
    name: 'Orman Devresi',
    world: { width: 2200, height: 1400 },
    waypoints: [
      [320, 1180], [320, 920], [320, 640], [320, 360], [480, 180], [760, 120],
      [1080, 160], [1420, 260], [1760, 420], [1980, 640], [1880, 900],
      [1580, 1080], [1220, 1180], [860, 1220], [520, 1180], [320, 1180],
    ],
  },
  coastal: {
    id: 'coastal',
    name: 'Sahil Pisti',
    world: { width: 2000, height: 1200 },
    waypoints: [
      [220, 620], [380, 280], [680, 140], [1020, 120], [1380, 220],
      [1680, 420], [1820, 680], [1740, 960], [1420, 1080], [1040, 1120],
      [640, 980], [280, 820], [220, 620],
    ],
  },
  mountain: {
    id: 'mountain',
    name: 'Dağ Parkuru',
    world: { width: 2400, height: 1600 },
    waypoints: [
      [420, 1380], [420, 1080], [580, 780], [820, 560], [1100, 400],
      [1400, 300], [1780, 340], [2100, 560], [2200, 860], [2060, 1160],
      [1720, 1380], [1280, 1480], [860, 1420], [520, 1380], [420, 1380],
    ],
  },
  city: {
    id: 'city',
    name: 'Şehir Slalomu',
    world: { width: 2100, height: 1500 },
    waypoints: [
      [300, 1280], [300, 980], [520, 760], [780, 680], [1040, 820],
      [1200, 1080], [1380, 1200], [1620, 1140], [1780, 900], [1860, 620],
      [1680, 380], [1360, 260], [980, 280], [680, 420], [460, 680],
      [300, 980], [300, 1280],
    ],
  },
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

function buildTrack(def) {
  const centerline = sampleCenterline(def.waypoints);
  const step = Math.max(Math.floor(centerline.length / 12), 1);
  const checkpointIndices = Array.from({ length: 12 }, (_, i) => Math.min(i * step, centerline.length - 1));

  const checkpoints = checkpointIndices.map((index) => {
    const [x, y] = centerline[index];
    return { x, y };
  });

  const start = {
    x: checkpoints[0].x,
    y: checkpoints[0].y,
    angle: Math.atan2(centerline[1][1] - centerline[0][1], centerline[1][0] - centerline[0][0]),
  };

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
    ctx.fillStyle = '#2d4a2d';
    ctx.fillRect(0, 0, def.world.width, def.world.height);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerline[0][0], centerline[0][1]);
    for (let i = 1; i < centerline.length; i++) {
      ctx.lineTo(centerline[i][0], centerline[i][1]);
    }
    ctx.closePath();

    ctx.strokeStyle = '#666';
    ctx.lineWidth = ROAD_WIDTH + 10;
    ctx.stroke();

    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = ROAD_WIDTH;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 16]);
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
      ctx.strokeStyle = index === nextCheckpoint ? '#ffd700' : 'rgba(255,255,255,0.15)';
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
    start,
    isOnTrack,
    drawTrack,
    drawCheckpoints,
  };
}

const TRACKS = Object.fromEntries(
  Object.values(TRACK_DEFS).map((def) => [def.id, buildTrack(def)]),
);

export const TRACK_LIST = Object.values(TRACKS).map(({ id, name }) => ({ id, name }));

export function getTrack(trackId) {
  return TRACKS[trackId] ?? TRACKS.forest;
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
  ctx.fillText('Harita', mapX, mapY - 8);

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
