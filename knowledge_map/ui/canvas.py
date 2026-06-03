from __future__ import annotations

import json
from typing import Any

import streamlit.components.v1 as components

from knowledge_map.config import AI_ANALYSIS_ENABLED, FRONTEND_DIR


def render_canvas(map_data: dict[str, Any], api_port: int) -> None:
    api_url = f"http://127.0.0.1:{api_port}"
    safe_map_json = json.dumps(map_data, ensure_ascii=False).replace("</", "<\\/")

    template = (FRONTEND_DIR / "canvas.html").read_text(encoding="utf-8")
    css = (FRONTEND_DIR / "canvas.css").read_text(encoding="utf-8")
    js = (FRONTEND_DIR / "canvas.js").read_text(encoding="utf-8")
    ai_js = (FRONTEND_DIR / "ai_analysis.js").read_text(encoding="utf-8") if AI_ANALYSIS_ENABLED else ""
    ai_menu_button = '<button id="context-menu-ai-action" type="button">ai分析</button>' if AI_ANALYSIS_ENABLED else ""
    ai_js_block = f"<script>\n{ai_js}\n</script>" if AI_ANALYSIS_ENABLED else ""

    canvas_html = (
        template
        .replace("__CANVAS_CSS__", css)
        .replace("__CANVAS_JS__", js)
        .replace("__AI_ANALYSIS_MENU_BUTTON__", ai_menu_button)
        .replace("__AI_ANALYSIS_JS_BLOCK__", ai_js_block)
        .replace("__API_URL__", json.dumps(api_url))
        .replace("__MAP_DATA_JSON__", safe_map_json)
    )
    components.html(canvas_html, height=740, scrolling=False)
