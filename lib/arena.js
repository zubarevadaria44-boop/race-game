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

export function clampCamera(x, y, viewWidth, viewHeight) {
  return {
    x: Math.max(0, Math.min(x, WORLD.width - viewWidth)),
    y: Math.max(0, Math.min(y, WORLD.height - viewHeight)),
  };
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function drawHealthBar(ctx, x, y, hp, maxHp, label, barColor) {
  const barW = 72;
  const barH = 9;
  const pct = Math.max(0, hp / maxHp);
  const barX = x - barW / 2;
  const barY = y - 52;

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(barX - 2, barY - 14, barW + 4, 28);
  ctx.fillStyle = '#222';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY, barW * pct, barH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${label} ${Math.round(pct * 100)}%`, x, barY - 3);
}

export function drawArena(ctx, dragon, now) {
  ctx.fillStyle = '#1a1210';
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const gradient = ctx.createRadialGradient(dragon.x, dragon.y, 60, dragon.x, dragon.y, 340);
  gradient.addColorStop(0, dragon.enraged ? 'rgba(255,40,0,0.45)' : 'rgba(255,80,0,0.32)');
  gradient.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

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

  ctx.strokeStyle = '#553322';
  ctx.lineWidth = 12;
  ctx.strokeRect(20, 20, WORLD.width - 40, WORLD.height - 40);

  drawDragon(ctx, dragon, now);
}

export function drawDragon(ctx, dragon, now) {
  const { x, y, hp, maxHp, angle, breathing, enraged } = dragon;
  const wingFlap = Math.sin(now / (enraged ? 120 : 200)) * 0.18;
  const pct = Math.max(0, hp / maxHp);

  if (enraged) {
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(now / 80) * 0.1;
    ctx.fillStyle = '#ff2200';
    ctx.beginPath();
    ctx.arc(x, y, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.fillStyle = enraged ? '#4a3a1a' : '#3a5a2a';
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

  ctx.fillStyle = enraged ? '#6b4a2d' : '#2d6b2d';
  ctx.beginPath();
  ctx.ellipse(0, 0, 90, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = enraged ? '#8a6a4a' : '#4a8a4a';
  ctx.beginPath();
  ctx.ellipse(10, 0, 55, 45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = enraged ? '#553318' : '#256625';
  ctx.fillRect(60, -35, 70, 70);
  ctx.fillStyle = enraged ? '#442810' : '#1e551e';
  ctx.beginPath();
  ctx.arc(130, 0, 45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = enraged ? '#ff4400' : '#ffcc00';
  ctx.beginPath();
  ctx.arc(145, -15, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(148, -15, 5, 0, Math.PI * 2);
  ctx.fill();

  if (breathing) {
    ctx.fillStyle = '#ff4400';
    ctx.beginPath();
    ctx.moveTo(170, -12);
    ctx.lineTo(280, -50);
    ctx.lineTo(280, 50);
    ctx.lineTo(170, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath();
    ctx.moveTo(175, -6);
    ctx.lineTo(240, -30);
    ctx.lineTo(240, 30);
    ctx.lineTo(175, 6);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#882222';
    ctx.fillRect(165, -8, 25, 16);
  }

  ctx.strokeStyle = enraged ? '#553318' : '#256625';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-80, 0);
  ctx.quadraticCurveTo(-160, 60 + wingFlap * 30, -200, 20);
  ctx.stroke();
  ctx.restore();

  const barW = 200;
  const barX = x - barW / 2;
  const barY = y - 138;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(barX - 2, barY - 2, barW + 4, 22);
  ctx.fillStyle = '#331111';
  ctx.fillRect(barX, barY, barW, 18);
  ctx.fillStyle = pct > 0.3 ? (enraged ? '#ff2200' : '#ff4422') : '#ff0000';
  ctx.fillRect(barX, barY, barW * pct, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🐉 Dragon ${Math.round(pct * 100)}%`, x, barY + 14);
}

export function drawPowerups(ctx, pickupState, now) {
  const icons = { rocket: '🚀', shield: '🛡️', spread: '💥' };
  const colors = { rocket: '#ff6600', shield: '#4488ff', spread: '#ff44aa' };

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
  ctx.fillStyle = dragon.enraged ? '#ff2200' : '#ff6600';
  ctx.beginPath();
  ctx.arc(dx, dy, 9, 0, Math.PI * 2);
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

export function isInLava(x, y, dragonX, dragonY) {
  return distance(x, y, dragonX, dragonY) < 300;
}
