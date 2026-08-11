export const WORLD = { width: 2000, height: 1400 };

export const SPAWN = { x: 200, y: 700, angle: 0 };

export const DRAGON_SPAWN = { x: 1000, y: 620 };

export const POWERUPS = [
  { id: 'rocket-0', type: 'rocket', x: 350, y: 350 },
  { id: 'rocket-1', type: 'rocket', x: 1650, y: 350 },
  { id: 'rocket-2', type: 'rocket', x: 350, y: 1050 },
  { id: 'rocket-3', type: 'rocket', x: 1650, y: 1050 },
  { id: 'shield-0', type: 'shield', x: 200, y: 200 },
  { id: 'shield-1', type: 'shield', x: 1800, y: 200 },
  { id: 'spread-0', type: 'spread', x: 1000, y: 200 },
  { id: 'spread-1', type: 'spread', x: 1000, y: 1200 },
];

export const BOOST_PADS = [
  { id: 'boost-0', x: 500, y: 700 },
  { id: 'boost-1', x: 1500, y: 700 },
];

export function clampCamera(x, y, viewWidth, viewHeight) {
  return {
    x: Math.max(0, Math.min(x, WORLD.width - viewWidth)),
    y: Math.max(0, Math.min(y, WORLD.height - viewHeight)),
  };
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function drawArena(ctx, dragon, now) {
  ctx.fillStyle = '#1a1210';
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // Lava ring around dragon
  const gradient = ctx.createRadialGradient(
    DRAGON_SPAWN.x,
    DRAGON_SPAWN.y,
    80,
    DRAGON_SPAWN.x,
    DRAGON_SPAWN.y,
    320,
  );
  gradient.addColorStop(0, 'rgba(255,80,0,0.35)');
  gradient.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // Arena floor tiles
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WORLD.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }
  for (let y = 0; y < WORLD.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }

  // Border walls
  ctx.strokeStyle = '#553322';
  ctx.lineWidth = 12;
  ctx.strokeRect(20, 20, WORLD.width - 40, WORLD.height - 40);

  drawDragon(ctx, dragon, now);
}

export function drawDragon(ctx, dragon, now) {
  const { x, y, hp, maxHp, angle, breathing } = dragon;
  const wingFlap = Math.sin(now / 200) * 0.15;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Wings
  ctx.fillStyle = '#3a5a2a';
  ctx.beginPath();
  ctx.moveTo(-20, -80);
  ctx.lineTo(-120, -140 + wingFlap * 40);
  ctx.lineTo(-40, -30);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-20, 80);
  ctx.lineTo(-120, 140 - wingFlap * 40);
  ctx.lineTo(-40, 30);
  ctx.closePath();
  ctx.fill();

  // Body
  ctx.fillStyle = '#2d6b2d';
  ctx.beginPath();
  ctx.ellipse(0, 0, 90, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#4a8a4a';
  ctx.beginPath();
  ctx.ellipse(10, 0, 55, 45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck & head
  ctx.fillStyle = '#256625';
  ctx.fillRect(60, -35, 70, 70);

  ctx.fillStyle = '#1e551e';
  ctx.beginPath();
  ctx.arc(130, 0, 45, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.arc(145, -15, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(148, -15, 5, 0, Math.PI * 2);
  ctx.fill();

  // Mouth / fire breath
  if (breathing) {
    ctx.fillStyle = '#ff4400';
    ctx.beginPath();
    ctx.moveTo(170, -10);
    ctx.lineTo(260, -40);
    ctx.lineTo(260, 40);
    ctx.lineTo(170, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(175, -5);
    ctx.lineTo(230, -25);
    ctx.lineTo(230, 25);
    ctx.lineTo(175, 5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#882222';
    ctx.fillRect(165, -8, 25, 16);
  }

  // Tail
  ctx.strokeStyle = '#256625';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-80, 0);
  ctx.quadraticCurveTo(-160, 60 + wingFlap * 30, -200, 20);
  ctx.stroke();

  ctx.restore();

  // HP bar
  const barW = 200;
  const barX = x - barW / 2;
  const barY = y - 130;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(barX - 2, barY - 2, barW + 4, 22);
  ctx.fillStyle = '#331111';
  ctx.fillRect(barX, barY, barW, 18);
  ctx.fillStyle = hp / maxHp > 0.3 ? '#ff4422' : '#ff0000';
  ctx.fillRect(barX, barY, barW * (hp / maxHp), 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🐉 Dragon ${Math.max(0, Math.ceil(hp))} HP`, x, barY + 14);
}

export function drawPowerups(ctx, pickupState, now) {
  const icons = { rocket: '🚀', shield: '🛡️', spread: '💥' };
  const colors = { rocket: '#ff6600', shield: '#4488ff', spread: '#ff44aa' };

  BOOST_PADS.forEach((pad) => {
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.fillStyle = 'rgba(0,200,255,0.2)';
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡', 0, 6);
    ctx.restore();
  });

  POWERUPS.forEach((pickup) => {
    const state = pickupState[pickup.id];
    if (state && !state.active && now < state.respawnAt) return;

    const pulse = 1 + Math.sin(now / 150 + pickup.id.length) * 0.12;
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = `${colors[pickup.type]}55`;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors[pickup.type];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icons[pickup.type], 0, 7);
    ctx.restore();
  });
}

export function drawMinimap(ctx, camera, viewSize, localCar, others, localColor, dragon) {
  const mapSize = 168;
  const pad = 10;
  const mapX = viewSize.width - mapSize - pad;
  const mapY = pad;
  const scale = Math.min(mapSize / WORLD.width, mapSize / WORLD.height);
  const drawnW = WORLD.width * scale;
  const drawnH = WORLD.height * scale;
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
  ctx.fillStyle = '#1a1210';
  ctx.fillRect(mapX, mapY, mapSize, mapSize);

  const [dx, dy] = toMap(dragon.x, dragon.y);
  ctx.fillStyle = '#ff4400';
  ctx.beginPath();
  ctx.arc(dx, dy, 8, 0, Math.PI * 2);
  ctx.fill();

  Object.values(others).forEach((o) => {
    const [mx, my] = toMap(o.x, o.y);
    ctx.fillStyle = o.color;
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

  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(
    offsetX + camera.x * scale,
    offsetY + camera.y * scale,
    viewSize.width * scale,
    viewSize.height * scale,
  );
  ctx.restore();
  ctx.restore();
}

export function isInLava(x, y) {
  return distance(x, y, DRAGON_SPAWN.x, DRAGON_SPAWN.y) < 280;
}
