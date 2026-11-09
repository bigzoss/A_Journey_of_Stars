"""Local game server. Run with Python 3.9 or later."""

import argparse
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
import webbrowser
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from functools import partial
from http.cookies import CookieError, SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from urllib.parse import parse_qs, urlsplit


PUBLIC = Path(__file__).resolve().parent / "public"
REDEMPTIONS = PUBLIC.parent / "兑换记录"
LOGIN_CONFIG = PUBLIC.parent / "login.local.json"
ACCOUNTS_DB = PUBLIC.parent / "accounts.local.sqlite3"
SESSION_COOKIE = "luma_session"
SESSION_DURATION = 12 * 60 * 60
CHINA_TIME = timezone(timedelta(hours=8))
BRANDS = {"coffee": "星巴克", "jasmine": "霸王茶姬", "pearl": "卡旺卡"}
REDEMPTION_FIELDS = {
    "drink": ("饮品名称", 32),
    "size": ("杯型或容量", 14),
    "temperature": ("冰量或温度", 8),
    "sugar": ("甜度", 8),
    "extras": ("加料或备注", 28),
    "phone": ("联系电话", 24),
    "appointment": ("兑换日期时间", 16),
    "address": ("兑换地址", 90),
}


def load_login():
    try:
        config = json.loads(LOGIN_CONFIG.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, None
    username = config["username"]
    digest = bytes.fromhex(config["password_sha256"])
    if not username or len(digest) != hashlib.sha256().digest_size:
        raise ValueError("Invalid login configuration.")
    return username, digest


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)


def redemption_record(data):
    if not isinstance(data, dict):
        raise ValueError("Invalid redemption")
    code = data.get("code")
    issued = data.get("issued")
    brand = data.get("brand")
    if not isinstance(code, str) or not re.fullmatch(r"LUMA-[0-9A-F]{8}", code):
        raise ValueError("Invalid card number")
    if not isinstance(issued, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", issued):
        raise ValueError("Invalid issue date")
    date.fromisoformat(issued)
    if not isinstance(brand, str) or brand not in BRANDS:
        raise ValueError("Invalid brand")

    record = {"兑换卡号": code, "签发日期": issued, "品牌": BRANDS[brand]}
    for name, (label, limit) in REDEMPTION_FIELDS.items():
        value = data.get(name, "" if name == "extras" else None)
        if not isinstance(value, str):
            raise ValueError("Invalid field")
        value = value.strip()
        if len(value) > limit or (not value and name != "extras") or not value.isprintable():
            raise ValueError("Invalid field")
        record[label] = value

    phone = record["联系电话"]
    if not re.fullmatch(r"[+0-9 ().-]+", phone) or not 7 <= len(re.sub(r"[^0-9]", "", phone)) <= 18:
        raise ValueError("Invalid phone")
    appointment = record["兑换日期时间"]
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}", appointment):
        raise ValueError("Invalid appointment")
    parsed = datetime.fromisoformat(appointment)
    if not 2000 <= parsed.year <= 2099:
        raise ValueError("Invalid appointment year")
    record["兑换日期时间"] = parsed.isoformat(sep=" ", timespec="minutes")
    record["最后保存时间"] = datetime.now(CHINA_TIME).isoformat(sep=" ", timespec="seconds")
    return code, record


def save_redemption(code, record):
    REDEMPTIONS.mkdir(exist_ok=True)
    temporary = None
    try:
        with NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".tmp", dir=REDEMPTIONS, delete=False) as file:
            temporary = Path(file.name)
            json.dump(record, file, ensure_ascii=False, indent=2)
            file.write("\n")
        temporary.replace(REDEMPTIONS / f"{code}.json")
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)

# Platforms are [left, top, width]. Stars and portal are [x, y].
LEVELS = [
    {
        "id": "moon", "name": "月影森林", "width": 1420,
        "platforms": [[0, 463, 260], [342, 418, 155], [584, 365, 135],
                      [801, 425, 156], [1048, 384, 138], [1258, 431, 162]],
        "stars": [[189, 427], [651, 328], [1118, 347]],
        "portal": [1355, 431], "spikes": [], "moving": [],
        "enemies": [
            {"kind": "wisp", "x": 213, "y": 463, "range": 29, "hp": 1},
            {"kind": "wisp", "x": 870, "y": 425, "range": 41, "hp": 1},
            {"kind": "wisp", "x": 1343, "y": 431, "range": 28, "hp": 2, "guardian": True},
        ],
    },
    {
        "id": "cavern", "name": "萤光洞窟", "width": 1700,
        "platforms": [[0, 467, 212], [303, 420, 147], [552, 373, 157],
                      [803, 431, 154], [1053, 372, 176], [1331, 418, 369]],
        "stars": [[370, 383], [880, 392], [1182, 336]],
        "portal": [1640, 418], "spikes": [[557, 373, 44], [1425, 418, 48]],
        "moving": [],
        "enemies": [
            {"kind": "crystal", "x": 400, "y": 420, "range": 19, "hp": 2},
            {"kind": "crystal", "x": 665, "y": 373, "range": 24, "hp": 2},
            {"kind": "crystal", "x": 1600, "y": 418, "range": 24, "hp": 3, "guardian": True},
        ],
    },
    {
        "id": "dawn", "name": "破晓浮岛", "width": 2050,
        "platforms": [[0, 463, 210], [300, 421, 138], [725, 372, 163],
                      [988, 426, 160], [1242, 366, 143], [1615, 397, 435]],
        "stars": [[360, 383], [804, 334], [1310, 329]],
        "portal": [1994, 397], "spikes": [[1054, 426, 45]],
        "moving": [[478, 390, 91, 100, 3.2], [1425, 354, 84, 57, 2.6]],
        "checkpoint": {"platform": 5, "x": 1638},
        "enemies": [
            {"kind": "wisp", "x": 827, "y": 372, "range": 32, "hp": 2},
            {"kind": "crystal", "x": 1317, "y": 366, "range": 34, "hp": 2},
            {"kind": "sentinel", "x": 1840, "y": 397, "range": 26, "hp": 8, "guardian": True},
        ],
    },
]


class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webp": "image/webp"}
    sessions = {}
    session_lock = Lock()

    def session_token(self):
        try:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
        except CookieError:
            return ""
        return cookie[SESSION_COOKIE].value if SESSION_COOKIE in cookie else ""

    def session_account(self):
        with self.session_lock:
            session = self.sessions.get(self.session_token())
        if session and session[0] > time.monotonic():
            return session[1]
        return None

    def redirect(self, target, cookie=None):
        self.send_response(303)
        self.send_header("Location", target)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def send_bytes(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return BytesIO(body)

    def send_head(self):
        url = urlsplit(self.path)
        target = Path(self.translate_path(self.path)).resolve()
        if target == PUBLIC or target == PUBLIC / "index.html":
            account = self.session_account()
            if account is None:
                self.redirect("/login")
                return None
            body = (PUBLIC / "index.html").read_bytes()
            if account != self.login_name:
                account_key = hashlib.sha256(account.encode("utf-8")).hexdigest().encode("ascii")
                body = body.replace(b'<meta name="luma-account" content="">',
                                    b'<meta name="luma-account" content="' + account_key + b'">')
            return self.send_bytes(body, "text/html; charset=utf-8")
        if url.path in ("/login", "/register") or target == PUBLIC / "login.html":
            if self.session_account() is not None:
                self.redirect("/")
                return None
            body = (PUBLIC / "login.html").read_bytes()
            if url.path == "/register":
                body = body.replace("<title>登录 · 星途之旅</title>".encode("utf-8"),
                                    "<title>注册账号 · 星途之旅</title>".encode("utf-8"))
                body = body.replace(b"data-login-panel>", b"data-login-panel hidden>")
                body = body.replace(b"data-register-panel hidden", b"data-register-panel")
                messages = {
                    "error=invalid": "请填写 2 至 64 个字符的用户名和 8 至 64 个字符的密码。",
                    "error=mismatch": "两次输入的密码不一致，请重新填写。",
                    "error=taken": "这个用户名已被使用，请换一个。",
                    "error=unavailable": "暂时无法保存账号，请稍后再试。",
                }
                message = messages.get(url.query)
                if message:
                    body = body.replace(b'data-register-error hidden></p>',
                                        b'data-register-error tabindex="-1" autofocus>' +
                                        message.encode("utf-8") + b"</p>")
            elif url.query == "error=1":
                body = body.replace(b"data-login-error hidden", b'data-login-error tabindex="-1" autofocus')
            elif url.query == "registered=1":
                body = body.replace(b"data-register-success hidden", b"data-register-success")
            return self.send_bytes(body, "text/html; charset=utf-8")
        if url.path == "/api/levels":
            if self.session_account() is None:
                return self.send_bytes(b'{"error":"login_required"}', "application/json", 401)
            body = json.dumps(LEVELS, ensure_ascii=False).encode("utf-8")
            return self.send_bytes(body, "application/json; charset=utf-8")
        return super().send_head()

    def do_POST(self):
        route = urlsplit(self.path).path
        if route == "/api/redemptions":
            self.submit_redemption()
            return
        if route == "/logout":
            with self.session_lock:
                self.sessions.pop(self.session_token(), None)
            self.redirect("/login", f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
            return
        if route not in ("/login", "/register"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096 or self.headers.get_content_type() != "application/x-www-form-urlencoded":
                raise ValueError("Invalid login form")
            form = parse_qs(self.rfile.read(length).decode("utf-8"), max_num_fields=4, errors="strict")
        except ValueError:
            self.redirect("/register?error=invalid" if route == "/register" else "/login?error=1")
            return

        name = form.get("username", [""])[0]
        password = form.get("password", [""])[0]
        if route == "/register":
            self.register_account(name.strip(), password, form.get("confirmation", [""])[0])
            return
        if name != self.login_name:
            name = name.strip()
        if not self.check_login(name, password):
            self.redirect("/login?error=1")
            return

        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        with self.session_lock:
            self.sessions.pop(self.session_token(), None)
            for expired in [key for key, (expiry, _) in self.sessions.items() if expiry <= now]:
                del self.sessions[expired]
            self.sessions[token] = (now + SESSION_DURATION, name)
        self.redirect("/", f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_DURATION}")

    def register_account(self, name, password, confirmation):
        if self.session_account() is not None:
            self.redirect("/")
            return
        if not (2 <= len(name) <= 64 and name.isprintable() and 8 <= len(password) <= 64):
            self.redirect("/register?error=invalid")
            return
        if password != confirmation:
            self.redirect("/register?error=mismatch")
            return
        if name == self.login_name:
            self.redirect("/register?error=taken")
            return
        salt = secrets.token_bytes(16)
        digest = password_hash(password, salt)
        try:
            with closing(sqlite3.connect(ACCOUNTS_DB)) as db, db:
                db.execute("INSERT INTO accounts VALUES (?, ?, ?)", (name, salt, digest))
        except sqlite3.IntegrityError:
            self.redirect("/register?error=taken")
            return
        except sqlite3.OperationalError:
            self.redirect("/register?error=unavailable")
            return
        self.redirect("/login?registered=1")

    def check_login(self, name, password):
        if name == self.login_name:
            digest = hashlib.sha256(password.encode("utf-8")).digest()
            return hmac.compare_digest(digest, self.password_digest)
        if not (2 <= len(name) <= 64 and 8 <= len(password) <= 64):
            return False
        with closing(sqlite3.connect(ACCOUNTS_DB)) as db:
            row = db.execute("SELECT salt, digest FROM accounts WHERE username = ?", (name,)).fetchone()
        return row is not None and hmac.compare_digest(password_hash(password, row[0]), row[1])

    def submit_redemption(self):
        if self.session_account() is None:
            self.send_error(401)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192 or self.headers.get_content_type() != "application/json":
                raise ValueError("Invalid redemption request")
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            code, record = redemption_record(data)
        except (ValueError, RecursionError):
            self.send_error(400)
            return
        try:
            save_redemption(code, record)
        except OSError:
            self.send_error(500, "Unable to save redemption")
            return
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="Open the game in the default browser")
    args = parser.parse_args()
    GameHandler.login_name, GameHandler.password_digest = load_login()
    with closing(sqlite3.connect(ACCOUNTS_DB)) as db:
        db.execute("CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, salt BLOB NOT NULL, digest BLOB NOT NULL)")
    handler = partial(GameHandler, directory=str(PUBLIC))

    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        url = f"http://127.0.0.1:{server.server_port}"
        print(f"Luma Trail  |  {url}", flush=True)
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
