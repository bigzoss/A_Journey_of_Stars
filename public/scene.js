import { HEIGHT } from "./physics.js";
import { ATTACK_COOLDOWN, ENEMIES, gateIsReady } from "./combat.js";

const palettes = {
  moon: ["#382754", "#18142c", "#a48ac5", "#8062a7", "#ffcfa5"],
  cavern: ["#164150", "#111e35", "#63cfc6", "#397a86", "#b0ffdf"],
  dawn: ["#54344e", "#271735", "#e6a3a9", "#a26895", "#ffd3a4"],
};
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const motes = Array.from({ length: 40 }, (_, i) => ({
  x: ((i * 83.27) % 1200), y: 74 + ((i * 51.39) % 396), size: 1 + (i % 3) * .46,
}));
// Atlas cells and normalized anchors. The jump frame keeps the tucked feet above the baseline.
const travelerFrames = {
  idle: [0, 0, .51, .982],
  strideA: [1, 0, .48, .946],
  strideB: [2, 0, .52, .962],
  jump: [3, 0, .53, .91],
  fall: [0, 1, .52, .933],
  cast: [1, 1, .45, .955],
  dash: [2, 1, .52, .915],
  hurt: [3, 1, .49, .954],
};

function travelerPose(player, combat, time) {
  if (combat.dashTime > 0) return "dash";
  if (combat.hurt > .84) return "hurt";
  if (combat.attack > ATTACK_COOLDOWN - .12) return "cast";
  if (player.ground < 0) return player.vy < 0 ? "jump" : "fall";
  if (Math.abs(player.vx) > 30) return Math.floor(time * 12) % 2 ? "strideA" : "strideB";
  return "idle";
}

export function createScene(canvas) {
  const ctx = canvas.getContext("2d");
  const traveler = new Image();
  traveler.src = new URL("./assets/traveler.webp", import.meta.url).href;
  let camera = 0;

  function path(points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fill();
  }

  function drawSky(image, width, cameraX, time, tint) {
    ctx.fillStyle = "#211937";
    ctx.fillRect(0, 0, width, HEIGHT);
    if (image?.naturalWidth) {
      const imageWidth = Math.max(width * 1.16, HEIGHT * image.naturalWidth / image.naturalHeight);
      const imageHeight = imageWidth * image.naturalHeight / image.naturalWidth;
      ctx.drawImage(image, (width - imageWidth) / 2 - Math.min((imageWidth - width) / 2, cameraX * .1), (HEIGHT - imageHeight) * .12, imageWidth, imageHeight);
    }
    const fade = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    fade.addColorStop(0, "#110a2282");
    fade.addColorStop(.47, "#110a222b");
    fade.addColorStop(1, "#10091ee0");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, HEIGHT);
    if (reducedMotion.matches) return;
    ctx.fillStyle = tint;
    motes.forEach(({ x, y, size }, i) => {
      ctx.globalAlpha = .25 + .21 * Math.sin(time * 2 + i);
      ctx.beginPath();
      ctx.arc((x - cameraX * .26 + 2400) % 1200, y + Math.sin(time + i) * 10, size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawPlatform({ x, y, width }, palette, moving) {
    const [top, base, rim, grain, blossom] = palette;
    const stone = ctx.createLinearGradient(x, y, x, y + 82);
    stone.addColorStop(0, top);
    stone.addColorStop(1, base);
    path([[x, y + 2], [x + width, y + 2], [x + width - 7, y + 21],
      [x + width - 22, y + 34], [x + width * .63, y + 62], [x + width * .37, y + 74],
      [x + 24, y + 48], [x + 9, y + 30]], stone);
    path([[x + width * .42, y + 3], [x + width * .86, y + 4], [x + width * .69, y + 26], [x + width * .52, y + 64]], "#ffffff0c");
    path([[x + 7, y + 11], [x + width * .31, y + 20], [x + width * .48, y + 60], [x + 24, y + 43]], "#00000025");
    if (moving) {
      ctx.shadowColor = rim;
      ctx.shadowBlur = 15;
    }
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 4, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 13; i < width - 8; i += 18) {
      const height = 3 + (i * 31 % 8);
      path([[x + i - 3, y + 1], [x + i - 6, y - height + 2], [x + i, y - 3],
        [x + i + 3, y - height], [x + i + 4, y + 1]], grain);
      if (i % 5 === 1) {
        ctx.fillStyle = blossom;
        ctx.beginPath();
        ctx.arc(x + i + 3, y - height, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawSpikes([x, y, width]) {
    const count = Math.ceil(width / 13);
    for (let i = 0; i < count; i++) {
      const start = x + i * width / count;
      const right = x + (i + 1) * width / count;
      const tip = (start + right) / 2;
      path([[start, y], [tip, y - 17], [right, y]], "#f49ba8");
      path([[tip, y], [tip, y - 17], [right, y]], "#9b4b7d");
    }
  }

  function drawStar({ x, y, collected }, time, index) {
    if (collected) return;
    const cy = y + Math.sin(time * 3.2 + index) * 4;
    const halo = ctx.createRadialGradient(x, cy, 1, x, cy, 29);
    halo.addColorStop(0, "#ffeab67d");
    halo.addColorStop(1, "#ffd89b00");
    ctx.fillStyle = halo;
    ctx.fillRect(x - 29, cy - 29, 58, 58);
    path([[x, cy - 13], [x + 4, cy - 4], [x + 12, cy], [x + 4, cy + 4], [x, cy + 13],
      [x - 4, cy + 4], [x - 12, cy], [x - 4, cy - 4]], "#ffeab5");
    path([[x, cy - 10], [x + 3, cy], [x, cy + 9], [x - 3, cy]], "#fff9df");
  }

  function drawPortal([x, y], active, time, palette) {
    const color = active ? palette[4] : "#a799bb";
    ctx.save();
    ctx.translate(x, y - 32);
    ctx.scale(.64, 1);
    const light = ctx.createRadialGradient(0, 0, 2, 0, 0, 49);
    light.addColorStop(0, active ? color : "#342946");
    light.addColorStop(1, "#30204400");
    ctx.fillStyle = light;
    ctx.globalAlpha = active ? .84 : .72;
    ctx.fillRect(-50, -50, 100, 100);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = active ? 19 : 0;
    ctx.beginPath();
    ctx.arc(0, 0, 29, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = -time * 11;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (!active) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y - 35, 3.7, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(x - 6, y - 35, 12, 9);
    }
  }

  function ellipse(x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCheckpoint(run, time) {
    if (!run.level.checkpoint) return;
    const { x, platform } = run.level.checkpoint;
    const y = run.platforms[platform].y;
    if (run.checkpoint) {
      const light = ctx.createRadialGradient(x, y - 13, 2, x, y - 13, 44);
      light.addColorStop(0, "#ffbf819b");
      light.addColorStop(1, "#ffbf8100");
      ellipse(x, y - 13, 44, 44, light);
    }
    ellipse(x, y - 1, 19, 4, "#b68b9f");
    path([[x - 12, y - 1], [x - 9, y - 6], [x + 12, y - 3], [x + 10, y]], "#4e2e48");
    path([[x - 11, y - 3], [x + 9, y - 7], [x + 12, y - 1], [x - 9, y]], "#8a535a");
    const tip = Math.sin(time * 8) * 2;
    path([[x - 10, y - 5], [x - 9, y - 15], [x - 4, y - 11], [x + tip, y - 26],
      [x + 8, y - 18], [x + 10, y - 8], [x + 5, y - 4]], run.checkpoint ? "#ffa075" : "#65435c");
    if (run.checkpoint) path([[x - 5, y - 5], [x - 2, y - 15], [x + 2, y - 12], [x + 4, y - 19], [x + 7, y - 8], [x + 3, y - 4]], "#ffe9af");
  }

  function drawEnemy(enemy, time) {
    if (!enemy.hp) return;
    const { x, y, kind, guardian, flash, windup, aim } = enemy;
    const { color, radius } = ENEMIES[kind];
    const charging = enemy.chargeTime > 0;
    if (enemy.hop) ellipse(x, enemy.groundY, 28, 4, "#29132a8c");
    ctx.save();
    ctx.translate(x, y);
    if (enemy.dormant) ctx.globalAlpha = .68;
    if (windup > 0) {
      ctx.save();
      const chargeWarning = enemy.pattern === "charge";
      const chargeDistance = enemy.chargeTarget - x;
      ctx.rotate(chargeWarning ? (chargeDistance < 0 ? Math.PI : 0) : aim);
      ctx.strokeStyle = chargeWarning ? "#ffd38e" : "#ff9ab8c4";
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = chargeWarning ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(radius + 7, 0);
      ctx.lineTo(chargeWarning ? Math.max(radius + 19, Math.abs(chargeDistance)) : radius + 98, 0);
      ctx.stroke();
      ctx.restore();
    }
    if (charging) {
      const behind = enemy.chargeTarget < x ? 1 : -1;
      ctx.strokeStyle = "#ffd38eb0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const offset of [-12, 0, 12]) {
        ctx.moveTo(behind * 29, offset);
        ctx.lineTo(behind * (67 - Math.abs(offset)), offset);
      }
      ctx.stroke();
    }
    if (guardian) {
      ctx.strokeStyle = windup ? "#ffc8ba" : `${color}92`;
      ctx.lineWidth = windup ? 2.6 : 1.25;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -time * 9;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, radius * 1.85);
    halo.addColorStop(0, charging ? "#ffd38ec8" : windup ? "#ff9bbdb0" : `${color}6b`);
    halo.addColorStop(1, `${color}00`);
    ellipse(0, 0, radius * 1.85, radius * 1.85, halo);

    const highlight = flash ? "#fff9ea" : color;
    if (kind === "wisp") {
      const tail = Math.sin(time * 5 + enemy.phase) * 5;
      const glow = ctx.createLinearGradient(0, -20, 0, 19);
      glow.addColorStop(0, highlight);
      glow.addColorStop(1, "#704ba7");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(-15, 4);
      ctx.bezierCurveTo(-22, -5, -12, -20, 0, -21);
      ctx.bezierCurveTo(13, -22, 22, -7, 16, 6);
      ctx.quadraticCurveTo(8, 21, -10 + tail, 19);
      ctx.quadraticCurveTo(1 + tail, 10, -15, 4);
      ctx.fill();
      ellipse(-6, -5, 2.3, 3.5, "#29173c");
      ellipse(6, -5, 2.3, 3.5, "#29173c");
    } else if (kind === "crystal") {
      ellipse(0, 8, 21, 11, "#153746");
      path([[-21, 3], [-16, -9], [-9, -5], [-5, -19], [7, -12], [13, -16], [22, -4], [17, 9], [-16, 11]], "#4eafa9");
      path([[-16, -9], [-9, -5], [-5, -19], [7, -12], [0, 2], [-13, 3]], highlight);
      path([[7, -12], [13, -16], [22, -4], [12, 3], [0, 2]], "#c1ffea");
      ellipse(-7, 7, 2, 2, "#e5fff5");
      ellipse(6, 7, 2, 2, "#e5fff5");
    } else {
      const wings = Math.sin(time * 3) * 4;
      path([[-13, -9], [-42, -26 + wings], [-37, 0], [-19, 16], [-12, 27], [12, 27], [19, 16], [37, 0], [42, -26 + wings], [13, -9]], "#592b57");
      path([[-13, -9], [-36, -19 + wings], [-31, -2], [-17, 12]], "#b26885");
      path([[13, -9], [36, -19 + wings], [31, -2], [17, 12]], "#b26885");
      path([[0, -34], [21, -15], [17, 10], [0, 29], [-17, 10], [-21, -15]], "#833e67");
      path([[0, -30], [17, -15], [12, -3], [0, 4], [-12, -3], [-17, -15]], highlight);
      path([[0, -12], [8, 1], [0, 15], [-8, 1]], windup ? "#fff4ca" : "#eb8bb5");
      ellipse(-8, -12, 2.5, 1.7, "#301332");
      ellipse(8, -12, 2.5, 1.7, "#301332");
    }

    if (enemy.maxHp > 1 && kind !== "sentinel") {
      ctx.fillStyle = "#25152f";
      ctx.fillRect(-16, -radius - 11, 32, 4);
      ctx.fillStyle = color;
      ctx.fillRect(-16, -radius - 11, 32 * enemy.hp / enemy.maxHp, 4);
    }
    ctx.restore();
  }

  function drawCombat(combat) {
    for (const shot of combat.shots) {
      const color = shot.hostile ? "#ff87a9" : "#ffdfa1";
      ctx.save();
      ctx.translate(shot.x, shot.y);
      ctx.rotate(Math.atan2(shot.vy, shot.vx));
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      path([[-20, 0], [-3, -4], [7, 0], [-3, 4]], color);
      ellipse(0, 0, 3.5, 2.2, "#fff8e8");
      ctx.restore();
    }
    for (const spark of combat.sparks) {
      ctx.save();
      ctx.globalAlpha = spark.life / .35;
      const radius = 6 + spark.size * (1 - ctx.globalAlpha);
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (!reducedMotion.matches) {
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          ellipse(spark.x + Math.cos(angle) * radius, spark.y + Math.sin(angle) * radius, 2, 2, spark.color);
        }
      }
      ctx.restore();
    }
  }

  function drawTraveler(player, pose, x = player.x) {
    const [column, row, anchorX, anchorY] = travelerFrames[pose];
    const cellWidth = traveler.naturalWidth / 4;
    const cellHeight = traveler.naturalHeight / 2;
    const height = 60;
    const width = height * cellWidth / cellHeight;
    ctx.save();
    ctx.translate(x, player.y);
    ctx.scale(player.facing, 1);
    ctx.drawImage(traveler, column * cellWidth, row * cellHeight, cellWidth, cellHeight,
      -width * anchorX, -height * anchorY, width, height);
    ctx.restore();
  }

  return {
    ready: traveler.decode(),
    reset() { camera = 0; },
    draw(run, image, elapsed) {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(clientWidth * dpr);
      const pixelHeight = Math.round(clientHeight * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const scale = pixelHeight / HEIGHT;
      const width = pixelWidth / scale;
      const time = reducedMotion.matches ? 0 : run.time;
      const palette = palettes[run.level.id];
      const target = Math.max(0, Math.min(run.level.width - width, run.player.x - width * .39));
      camera += (target - camera) * (1 - Math.exp(-elapsed * 12));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawSky(image, width, camera, time, palette[4]);
      ctx.translate(-camera, 0);
      run.platforms.forEach((platform, i) => {
        if (platform.x < camera + width + 20 && platform.x + platform.width > camera - 20) {
          drawPlatform(platform, palette, i >= run.level.platforms.length);
        }
      });
      run.level.spikes.forEach(drawSpikes);
      drawCheckpoint(run, time);
      run.stars.forEach((star, i) => drawStar(star, time, i));
      drawPortal(run.level.portal, gateIsReady(run), time, palette);
      run.combat.enemies.forEach(enemy => drawEnemy(enemy, time));
      drawCombat(run.combat);
      const { player, combat } = run;
      const { dashTime, dashDirection, hurt } = combat;
      const pose = travelerPose(player, combat, time);
      if (player.ground >= 0) ellipse(player.x, player.y, 15, 3, "#140c2385");
      if (dashTime > 0 && !reducedMotion.matches) {
        ctx.globalAlpha = .18;
        drawTraveler(player, pose, player.x - 29 * dashDirection);
        ctx.globalAlpha = .38;
        drawTraveler(player, pose, player.x - 14 * dashDirection);
      }
      ctx.globalAlpha = hurt > 0 && !reducedMotion.matches && Math.floor(hurt * 10) % 2 ? .54 : 1;
      drawTraveler(player, pose);
      ctx.globalAlpha = 1;
    },
  };
}
