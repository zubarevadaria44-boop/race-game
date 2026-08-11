export const WORLD = { width: 2200, height: 1400 };
export const ROAD_WIDTH = 68;
export const CHECKPOINT_RADIUS = 55;
export const POINTS_PER_CHECKPOINT = 10;
export const POINTS_PER_LAP = 100;

// Parkur merkez hattı — virajlı, zorlu devre
const WAYPOINTS = [
  [320, 1180],
  [320, 920],
  [320, 640],
  [320, 360],
  [480, 180],
  [760, 120],
  [1080, 160],
  [1420, 260],
  [1760, 420],
  [1980, 640],
  [1880, 900],
  [1580, 1080],
  [1220, 1180],
  [860, 1220],
  [520, 1180],
  [320, 1180],
];

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

function sampleCenterline(stepsPerSegment = 24) {
  const points = [];
  const extended = [WAYPOINTS[0], ...WAYPOINTS, WAYPOINTS[WAYPOINTS.length - 1]];

  for (let i = 1; i < extended.length - 2; i++) {
    for (let step = 0; step < stepsPerSegment; step++) {
      const t = step / stepsPerSegment;
      points.push(catmullRom(extended[i - 1], extended[i], extended[i + 1], extended[i + 2], t));
    }
  }

  return points;
}

const CENTERLINE = sampleCenterline();
const CHECKPOINT_INDICES = [0, 45, 90, 135, 180, 225, 270, 315, 360, 405, 450, 495].filter(
  (i) => i < CENTERLINE.length,
);

export const CHECKPOINTS = CHECKPOINT_INDICES.map((index) => {
  const [x, y] = CENTERLINE[index];
  return { x, y };
});

export const START = {
  x: CHECKPOINTS[0].x,
  y: CHECKPOINTS[0].y,
  angle: Math.atan2(CENTERLINE[1][1] - CENTERLINE[0][1], CENTERLINE[1][0] - CENTERLINE[0][0]),
};

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

export function isOnTrack(x, y) {
  const halfWidth = ROAD_WIDTH / 2;
  let minDist = Infinity;

  for (let i = 0; i < CENTERLINE.length - 1; i++) {
    const [x1, y1] = CENTERLINE[i];
    const [x2, y2] = CENTERLINE[i + 1];
    minDist = Math.min(minDist, distToSegment(x, y, x1, y1, x2, y2));
  }

  return minDist <= halfWidth;
}

export function clampCamera(x, y, viewWidth, viewHeight) {
  return {
    x: Math.max(0, Math.min(x, WORLD.width - viewWidth)),
    y: Math.max(0, Math.min(y, WORLD.height - viewHeight)),
  };
}

export function drawTrack(ctx) {
  ctx.fillStyle = '#2d4a2d';
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(CENTERLINE[0][0], CENTERLINE[0][1]);
  for (let i = 1; i < CENTERLINE.length; i++) {
    ctx.lineTo(CENTERLINE[i][0], CENTERLINE[i][1]);
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

  const [sx, sy] = CENTERLINE[0];
  ctx.fillStyle = '#fff';
  ctx.fillRect(sx - 28, sy - 6, 56, 12);
  ctx.fillStyle = '#111';
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(sx - 24 + i * 8, sy - 6, 4, 12);
  }
}

export function drawCheckpoints(ctx, nextCheckpoint) {
  CHECKPOINTS.forEach((cp, index) => {
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, CHECKPOINT_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = index === nextCheckpoint ? '#ffd700' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = index === nextCheckpoint ? 4 : 2;
    ctx.stroke();
  });
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
