const saveKey = "luma-trail.reward.v1";
const brands = {
  coffee: { name: "星巴克", logo: "logo-starbucks.svg", dark: "#112e27", light: "#2c5747", accent: "#c3edcf" },
  jasmine: { name: "霸王茶姬", logo: "logo-chagee.png", dark: "#371b29", light: "#744052", accent: "#ffd8b7" },
  pearl: { name: "卡旺卡", logo: "logo-kawangka.png", dark: "#3c211c", light: "#84503b", accent: "#ffdfb5" },
};
const dialog = document.getElementById("reward");
const button = document.getElementById("open-reward");
const ticket = document.getElementById("reward-ticket");
const title = document.getElementById("reward-title");
const intro = document.getElementById("reward-intro");
const achievement = document.getElementById("reward-achievement");
const formTitle = title.textContent;
const formIntro = intro.textContent;
const form = document.getElementById("reward-form");
const preview = document.getElementById("reward-preview");
const formError = document.getElementById("reward-error");
const downloadError = document.getElementById("reward-download-error");
const submit = form.querySelector('button[type="submit"]');
const pngButton = document.getElementById("download-reward");
const measure = document.createElement("canvas").getContext("2d");
let card = readCard();

function readCard() {
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey));
    if (/^LUMA-[0-9A-F]{8}$/.test(saved?.code) && /^\d{4}-\d{2}-\d{2}$/.test(saved?.date)) return saved;
  } catch {
    // The game can award a card even when storage is blocked.
  }
  return null;
}

export function enableReward(earned) {
  if (!card && earned) {
    const code = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, "0").toUpperCase();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    card = { code: `LUMA-${code}`, date: `${now.getFullYear()}-${month}-${day}` };
    try {
      localStorage.setItem(saveKey, JSON.stringify(card));
    } catch {
      // The player can still download the card.
    }
  }
  button.hidden = !card;
}

export function showReward() {
  if (!card || dialog.open) return;
  dialog.showModal();
}

function setView(showPreview) {
  form.hidden = showPreview;
  achievement.hidden = showPreview;
  preview.hidden = !showPreview;
  title.textContent = showPreview ? "你的奶茶兑换卡" : formTitle;
  intro.textContent = showPreview ? "兑换信息已保存到本机。核对卡面后即可下载。" : formIntro;
  if (dialog.open) {
    dialog.scrollTop = 0;
    title.focus({ preventScroll: true });
  }
}

async function loadImage(filename) {
  const response = await fetch(`assets/${filename}`);
  if (!response.ok) throw new Error("Could not load reward image");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function wrapText(id, value, maxWidth, lineHeight) {
  const label = document.getElementById(id);
  const weight = label.getAttribute("font-weight") ?? "400";
  const size = label.getAttribute("font-size");
  measure.font = `${weight} ${size}px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif`;
  const lines = [];
  let line = "";
  for (const char of value) {
    if (line && measure.measureText(line + char).width > maxWidth) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += char;
  }
  const last = line.trim();
  if (last && lines.length && measure.measureText(last).width < maxWidth * .12) {
    const previous = Array.from(lines.pop());
    const carry = previous.splice(Math.floor(previous.length * .78)).join("");
    lines.push(previous.join("").trimEnd(), (carry + line).trim());
  } else {
    lines.push(last);
  }
  label.replaceChildren(...lines.map((text, index) => {
    const row = document.createElementNS(ticket.namespaceURI, "tspan");
    row.setAttribute("x", label.getAttribute("x"));
    row.setAttribute("dy", index ? lineHeight : 0);
    row.textContent = text.trimStart();
    return row;
  }));
}

function fillTicket(details, photo, logo) {
  const brand = brands[details.brand];
  const specs = [details.size, details.temperature, details.sugar, details.extras].filter(Boolean).join(" · ");
  const appointment = details.appointment.replace("T", "  ");
  document.getElementById("ticket-dark").setAttribute("stop-color", brand.dark);
  document.getElementById("ticket-light").setAttribute("stop-color", brand.light);
  document.getElementById("ticket-accent").setAttribute("fill", brand.accent);
  document.getElementById("ticket-photo").setAttribute("href", photo);
  document.getElementById("ticket-logo").setAttribute("href", logo);
  document.getElementById("ticket-brand").textContent = brand.name;
  wrapText("ticket-drink", details.drink, 457, 31);
  wrapText("ticket-specs", specs, 415, 24);
  wrapText("ticket-phone", details.phone, 271, 20);
  wrapText("ticket-address", details.address, 710, 24);
  document.getElementById("ticket-appointment").textContent = appointment;
  document.getElementById("reward-code").textContent = card.code;
  document.getElementById("reward-date").textContent = `签发 ${card.date}`;
  const summary = { ...details, drink: `${brand.name} · ${details.drink}`, specs, appointment };
  for (const item of preview.querySelectorAll("[data-preview]")) item.textContent = summary[item.dataset.preview];
  document.getElementById("ticket-description").textContent =
    `${brand.name} ${details.drink}，${specs}。兑换时间 ${appointment}，联系电话 ${details.phone}，地址 ${details.address}。`;
}

form.addEventListener("input", event => {
  event.target.setCustomValidity?.("");
  formError.hidden = true;
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!card || submit.disabled) return;
  const details = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim().replace(/\s+/g, " ")]));
  for (const name of ["drink", "size", "address"]) {
    if (!details[name]) form.elements[name].setCustomValidity("请填写此项。");
  }
  if (!/^[+\d ().-]+$/.test(details.phone) || !/^\d{7,18}$/.test(details.phone.replace(/\D/g, ""))) {
    form.elements.phone.setCustomValidity("请输入有效的联系电话。");
  }
  if (!form.reportValidity()) return;

  submit.disabled = true;
  submit.querySelector("span").textContent = "正在保存并生成…";
  formError.hidden = true;
  let message = "卡面素材加载失败，请重试。";
  try {
    const [photo, logo] = await Promise.all([
      loadImage(`drink-${details.brand}.webp`),
      loadImage(brands[details.brand].logo),
    ]);
    message = "兑换记录保存失败，填写内容已保留，请重试。";
    const response = await fetch("/api/redemptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...details, code: card.code, issued: card.date }),
    });
    if (response.status === 401) message = "登录已过期。请在新标签页重新登录，再回来重试。";
    if (response.status === 400) message = "兑换信息校验未通过，请检查表单后重试。";
    if (response.status !== 204) throw new Error("Could not save redemption");
    message = "兑换记录已保存，卡面预览生成失败，请重试。";
    fillTicket(details, photo, logo);
    setView(true);
  } catch {
    formError.textContent = message;
    formError.hidden = false;
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "生成兑换卡";
  }
});

function ticketSvg() {
  return new Blob([new XMLSerializer().serializeToString(ticket)], { type: "image/svg+xml;charset=utf-8" });
}

function download(blob, format) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${card.code}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById("close-reward").addEventListener("click", () => dialog.close());
document.getElementById("edit-reward").addEventListener("click", () => setView(false));
document.getElementById("download-reward-svg").addEventListener("click", () => download(ticketSvg(), "svg"));
pngButton.addEventListener("click", async () => {
  pngButton.disabled = true;
  downloadError.hidden = true;
  const url = URL.createObjectURL(ticketSvg());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Could not encode ticket");
    download(png, "png");
  } catch {
    downloadError.textContent = "保存图片失败，可重试或保存 SVG。";
    downloadError.hidden = false;
  } finally {
    URL.revokeObjectURL(url);
    pngButton.disabled = false;
  }
});
