from __future__ import annotations
import json
import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib import error as urllib_error
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import streamlit as st

from knowledge_map.storage import update_map_payload


XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"
XAI_API_KEY_ENV = "XAI_API_KEY"
XAI_MODEL = "grok-4.3"
XAI_SYSTEM_PROMPT = "扮演一个心理学博士背景的ai产品经理，给我根据我给你的ai回应标注它回复的好的地方和糟糕的地方，然后从心理学角度给出评语。对于回复的好坏要从心理学的角度判断回复的语气和内容，回复是否有亲和力，回复是否浅显易懂，回复是否占用太多认知资源，回复是否过于复杂，回复是否不够专业，回复是否过于专业...等等而不是评判内容是否金融性的正确。评语要关于如何引导让用户体验更好，还有为什么更愿意使用这个模型。用“***”圈出要评价的优秀字段和评语，用“xxx”圈出要评价的糟糕字段和评语本身（圈出评语本身），然后在原有字段后紧接着“（评语：）”用这个格式给出自己的评语。注意：不需要每句都给评语，每段不论好坏只给1个评语。不要给出评语、“***”“xxx”以外其他的修改。以下是案例（评语不要照抄案例）：案例一：结论一句话：***如果你追求高成长、愿意花时间研究并能接受波动，就买股票；如果你想要“省心+分散风险”，就选基金。（评语：在基础知识上直接给不同人适合的结论。因为问特别基础问题的人常常倾向于只看结论，把结论放句首更好，问困难问题的才应该给这种具体解释）***两者并无绝对好坏，关键看你的目标、精力和风险承受力。🚀📈。 "
XAI_TEMPERATURE = 0.8
DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"


def read_dotenv_value(name: str) -> str:
    if not DOTENV_PATH.exists():
        return ""

    for line in DOTENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        if key.strip() == name:
            return value.strip().strip("\"'")

    return ""


def get_xai_api_key() -> str:
    return os.environ.get(XAI_API_KEY_ENV, "").strip() or read_dotenv_value(XAI_API_KEY_ENV)


def extract_xai_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    for output in payload.get("output", []):
        if not isinstance(output, dict):
            continue
        for content in output.get("content", []):
            if not isinstance(content, dict):
                continue
            text = content.get("text") or content.get("output_text")
            if isinstance(text, str) and text.strip():
                return text

    choices = payload.get("choices", [])
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message", {})
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, str) and content.strip():
            return content

    return ""


def request_xai_analysis(prompt: str) -> str:
    api_key = get_xai_api_key()
    if not api_key:
        raise RuntimeError(f"未设置 {XAI_API_KEY_ENV} 环境变量")

    body = json.dumps({
        "model": XAI_MODEL,
        "store": False,
        "temperature": XAI_TEMPERATURE,
        "input": [
            {"role": "system", "content": XAI_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    }, ensure_ascii=False).encode("utf-8")
    request = Request(
        XAI_RESPONSES_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"xAI 请求失败：HTTP {exc.code} {error_body}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"xAI 请求失败：{exc.reason}") from exc

    text = extract_xai_text(payload)
    if not text.strip():
        raise RuntimeError("xAI 返回为空")
    return text


def find_free_port(start: int = 8765, end: int = 8865) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("没有找到可用的本地保存端口。")


@st.cache_resource
def start_local_api() -> int:
    port = find_free_port()

    class MapAPIHandler(BaseHTTPRequestHandler):
        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            self._send_json(200, {"ok": True})

        def do_GET(self) -> None:
            if urlparse(self.path).path == "/health":
                self._send_json(200, {"ok": True})
                return
            self._send_json(404, {"ok": False, "error": "not found"})

        def do_POST(self) -> None:
            parsed_path = urlparse(self.path).path.strip("/").split("/")
            if parsed_path == ["ai", "analyze"]:
                content_length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_length).decode("utf-8")
                try:
                    payload = json.loads(raw_body)
                except json.JSONDecodeError:
                    self._send_json(400, {"ok": False, "error": "invalid json"})
                    return

                prompt = str(payload.get("prompt") or "").strip()
                if not prompt:
                    self._send_json(400, {"ok": False, "error": "prompt is empty"})
                    return

                try:
                    text = request_xai_analysis(prompt)
                except Exception as exc:
                    self._send_json(502, {"ok": False, "error": str(exc)})
                    return

                self._send_json(200, {"ok": True, "text": text})
                return

            if len(parsed_path) != 2 or parsed_path[0] != "maps":
                self._send_json(404, {"ok": False, "error": "not found"})
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(raw_body)
            except json.JSONDecodeError:
                self._send_json(400, {"ok": False, "error": "invalid json"})
                return

            try:
                updated = update_map_payload(parsed_path[1], payload)
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": str(exc)})
                return

            if updated is None:
                self._send_json(404, {"ok": False, "error": "map not found"})
                return

            self._send_json(200, {"ok": True, "map": updated})

        def log_message(self, format: str, *args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", port), MapAPIHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return port
