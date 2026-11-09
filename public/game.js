import { createRun, STEP, step } from "./physics.js";
import { createScene } from "./scene.js";
import { ATTACK_COOLDOWN, DASH_COOLDOWN, gateIsReady, MAX_HEALTH } from "./combat.js";
import { enableReward, showReward } from "./reward.js";

const $ = id => document.getElementById(id);
const cards = [...document.querySelectorAll("[data-level]")];
const start = $("start");
const guide = $("guide");
const stage = $("stage");
const playfield = $("playfield");
const overlay = $("overlay");
const action = $("overlay-action");
const touchControls = $("touch-controls");
const combatButtons = [
  ["attack", ATTACK_COOLDOWN, touchControls.querySelector('[data-key="attack"]')],
  ["dash", DASH_COOLDOWN, touchControls.querySelector('[data-key="dash"]')],
];
const scene = createScene($("world"));
const images = new Map();
const music = new Audio();
music.loop = true;
music.volume = .32;
music.preload = "none";
const descriptions = [
  ["跟随月光穿过森林，拾起遗落的星芒。", "学会星弹与冲刺，击败林间守门者。"],
  ["越过幽蓝的断崖，留心尖刺和晶甲兽。", "躲过飞弹，破开洞窟深处的封印。"],
  ["踏上随风漂移的浮岛，向晨光出发。", "击败曙光守卫，让星芒照亮归途。"],
];
const keyMap = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump",
  KeyJ: "attack", KeyK: "dash",
};
const tones = {
  jump: [310], star: [660, 880, 1109], fall: [190, 145], clear: [440, 554, 659, 880],
  attack: [510], dash: [395, 585], hit: [250], hurt: [156], defeat: [521, 782], guardian: [392, 587, 784], knockout: [190, 145],
  checkpoint: [392, 523, 659],
  bossVolley: [242, 362, 302], bossCharge: [148, 108],
};
const saveKey = "luma-trail.combat.v1";
const originalSaveKey = "luma-trail.progress.v1";
const held = new Set();
const pointers = new Map();
const taps = new Set();
const originalTimes = readSave(originalSaveKey);
const bestTimes = readSave(saveKey);
const hasCleared = i => Boolean(bestTimes[i] || originalTimes[i]);
let levels = [];
let selected = 0;
let mode = "menu";
let run;
let audioContext;
let muted = readMuted();
let toastUntil = 0;
let displayedSecond = -1;
let accumulator = 0;
let previousFrame;

function readMuted() {
  try {
    return localStorage.getItem("luma-trail.muted") === "true";
  } catch {
    return false;
  }
}

function updateAudioButton() {
  $("audio").setAttribute("aria-pressed", String(!muted));
  $("audio").querySelector("use").setAttribute("href", muted ? "#i-muted" : "#i-audio");
}

function resumeAudio() {
  if (muted) return;
  if (mode === "playing") music.play().catch(() => {});
  try {
    audioContext ??= new AudioContext();
    audioContext.resume().catch(() => {});
  } catch {
    // Background music uses the media element independently of effects.
  }
}

function readSave(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(stored)) {
      return [0, 1, 2].map(i => Number.isFinite(stored[i]) && stored[i] > 0 ? stored[i] : null);
    }
  } catch {
    // Gameplay remains available when storage is blocked.
  }
  return [null, null, null];
}

function saveTime() {
  const previous = bestTimes[selected];
  if (!previous || run.time < previous) bestTimes[selected] = run.time;
  try {
    localStorage.setItem(saveKey, JSON.stringify(bestTimes));
  } catch {
    // The current tab still retains progress.
  }
}

function refreshChapters() {
  const completed = levels.filter((_, i) => hasCleared(i)).length;
  $("progress-label").textContent = `已通关 ${completed} / 3`;
  document.querySelectorAll(".progress-track i").forEach((line, i) => {
    line.classList.toggle("done", i < completed);
  });
  cards.forEach((card, i) => {
    const locked = i > 0 && !hasCleared(i - 1);
    const cleared = hasCleared(i);
    const status = locked ? "未解锁" : cleared ? "已通关" : "可游玩";
    card.disabled = !levels.length || locked;
    card.setAttribute("aria-pressed", String(i === selected));
    card.setAttribute("aria-label", `${card.querySelector("strong").textContent}，${status}`);
    card.querySelector("use").setAttribute("href", locked ? "#i-lock" : cleared ? "#i-check" : "#i-play");
  });
}

function formatTime(time) {
  const seconds = Math.floor(time);
  return [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, "0")).join(":");
}

const chapterNumber = () => String(selected + 1).padStart(2, "0");

function updateCover() {
  const level = levels[selected];
  const [first, second] = descriptions[selected];
  stage.style.setProperty("--scene", `var(--${level.id})`);
  $("hero-chapter").textContent = `CHAPTER ${chapterNumber()}`;
  $("cover-number").textContent = chapterNumber();
  $("hero-name").textContent = level.name;
  $("hero-description").replaceChildren(first, document.createElement("br"), second);
  start.querySelector("span").textContent = hasCleared(selected) ? "再访此地" : selected ? "进入章节" : "开启旅程";
  const best = bestTimes[selected];
  const original = originalTimes[selected];
  $("start-hint").textContent = best ? `战斗版最佳 ${formatTime(best)}` :
    original ? `原版最佳 ${formatTime(original)} · 挑战战斗版` : "集齐 3 颗星芒 · 击败守门者";
  refreshChapters();
}

function resetInput() {
  held.clear();
  pointers.clear();
  taps.clear();
  touchControls.querySelectorAll(".held").forEach(button => button.classList.remove("held"));
}

function showMenu(index = selected) {
  mode = "menu";
  music.pause();
  selected = index;
  resetInput();
  overlay.hidden = playfield.hidden = touchControls.hidden = true;
  $("cover").hidden = false;
  updateCover();
  start.focus({ preventScroll: true });
}

function updateStars() {
  const count = run.stars.filter(star => star.collected).length;
  $("hud-stars").setAttribute("aria-label", `已收集 ${count} / 3 颗星芒`);
  [...$("hud-stars").children].forEach((star, i) => star.classList.toggle("collected", i < count));
  return count;
}

function updateHealth() {
  const { health } = run.combat;
  $("hud-health").setAttribute("aria-label", `生命 ${health} / ${MAX_HEALTH}`);
  [...$("hud-health").children].forEach((heart, i) => heart.classList.toggle("full", i < health));
}

function updateCombatHud() {
  for (const [key, duration, button] of combatButtons) {
    const cooldown = run.combat[key];
    button.style.setProperty("--ready", String(1 - cooldown / duration));
    button.classList.toggle("cooling", cooldown > 0);
  }
  const boss = run.combat.enemies.find(enemy => enemy.kind === "sentinel");
  const visible = Boolean(boss?.hp && Math.abs(boss.x - run.player.x) < 430);
  $("boss-hud").hidden = !visible;
  if (visible) {
    const health = $("boss-health");
    health.setAttribute("aria-valuemax", boss.maxHp);
    health.setAttribute("aria-valuenow", boss.hp);
    health.style.setProperty("--hp", String(boss.hp / boss.maxHp));
    const status = boss.dormant ? "沉睡中" : boss.chargeTime > 0 ? "冲锋中" : boss.hop ? "跃起换位" :
      boss.windup > 0 ? (boss.pattern === "charge" ? "蓄力冲锋" : "蓄力飞弹") : "追击中";
    const label = $("boss-status");
    if (label.textContent !== status) label.textContent = status;
  }
}

function toast(text) {
  $("toast").textContent = text;
  toastUntil = run.time + 2.4;
}

function enter(index = selected) {
  if (!levels[index] || (index > 0 && !hasCleared(index - 1))) return;
  selected = index;
  const level = levels[index];
  resetInput();
  run = createRun(level);
  scene.reset();
  accumulator = 0;
  displayedSecond = -1;
  mode = "playing";
  music.src = `assets/music-${level.id}.wav`;
  resumeAudio();
  $("chapter-number").textContent = `CHAPTER ${chapterNumber()}`;
  $("chapter-name").textContent = level.name;
  $("timer").textContent = "00:00";
  $("cover").hidden = overlay.hidden = true;
  playfield.hidden = touchControls.hidden = false;
  updateStars();
  updateHealth();
  updateCombatHud();
  $("guard-status").textContent = "击败守门者，解除封印";
  refreshChapters();
  toast(selected === 0 ? "星弹可连发 · 冲刺可躲避飞弹" : "集齐星芒，击败本关守门者");
  playfield.tabIndex = -1;
  playfield.focus({ preventScroll: true });
  const bounds = stage.getBoundingClientRect();
  const bottom = Math.max(bounds.bottom, touchControls.getBoundingClientRect().bottom);
  if (bounds.top < 0 || bottom > innerHeight) stage.scrollIntoView({ block: "start" });
}

function showOverlay(label, title, detail, button) {
  resetInput();
  $("back").hidden = false;
  $("overlay-label").textContent = label;
  $("overlay-title").textContent = title;
  $("overlay-text").textContent = detail;
  action.textContent = button;
  overlay.hidden = false;
  touchControls.hidden = true;
  action.focus({ preventScroll: true });
}

function pause() {
  if (mode !== "playing") return;
  mode = "paused";
  music.pause();
  showOverlay("JOURNEY PAUSED", "片刻休息", "星光会在这里等你。", "继续旅程");
}

function resume() {
  resetInput();
  accumulator = 0;
  mode = "playing";
  resumeAudio();
  overlay.hidden = true;
  touchControls.hidden = false;
  playfield.focus({ preventScroll: true });
}

function clearLevel() {
  mode = "cleared";
  music.pause();
  saveTime();
  refreshChapters();
  const final = selected === levels.length - 1;
  const defeats = run.combat.enemies.filter(enemy => !enemy.hp).length;
  showOverlay(
    final ? "THE JOURNEY COMPLETE" : "CHAPTER COMPLETE",
    final ? "星途走到了黎明" : `${run.level.name} · 已通关`,
    `星芒 3 / 3 · 击败 ${defeats} 只怪物 · 用时 ${formatTime(run.time)} · 复活 ${run.deaths} 次`,
    final ? "查看奶茶兑换卡" : "前往下一章节"
  );
  if (final) {
    enableReward(true);
    showReward();
  }
}

function playSound(event) {
  if (muted || audioContext?.state !== "running") return;
  tones[event]?.forEach((frequency, i) => {
    const time = audioContext.currentTime + i * .09;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(.001, time);
    gain.gain.exponentialRampToValueAtTime(.11, time + .014);
    gain.gain.exponentialRampToValueAtTime(.001, time + .24);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + .25);
  });
}

function processEvent(event) {
  if (event === "clear") {
    clearLevel();
  } else if (event === "star") {
    const count = updateStars();
    toast(gateIsReady(run) ? "传送门已开启，继续向右" : count === 3 ? "星芒已集齐，还需击败守门者" : `已拾取星芒 ${count} / 3`);
  } else if (event === "fall" || event === "knockout") {
    if (!run.checkpoint) scene.reset();
    updateHealth();
    toast(`回到${run.checkpoint ? "篝火" : "起点"}，生命恢复，星芒和战斗进度已保留`);
  } else if (event === "checkpoint") {
    updateHealth();
    toast("篝火已点亮 · 生命恢复 · 可在此复活");
  } else if (event === "guardian") {
    $("guard-status").textContent = "守门者已击败";
    toast(gateIsReady(run) ? "封印已解除，进入传送门" : "守门者已击败，继续寻找星芒");
  } else if (event === "hurt") {
    updateHealth();
    toast(`受到攻击 · 剩余 ${run.combat.health} 颗心`);
  } else if (event === "heal") {
    updateHealth();
  } else if (event === "locked") {
    toast("传送门有封印，需要集齐星芒并击败守门者");
  }
  playSound(event);
}

function pressed(direction) {
  return [...held].some(code => keyMap[code] === direction) || [...pointers.values()].includes(direction);
}

function frame(now) {
  const elapsed = Math.min(.05, (now - (previousFrame ?? now)) / 1000);
  previousFrame = now;
  if (mode === "playing") {
    accumulator += elapsed;
    while (accumulator >= STEP && mode === "playing") {
      const direction = Number(pressed("right")) - Number(pressed("left"));
      const events = step(run, direction, taps.has("jump"), {
        attack: taps.has("attack") || pressed("attack"), dash: taps.has("dash"),
      });
      taps.clear();
      accumulator -= STEP;
      events.forEach(processEvent);
    }
    if (Math.floor(run.time) !== displayedSecond) {
      displayedSecond = Math.floor(run.time);
      $("timer").textContent = formatTime(run.time);
    }
    if (run.time > toastUntil && $("toast").textContent) $("toast").textContent = "";
    updateCombatHud();
  }
  if (mode !== "menu") scene.draw(run, images.get(run.level.id), elapsed);
  requestAnimationFrame(frame);
}

start.addEventListener("click", () => enter());
cards.forEach(card => card.addEventListener("click", () => showMenu(Number(card.dataset.level))));
$("pause").addEventListener("click", pause);
$("restart").addEventListener("click", () => enter());
$("back").addEventListener("click", () => showMenu());
action.addEventListener("click", () => {
  if (mode === "paused") resume();
  else if (selected + 1 < levels.length) enter(selected + 1);
  else showReward();
});
$("open-reward").addEventListener("click", () => {
  pause();
  showReward();
});
$("help").addEventListener("click", () => {
  pause();
  guide.showModal();
});
$("close-guide").addEventListener("click", () => guide.close());
$("reset-progress").addEventListener("click", () => {
  try {
    localStorage.removeItem(saveKey);
    localStorage.removeItem(originalSaveKey);
  } catch {
    $("reset-progress-error").hidden = false;
    return;
  }
  location.reload();
});
$("audio").addEventListener("click", () => {
  muted = !muted;
  updateAudioButton();
  try {
    localStorage.setItem("luma-trail.muted", String(muted));
  } catch {
    // The preference still applies in the current tab.
  }
  if (muted) {
    music.pause();
    audioContext?.suspend().catch(() => {});
  } else {
    resumeAudio();
  }
});
updateAudioButton();

addEventListener("keydown", event => {
  if (guide.open || $("reward").open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "Escape" && !event.repeat) {
    if (mode === "playing") pause();
    else if (mode === "paused") resume();
    return;
  }
  if (mode !== "playing") return;
  if (event.code === "KeyR" && !event.repeat) {
    enter();
    return;
  }
  const key = keyMap[event.code];
  if (!key || (event.code === "Space" && event.target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  held.add(event.code);
  if (!event.repeat) taps.add(key);
});
addEventListener("keyup", event => held.delete(event.code));
addEventListener("blur", resetInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

touchControls.querySelectorAll("[data-key]").forEach(button => {
  button.addEventListener("pointerdown", event => {
    if (mode !== "playing" || event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.key);
    button.classList.add("held");
    taps.add(button.dataset.key);
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].includes(button.dataset.key)) button.classList.remove("held");
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("click", event => {
    if (event.detail === 0 && mode === "playing") taps.add(button.dataset.key);
  });
});

try {
  const [response] = await Promise.all([fetch("/api/levels"), scene.ready]);
  if (response.status === 401) {
    location.replace("/login");
  } else {
    if (!response.ok) throw new Error("Level request failed");
    levels = await response.json();
    for (const level of levels) {
      const image = new Image();
      image.src = `assets/${level.id}.webp`;
      images.set(level.id, image);
    }
    selected = Math.min(levels.length - 1, levels.filter((_, i) => hasCleared(i)).length);
    updateCover();
    enableReward(Boolean(bestTimes[levels.length - 1]));
    start.disabled = false;
    requestAnimationFrame(frame);
  }
} catch {
  $("start-hint").textContent = "无法加载关卡。请运行 start.cmd 或 python app.py 后刷新页面。";
}
