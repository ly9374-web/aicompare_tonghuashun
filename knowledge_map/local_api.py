from __future__ import annotations
import json
import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib import error as urllib_error
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import streamlit as st

from knowledge_map.storage import update_map_payload


XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"
XAI_API_KEY_ENV = "XAI_API_KEY"
XAI_MODEL = "grok-4.3"
XAI_SYSTEM_PROMPT = "扮演一个心理学博士背景的ai产品经理，给我根据我给你的ai回应标注它回复的好的地方和糟糕的地方，然后从心理学角度给出评语。评语要关于如何引导让用户体验更好，还有为什么更愿意使用这个模型。用“***”圈出要评价的优秀字段和评语，用“xxx”圈出要评价的糟糕字段和评语，然后在原有字段后紧接着“（评语：）”用这个格式给出自己的评语。注意：不需要每句都给评语，每段只给4个评语，两个好的，两个糟糕的。不要给出评语、“***”“xxx”以外其他的修改。以下是案例：案例一：ime has the answer ready结论一句话：***如果你追求高成长、愿意花时间研究并能接受波动，就买股票；如果你想要“省心+分散风险”，就选基金。（评语：在基础知识上直接给不同人适合的结论。因为问特别基础问题的人常常倾向于只看结论，把结论放句首更好）***两者并无绝对好坏，关键看你的目标、精力和风险承受力。🚀📈1. 股票 vs. 基金，一图看懂 😊维度股票基金本质买一家公司的所有权买一篮子资产（股票、债券等）的份额风险单一公司，波动大多元分散，波动相对小管理自己研究、买卖专业经理人管理门槛1 股起买，可全仓押注很多基金最低几十元，可定投适合人群有时间、懂分析、能抗波动时间少、想“躺平”、追求稳健股票是“ owning a piece of a company”1，而基金是“a pool of money that is allocated for a specific purpose”2。 什么情况下买基金？😎想快速分散风险：一只基金往往持有几十甚至上百只股票，把“鸡蛋”放在不同篮子里4。没有时间或专业知识：基金由专业人士管理，省去盯盘、研究之苦7。做长期定投：用“ dollar-cost averaging”策略，无论市场高低都定期买入，平滑成本8。追求稳健、控制回撤：基金通过多元化降低单一公司破产或暴跌带来的冲击9。“Investing in mutual funds offers Professional Management and Diversification”4。很多基金最低投资金额低至几元，适合小额定投10。4. ***买基金 ≠ 万事大吉，也要“把好三关”🔍目标关：确认基金类型（股票型、债券型、混合型等）是否符合你的风险偏好11。费用关：留意管理费、申购费，高费率会侵蚀长期收益12。纪律关：设定好投资计划，避免因短期波动频繁申赎；基金通常“trade only once per day”13（评语：给建议时足够具体可落地的warning能给人可靠感。同时这种基础知识是问出这个问题的人希望知道的）***。5. 投资节奏：别等“完美时机”⏰• 股票：分批买入，避免一次性高点站岗；可结合估值与基本面判断“安全边际”14。• 基金：定投最省心，长期坚持比预测市场更重要；“dollar-cost averaging”已被证明是减少市场波动影响的有效策略8。6. 小结 & xxx互动（评语：“互动”本身被点出会给人“目的感”造成轻微不适。就像是找你聊天的人说“为了和你搞好关系我来和你聊会儿天”）xxx 问题抛给你：你更想花时间“精挑细选”还是一键“省心托管”？欢迎留言聊聊你的想法，让我们一起找到最适合你的投资方式吧！🎯案例二：论一句话：xxx短线交易虽然整体回报往往跑输长线投资，但对部分人来说，它提供“快速获利 + 高频掌控感 + 灵活进出”的独特吸引力，因此始终有人前赴后继（评语：应该加入为什么“快速获利 + 高频掌控感 + 灵活进出”这三者让人更喜欢，如果想从心理角度解释就应该更详细一点）xxx。• 胜率与盈亏比：多数散户短线交易在扣除费用后仍难敌长线指数基金9。• 时间与精力：短线需要全天候跟踪行情，对业余投资者门槛极高10。4. 如何找到自己的平衡点？🎯🛠️核心—卫星：用长线基金做“核心”仓位，少量资金做短线“卫星”博取超额收益。设定纪律：• 交易前明确止损位（如 10%–15%）8• 控制频率，避免因无聊或 FOMO 而过度交易7持续学习：掌握技术分析、仓位管理与情绪调节，把短线当作“技能训练”而非“发财捷径”。***5. 投资者心理视角 🧠💡• 损失厌恶：短线交易者常因小亏而急于回本，导致情绪化加仓3。• 即时满足：大脑对“快速盈利”信号更敏感，这也是短线成瘾的原因之一（评语：很好的补上了开头的解释的缺失，但是有点短）***如果给你一笔“可短线也可长线”的资金，你更想体验“快速盈利的刺激”还是“复利增长的从容”？欢迎留言聊聊你的想法，让我们一起找到最适合你的投资节奏吧！🎯📊"
XAI_TEMPERATURE = 0.8


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
    api_key = os.environ.get(XAI_API_KEY_ENV, "").strip()
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
