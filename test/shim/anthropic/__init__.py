"""테스트 전용 anthropic 대체 모듈. 실제 SDK 와 같은 이름의 클라이언트/예외를 제공하고, 진짜 HTTP 요청(JSON 본문 그대로)을 보낸다.
(이 환경에서는 실제 anthropic SDK 를 설치할 수 없어 사용. 요청 본문은 SDK 가 messages.create(**kwargs) 를 직렬화한 것과 동일한 형태.)"""
import json, os, urllib.request, urllib.error
from types import SimpleNamespace
__version__ = "shim-for-tests"


class _Resp:
    def __init__(s, status, headers, text): s.status_code = status; s.headers = headers; s.text = text


class APIError(Exception): pass
class APIConnectionError(APIError): pass
class APITimeoutError(APIConnectionError): pass


class APIStatusError(APIError):
    def __init__(self, message, *, response, body): super().__init__(message); self.response = response; self.status_code = response.status_code; self.body = body; self.request_id = response.headers.get("request-id")


class BadRequestError(APIStatusError): pass
class AuthenticationError(APIStatusError): pass
class NotFoundError(APIStatusError): pass
class RateLimitError(APIStatusError): pass
class InternalServerError(APIStatusError): pass
_MAP = {400: BadRequestError, 401: AuthenticationError, 404: NotFoundError, 429: RateLimitError}


def _wrap(v, key=None):
    if isinstance(v, dict): return v if key == "input" else SimpleNamespace(**{k: _wrap(x, k) for k, x in v.items()})
    if isinstance(v, list): return [_wrap(x) for x in v]
    return v


class _Messages:
    def __init__(s, c): s.c = c

    def create(s, **kw):
        req = urllib.request.Request(s.c.base_url.rstrip("/") + "/v1/messages", data=json.dumps(kw).encode("utf-8"), method="POST",
                                     headers={"x-api-key": s.c.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r: return _wrap(json.loads(r.read().decode("utf-8")))
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace"); hdr = {k.lower(): v for k, v in e.headers.items()}
            try: body = json.loads(text)
            except Exception: body = text
            cls = _MAP.get(e.code, InternalServerError if e.code >= 500 else APIStatusError)
            raise cls(f"Error code: {e.code} - {body}", response=_Resp(e.code, hdr, text), body=body)  # 실제 SDK 와 같은 문자열 형식
        except urllib.error.URLError as e: raise APIConnectionError(str(e))


class Anthropic:
    def __init__(self, api_key=None, base_url=None, max_retries=2, timeout=600):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key: raise TypeError("Could not resolve authentication method. Expected either api_key or auth_token to be set.")
        self.base_url = base_url or os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com"; self.messages = _Messages(self)
