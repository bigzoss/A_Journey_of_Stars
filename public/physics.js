import { beginCombat, createCombat, DASH_SPEED, gateIsReady, MAX_HEALTH, recoverCombat, updateCombat } from "./combat.js";

export const STEP = 1 / 120;
export const HEIGHT = 550;
const HALF_WIDTH = 12;
const BODY_HEIGHT = 32;
const GRAVITY = 1190;
const JUMP_SPEED = 500;
const TOP_SPEED = 290;

const approach = (value, goal, delta) =>
  value + Math.sign(goal - value) * Math.min(delta, Math.abs(goal - value));

function spawn(level, atCheckpoint = false) {
  const { platform, x } = atCheckpoint ? level.checkpoint : { platform: 0, x: 57 };
  return { x, y: level.platforms[platform][1], vx: 0, vy: 0, ground: platform, grace: .1, facing: 1 };
}

export function createRun(level) {
  return {
    level, player: spawn(level), time: 0, deaths: 0, combat: createCombat(level),
    platforms: [...level.platforms, ...level.moving].map(([x, y, width]) => ({ x, y, width, dx: 0 })),
    stars: level.stars.map(([x, y]) => ({ x, y, collected: false })),
    jumpBuffer: 0, portalHint: false, checkpoint: false,
  };
}

function respawn(run, events, reason) {
  run.deaths++;
  run.player = spawn(run.level, run.checkpoint);
  run.jumpBuffer = 0;
  run.portalHint = false;
  recoverCombat(run.combat);
  events.push(reason);
}

export function step(run, direction, jump, skills = {}) {
  const events = [];
  const { level, player, platforms, combat } = run;
  run.time += STEP;
  level.moving.forEach(([x, , , range, period], i) => {
    const platform = platforms[level.platforms.length + i];
    const nextX = x + Math.sin(run.time * Math.PI * 2 / period) * range;
    platform.dx = nextX - platform.x;
    platform.x = nextX;
  });

  if (player.ground >= 0) player.x += platforms[player.ground].dx;
  if (direction && combat.dashTime <= STEP) player.facing = direction;
  beginCombat(combat, player, skills, STEP, events);
  const acceleration = direction ? 2050 : player.ground >= 0 ? 2600 : 1300;
  player.vx = combat.dashTime > 0 ? combat.dashDirection * DASH_SPEED :
    approach(player.vx, direction * TOP_SPEED, acceleration * STEP);
  player.x = Math.max(HALF_WIDTH, Math.min(level.width - HALF_WIDTH, player.x + player.vx * STEP));
  run.jumpBuffer = jump ? .13 : Math.max(0, run.jumpBuffer - STEP);
  player.grace = player.ground >= 0 ? .10 : Math.max(0, player.grace - STEP);
  if (run.jumpBuffer > 0 && player.grace > 0) {
    player.vy = -JUMP_SPEED;
    player.grace = 0;
    run.jumpBuffer = 0;
    events.push("jump");
  }

  const oldY = player.y;
  const oldGround = player.ground;
  player.ground = -1;
  player.vy += GRAVITY * STEP;
  player.y += player.vy * STEP;
  if (player.vy >= 0) {
    platforms.forEach(({ x, y, width }, i) => {
      if (player.x + HALF_WIDTH > x && player.x - HALF_WIDTH < x + width && oldY <= y && player.y >= y) {
        player.y = y;
        player.vy = 0;
        player.ground = i;
      }
    });
  }
  if (player.ground >= 0 && oldGround < 0) events.push("land");

  const hitSpike = level.spikes.some(([x, y, width]) =>
    player.x + 8 > x && player.x - 8 < x + width && player.y > y - 13 && player.y - BODY_HEIGHT < y);
  if (player.y > HEIGHT + 38 || hitSpike) {
    respawn(run, events, "fall");
    return events;
  }

  if (!run.checkpoint && player.ground === level.checkpoint?.platform) {
    run.checkpoint = true;
    combat.health = MAX_HEALTH;
    combat.hurt = Math.max(combat.hurt, .7);
    events.push("checkpoint");
  }
  updateCombat(run, STEP, events);
  if (!combat.health) {
    respawn(run, events, "knockout");
    return events;
  }

  for (const star of run.stars) {
    if (!star.collected && Math.hypot(star.x - player.x, star.y - (player.y - 19)) < 29) {
      star.collected = true;
      events.push("star");
    }
  }
  const [gateX, gateY] = level.portal;
  const atGate = Math.abs(player.x - gateX) < 24 && Math.abs(player.y - gateY) < 44;
  if (atGate && gateIsReady(run)) events.push("clear");
  else if (atGate && !run.portalHint) events.push("locked");
  run.portalHint = atGate;
  return events;
}
