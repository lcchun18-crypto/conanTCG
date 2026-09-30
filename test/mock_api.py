"""공식 문서의 제약을 강제하는 모의 Messages API 서버 (테스트 전용).
- Sonnet 5.5 / Opus 5.5 / Fable 5.1 / Mythos 5.1: tool_choice 'tool'/'any' → 400, thinking 'enabled' → 400
- 헤더, JSON, 모델명, max_tokens, system, tools, 메시지/이미지 블록 형식을 검증
- behavior 로 장애(429/500/거부/텍스트응답/항상 400)를 흉내낸다."""
import base64, io, json, re, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image

FORCED_UNSUPPORTED = {"claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1"}
KNOWN = FORCED_UNSUPPORTED | {"claude-haiku-4-5-20251001", "claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5"}
NO_MANUAL_THINKING = FORCED_UNSUPPORTED
S = {"lock": threading.Lock(), "reqs": [], "behavior": "normal", "count": 0, "japanese_error": False}


def err(code, typ, msg, headers=None): return code, {"type": "error", "error": {"type": typ, "message": msg}}, headers or {}


def validate(h, p):
    if not h.get("x-api-key"): return err(401, "authentication_error", "x-api-key header is required")
    if not h.get("anthropic-version"): return err(400, "invalid_request_error", "anthropic-version: header is required")
    if not isinstance(p, dict): return err(400, "invalid_request_error", "Request body must be a JSON object")
    m = p.get("model")
    if m not in KNOWN: return err(404, "not_found_error", f"model: {m}")
    if not isinstance(p.get("max_tokens"), int) or p["max_tokens"] < 1: return err(400, "invalid_request_error", "max_tokens: Field required (integer >= 1)")
    if not isinstance(p.get("messages"), list) or not p["messages"]: return err(400, "invalid_request_error", "messages: Field required")
    tc = p.get("tool_choice"); th = p.get("thinking")
    if tc is not None:
        if not isinstance(tc, dict) or tc.get("type") not in ("auto", "any", "tool", "none"): return err(400, "invalid_request_error", "tool_choice.type: Input should be 'auto', 'any', 'tool' or 'none'")
        if tc["type"] in ("any", "tool") and not p.get("tools"): return err(400, "invalid_request_error", "tool_choice: tools must be provided when tool_choice is 'any' or 'tool'")
        if tc["type"] == "tool" and tc.get("name") not in [t.get("name") for t in p.get("tools", [])]: return err(400, "invalid_request_error", f"tool_choice: tool '{tc.get('name')}' not found in tools")
        if tc["type"] in ("any", "tool") and m in FORCED_UNSUPPORTED:
            return err(400, "invalid_request_error", f"tool_choice: forced tool use (type {tc['type']}) is not supported for {m}. Use auto or none.")
    if th is not None and th.get("type") == "enabled" and m in NO_MANUAL_THINKING: return err(400, "invalid_request_error", f"thinking.type.enabled: not supported for {m}; use adaptive thinking")
    sysv = p.get("system")
    if sysv is not None:
        blocks = [{"type": "text", "text": sysv}] if isinstance(sysv, str) else sysv
        if not isinstance(blocks, list): return err(400, "invalid_request_error", "system: must be a string or a list of text blocks")
        for b in blocks:
            if b.get("type") != "text" or not b.get("text"): return err(400, "invalid_request_error", "system: text content blocks must be non-empty")
            if "cache_control" in b and b["cache_control"].get("type") != "ephemeral": return err(400, "invalid_request_error", "system.cache_control.type: must be 'ephemeral'")
    for t in p.get("tools", []) or []:
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", str(t.get("name", ""))): return err(400, "invalid_request_error", "tools.0.name: invalid")
        if (t.get("input_schema") or {}).get("type") != "object": return err(400, "invalid_request_error", "tools.0.input_schema.type: must be 'object'")
        if t.get("strict") and (t["input_schema"].get("additionalProperties") is not False): return err(400, "invalid_request_error", "tools.0.strict: input_schema.additionalProperties must be false")
    for i, msg in enumerate(p["messages"]):
        if msg.get("role") not in ("user", "assistant"): return err(400, "invalid_request_error", f"messages.{i}.role: must be 'user' or 'assistant'")
        cs = [{"type": "text", "text": msg["content"]}] if isinstance(msg.get("content"), str) else msg.get("content")
        if not isinstance(cs, list) or not cs: return err(400, "invalid_request_error", f"messages.{i}.content: must be non-empty")
        for j, c in enumerate(cs):
            if c.get("type") == "text":
                if not c.get("text"): return err(400, "invalid_request_error", f"messages.{i}.content.{j}.text: text content blocks must be non-empty")
            elif c.get("type") == "image":
                src = c.get("source") or {}
                if src.get("type") != "base64" or src.get("media_type") not in ("image/jpeg", "image/png", "image/gif", "image/webp"): return err(400, "invalid_request_error", f"messages.{i}.content.{j}.image.source: invalid")
                try: raw = base64.b64decode(src.get("data", ""), validate=True); im = Image.open(io.BytesIO(raw)); im.verify()
                except Exception: return err(400, "invalid_request_error", f"messages.{i}.content.{j}.image: Could not process image")
                if len(raw) > 5 * 1024 * 1024 or max(im.size) > 8000: return err(400, "invalid_request_error", "image exceeds maximum size")
                if src["media_type"] == "image/jpeg" and raw[:2] != b"\xff\xd8": return err(400, "invalid_request_error", "image: media_type does not match data")
            else: return err(400, "invalid_request_error", f"messages.{i}.content.{j}.type: unsupported '{c.get('type')}'")
    return None


def gen_card(p):
    img = next(c for c in p["messages"][0]["content"] if c["type"] == "image")
    im = Image.open(io.BytesIO(base64.b64decode(img["source"]["data"]))).convert("RGB"); r, g, b = im.getpixel((3, 3))  # 테두리 색으로 카드 종류를 흉내
    if g > r and g > b: return dict(name="服部平次", type="char", color="green", lv="4", lv2="", ap="4000", lp="1", trait="高校生,探偵", fx_ja="【ヒラメキ】(証拠からリームーブされるときに発動する)カードを1枚引く", fx_ko="히라메키: 1장 드로우")
    if r > 150 and g > 90 and b < 100: return dict(name="安室の一撃", type="event", color="", lv="5", lv2="", ap="", lp="", trait="", fx_ja="【カットインAP+2000】(コンタクト中に手紙からリムーブして使う)", fx_ko="컷인")
    return dict(name="毛利蘭", type="char", color="blue", lv="2", lv2="", ap="3000", lp="2", trait="高校生", fx_ja="", fx_ko="")


def gen_abilities(p):
    t = "".join(c.get("text", "") for c in p["messages"][-1]["content"]) if isinstance(p["messages"][-1]["content"], list) else p["messages"][-1]["content"]
    if "ヒラメキ" in t: return dict(kw="", abilities=[dict(ic="flash", ops=[dict(op="draw", n=1)], txt="…")])
    if "カットイン" in t: return dict(kw="", abilities=[dict(ic="cutin", v=2000, txt="…")])
    return dict(kw="", abilities=[])


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def reply(self, code, body, headers=None):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8"); self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("request-id", "req_mock")
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.send_header("content-length", str(len(raw))); self.end_headers(); self.wfile.write(raw)

    def do_POST(self):
        n = int(self.headers.get("content-length", 0)); raw = self.rfile.read(n); hd = {k.lower(): v for k, v in self.headers.items()}
        try: p = json.loads(raw)
        except Exception: return self.reply(*err(400, "invalid_request_error", "Invalid JSON")[:2])
        with S["lock"]: S["count"] += 1; c = S["count"]; beh = S["behavior"]; S["reqs"].append(p)
        if self.path != "/v1/messages": return self.reply(*err(404, "not_found_error", "Not found")[:2])
        if beh == "always_400":
            msg = "messages.0.content.0.image.source.base64: 이미지를 처리할 수 없습니다 (手札) " + "x" * 120 if S["japanese_error"] else "messages.0.content.0.image.source.base64: Could not process image; the request was rejected for testing purposes. " + "x" * 40
            return self.reply(*err(400, "invalid_request_error", msg)[:2])
        if beh == "rate_limit_once" and c == 1: return self.reply(*err(429, "rate_limit_error", "rate limited")[:2], {"retry-after": "1"})
        if beh == "server_error_once" and c == 1: return self.reply(*err(500, "api_error", "Internal server error")[:2])
        e = validate(hd, p)
        if e: return self.reply(e[0], e[1])
        if beh == "reject_tools" and p.get("tools"): return self.reply(*err(400, "invalid_request_error", "tools: tool use is not available in this configuration (testing)")[:2])
        tool = (p.get("tools") or [{}])[0].get("name")
        has_img = isinstance(p["messages"][0]["content"], list) and any(c.get("type") == "image" for c in p["messages"][0]["content"])
        data = gen_card(p) if has_img else gen_abilities(p)
        if beh == "text_json" or not tool: content = [{"type": "text", "text": "```json\n" + json.dumps(data, ensure_ascii=False) + "\n```"}]
        else: content = [{"type": "text", "text": "카드를 기록하겠습니다."}, {"type": "tool_use", "id": "toolu_mock", "name": tool, "input": data}]
        self.reply(200, {"id": "msg_mock", "type": "message", "role": "assistant", "model": p["model"], "content": content, "stop_reason": "tool_use" if tool and beh != "text_json" else "end_turn", "usage": {"input_tokens": 1, "output_tokens": 1}})


def start():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def reset(behavior="normal", japanese_error=False):
    with S["lock"]: S.update(reqs=[], behavior=behavior, count=0, japanese_error=japanese_error)
