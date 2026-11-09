export const MAX_HEALTH = 3;
export const ATTACK_COOLDOWN = .32;
export const DASH_COOLDOWN = 1.3;
export const DASH_SPEED = 645;
const SENTINEL_HOP_TIME = .44;
const SENTINEL_CHARGE_SPEED = 480;

export const ENEMIES = {
  wisp: { radius: 17, height: 25, color: "#cb9af7", windup: .55, interval: 1.8, reach: 280 },
  crystal: { radius: 21, height: 18, color: "#8ff6dc", windup: .56, interval: 1.6, reach: 345 },
  sentinel: { radius: 34, height: 32, color: "#ffc1ab", windup: .58, interval: 1.05, reach: 390 },
};

function createEnemy(enemy, index, level) {
  const state = {
    ...enemy, originX: enemy.x, groundY: enemy.y, y: enemy.y - ENEMIES[enemy.kind].height,
    maxHp: enemy.hp, phase: index * 1.4, windup: 0, cooldown: .65 + index * .2,
    aim: 0, flash: 0,
  };
  if (enemy.kind !== "sentinel") return state;
  const [x, , width] = level.platforms.find(([left, top, span]) =>
    top === enemy.y && enemy.x >= left && enemy.x <= left + span);
  return {
    ...state, arenaLeft: x + 28, arenaRight: x + width - 28, cooldown: .22,
    pattern: "volley", hop: null, chargeTime: 0, chargeTarget: enemy.x, dormant: Boolean(level.checkpoint),
  };
}

export function createCombat(level) {
  return {
    health: MAX_HEALTH, attack: 0, dash: 0, dashTime: 0, dashDirection: 1,
    dashHits: new Set(), hurt: 0, shots: [], sparks: [],
    enemies: (level.enemies ?? []).map((enemy, i) => createEnemy(enemy, i, level)),
  };
}

export function beginCombat(combat, player, input, dt, events) {
  combat.attack = Math.max(0, combat.attack - dt);
  combat.dash = Math.max(0, combat.dash - dt);
  combat.dashTime = Math.max(0, combat.dashTime - dt);
  combat.hurt = Math.max(0, combat.hurt - dt);
  if (input.dash && combat.dash === 0) {
    combat.dash = DASH_COOLDOWN;
    combat.dashTime = .17;
    combat.dashDirection = player.facing;
    combat.dashHits.clear();
    events.push("dash");
  }
  if (input.attack && combat.attack === 0) {
    combat.attack = ATTACK_COOLDOWN;
    combat.shots.push({ x: player.x + player.facing * 17, y: player.y - 22,
      vx: player.facing * 550, vy: 0, radius: 7, life: .68, hostile: false });
    events.push("attack");
  }
}

function burst(combat, x, y, color, size) {
  combat.sparks.push({ x, y, color, size, life: .35 });
}

function hitEnemy(combat, enemy, events) {
  enemy.hp--;
  enemy.flash = .13;
  burst(combat, enemy.x, enemy.y, ENEMIES[enemy.kind].color, enemy.hp ? 20 : 43);
  if (enemy.hp > 0) {
    events.push("hit");
    return;
  }
  if (enemy.guardian) {
    for (const shot of combat.shots) {
      if (shot.hostile) shot.life = 0;
    }
    events.push("guardian");
  } else {
    events.push("defeat");
  }
  if (combat.health < MAX_HEALTH) {
    combat.health++;
    events.push("heal");
  }
}

function hitPlayer(combat, player, events) {
  if (combat.hurt > 0 || combat.dashTime > 0 || combat.health === 0) return;
  combat.health--;
  combat.hurt = 1;
  burst(combat, player.x, player.y - 19, "#ff9ab7", 29);
  events.push("hurt");
}

function fireShots(combat, enemy, spread, speed) {
  for (const offset of spread) {
    const angle = enemy.aim + offset;
    combat.shots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed, radius: 7, life: 2.15, hostile: true });
  }
}

function moveTowards(x, target, distance) {
  return x + Math.sign(target - x) * Math.min(distance, Math.abs(target - x));
}

function keepInArena(enemy, x) {
  return Math.max(enemy.arenaLeft, Math.min(enemy.arenaRight, x));
}

function repositionSentinel(enemy, player) {
  const dx = player.x - enemy.x;
  const direction = dx < 0 ? -1 : 1;
  const otherSide = player.x + direction * 76;
  let target;
  if (Math.abs(dx) > 152) {
    target = moveTowards(enemy.x, player.x - direction * 102, 116);
  } else if (otherSide >= enemy.arenaLeft && otherSide <= enemy.arenaRight) {
    target = moveTowards(enemy.x, otherSide, 205);
  } else {
    target = keepInArena(enemy, enemy.x - direction * 98);
  }
  if (Math.abs(target - enemy.x) >= 24) enemy.hop = { from: enemy.x, to: target, time: 0 };
}

function updateSentinel(combat, enemy, player, time, dt, awake, events) {
  const { height, windup, interval, reach } = ENEMIES.sentinel;
  enemy.dormant = !awake;
  enemy.y = enemy.groundY - height + Math.sin(time * 2.2) * 6;
  if (!awake) {
    enemy.x = enemy.originX + enemy.range * Math.sin(time * .84 + enemy.phase);
    return;
  }

  if (enemy.hop) {
    const hop = enemy.hop;
    hop.time = Math.min(SENTINEL_HOP_TIME, hop.time + dt);
    const progress = hop.time / SENTINEL_HOP_TIME;
    enemy.x = hop.from + (hop.to - hop.from) * progress * progress * (3 - 2 * progress);
    enemy.y -= Math.sin(progress * Math.PI) * 52;
    if (progress === 1) enemy.hop = null;
    return;
  }

  if (enemy.chargeTime > 0) {
    enemy.x = moveTowards(enemy.x, enemy.chargeTarget, SENTINEL_CHARGE_SPEED * dt);
    enemy.chargeTime = enemy.x === enemy.chargeTarget ? 0 : Math.max(0, enemy.chargeTime - dt);
    if (enemy.chargeTime === 0) {
      enemy.pattern = "volley";
      enemy.cooldown = interval;
    }
    return;
  }

  if (enemy.windup > 0) {
    enemy.windup = Math.max(0, enemy.windup - dt);
    if (enemy.windup > 0) return;
    if (enemy.pattern === "volley") {
      fireShots(combat, enemy, [-.24, 0, .24], 245);
      events.push("bossVolley");
      enemy.pattern = "charge";
      enemy.cooldown = .26;
      repositionSentinel(enemy, player);
    } else {
      enemy.chargeTime = Math.abs(enemy.chargeTarget - enemy.x) / SENTINEL_CHARGE_SPEED;
      if (enemy.chargeTime > 0) {
        events.push("bossCharge");
      } else {
        enemy.pattern = "volley";
        enemy.cooldown = interval;
      }
    }
    return;
  }

  const dx = player.x - enemy.x;
  const dy = player.y - 19 - enemy.y;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  if (enemy.cooldown === 0 && Math.hypot(dx, dy) < reach) {
    enemy.windup = windup;
    enemy.aim = Math.atan2(dy, dx);
    if (enemy.pattern === "charge") enemy.chargeTarget = keepInArena(enemy, enemy.x + (dx < 0 ? -245 : 245));
    return;
  }
  const preferredDistance = enemy.pattern === "charge" ? 94 : 118;
  const predictedX = player.x + player.vx * .14;
  const target = keepInArena(enemy, predictedX + (dx > 0 ? -preferredDistance : preferredDistance));
  enemy.x = moveTowards(enemy.x, target, 132 * dt);
}

function updateEnemy(combat, enemy, player, time, dt, bossAwake, events) {
  enemy.flash = Math.max(0, enemy.flash - dt);
  if (enemy.kind === "sentinel") {
    updateSentinel(combat, enemy, player, time, dt, bossAwake, events);
    return;
  }
  const { windup, interval, reach } = ENEMIES[enemy.kind];
  enemy.x = enemy.originX + enemy.range * Math.sin(time * 1.5 + enemy.phase);
  enemy.y = enemy.groundY - ENEMIES[enemy.kind].height;
  if (enemy.kind === "wisp") enemy.y += Math.sin(time * 4 + enemy.phase) * 5;
  if (enemy.kind === "wisp" && !enemy.guardian) return;

  const dx = player.x - enemy.x;
  const dy = player.y - 19 - enemy.y;
  if (enemy.windup > 0) {
    enemy.windup = Math.max(0, enemy.windup - dt);
    if (enemy.windup > 0) return;
    fireShots(combat, enemy, [0], 225);
    enemy.cooldown = interval;
    return;
  }
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  if (enemy.cooldown === 0 && Math.hypot(dx, dy) < reach) {
    enemy.windup = windup;
    enemy.aim = Math.atan2(dy, dx);
  }
}

function touchesEnemy(x, y, radius, enemy) {
  return Math.hypot(x - enemy.x, y - enemy.y) < radius + ENEMIES[enemy.kind].radius;
}

export function updateCombat(run, dt, events) {
  const { combat, player, time } = run;
  const dashActive = combat.dashTime > 0;
  const bossAwake = !run.level.checkpoint || run.checkpoint;
  for (const enemy of combat.enemies) {
    if (!enemy.hp) continue;
    updateEnemy(combat, enemy, player, time, dt, bossAwake, events);
    if (enemy.dormant || !touchesEnemy(player.x, player.y - 19, 12, enemy)) continue;
    if (dashActive && !combat.dashHits.has(enemy)) {
      combat.dashHits.add(enemy);
      hitEnemy(combat, enemy, events);
    } else {
      hitPlayer(combat, player, events);
    }
  }

  for (const shot of combat.shots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    if (shot.life <= 0) continue;
    if (shot.hostile) {
      if (Math.hypot(shot.x - player.x, shot.y - (player.y - 19)) >= shot.radius + 12) continue;
      shot.life = 0;
      hitPlayer(combat, player, events);
    } else {
      const enemy = combat.enemies.find(target => target.hp && !target.dormant && touchesEnemy(shot.x, shot.y, shot.radius, target));
      if (!enemy) continue;
      shot.life = 0;
      hitEnemy(combat, enemy, events);
    }
  }
  combat.shots = combat.shots.filter(shot => shot.life > 0);
  for (const spark of combat.sparks) spark.life -= dt;
  combat.sparks = combat.sparks.filter(spark => spark.life > 0);
}

export function recoverCombat(combat) {
  combat.health = MAX_HEALTH;
  combat.hurt = 1;
  combat.dash = combat.dashTime = combat.attack = 0;
  combat.shots.length = combat.sparks.length = 0;
  for (const enemy of combat.enemies) {
    enemy.windup = 0;
    enemy.cooldown = Math.max(enemy.cooldown, 1.1);
    if (enemy.kind === "sentinel") {
      enemy.x = enemy.originX;
      enemy.pattern = "volley";
      enemy.hop = null;
      enemy.chargeTime = 0;
    }
  }
}

export function gateIsReady(run) {
  return run.stars.every(star => star.collected) && !run.combat.enemies.some(enemy => enemy.guardian && enemy.hp);
}
