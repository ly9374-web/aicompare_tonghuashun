from __future__ import annotations

from html import escape

import streamlit as st

from knowledge_map.storage import create_map, delete_map, duplicate_map, find_map, load_maps, rename_map
from knowledge_map.ui.canvas import render_canvas


def inject_page_styles() -> None:
    st.markdown(
        """
        <style>
        @keyframes softPulse {
          0% { background-position: 0% 0%, 100% 0%, 50% 100%; }
          50% { background-position: 12% 8%, 88% 10%, 48% 88%; }
          100% { background-position: 0% 0%, 100% 0%, 50% 100%; }
        }

        .stApp {
          background:
            radial-gradient(circle at 15% 18%, rgba(37, 99, 235, 0.14), transparent 30%),
            radial-gradient(circle at 82% 8%, rgba(8, 145, 178, 0.12), transparent 28%),
            radial-gradient(circle at 52% 86%, rgba(15, 23, 42, 0.06), transparent 30%),
            linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%);
          background-size: 120% 120%, 120% 120%, 100% 100%, 100% 100%;
          animation: softPulse 16s ease-in-out infinite;
        }

        .block-container {
          padding-top: 2.2rem;
          padding-bottom: 2.4rem;
        }

        .hero-shell {
          max-width: 920px;
          margin: 5.5rem auto 2rem;
          padding: 3rem 3.2rem;
          border: 1px solid rgba(148, 163, 184, 0.26);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.68);
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          text-align: center;
        }

        .hero-kicker {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          padding: 0 12px;
          border: 1px solid rgba(37, 99, 235, 0.20);
          border-radius: 999px;
          color: #2563eb;
          background: rgba(239, 246, 255, 0.82);
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .hero-title {
          margin: 0;
          color: #000000 !important;
          font-size: clamp(2.25rem, 5vw, 4.2rem);
          line-height: 1.05;
          letter-spacing: 0;
          font-weight: 800;
        }

        .hero-subtitle {
          margin: 1.1rem auto 0;
          max-width: 660px;
          color: #475569;
          font-size: 1.12rem;
          line-height: 1.75;
        }

        .hero-actions {
          max-width: 480px;
          margin: 1.4rem auto 0;
        }

        div[data-testid="stButton"] > button {
          border-radius: 14px;
          min-height: 46px;
          font-weight: 700;
          border: 1px solid rgba(148, 163, 184, 0.28);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
        }

        div[data-testid="stButton"] > button[kind="primary"] {
          background: linear-gradient(135deg, #2563eb, #0891b2);
          border: 0;
        }

        .editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 0.2rem 0 0.8rem;
          padding: 0.8rem 1rem;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.62);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .editor-title {
          color: #0f172a;
          font-size: 1.15rem;
          font-weight: 800;
        }

        .editor-subtitle {
          color: #64748b;
          font-size: 0.86rem;
        }

        .record-heading {
          color: #0f172a;
          font-weight: 800;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def set_route(view: str, map_id: str | None = None) -> None:
    st.session_state.view = view
    st.session_state.map_id = map_id


def init_route() -> None:
    if "view" not in st.session_state:
        st.session_state.view = "home"
    if "map_id" not in st.session_state:
        st.session_state.map_id = None


def render_home() -> None:
    inject_page_styles()
    st.markdown(
        """
        <section class="hero-shell">
          <div class="hero-kicker">AI answer mapping workspace</div>
          <h1 class="hero-title" style="color: #000000 !important;">AI 回答知识导图对比工具</h1>
          <p class="hero-subtitle">用结构化导图分析两个大模型的回答差异</p>
        </section>
        """,
        unsafe_allow_html=True,
    )

    st.markdown('<div class="hero-actions">', unsafe_allow_html=True)
    start_col, records_col = st.columns(2)
    with start_col:
        if st.button("开始", use_container_width=True, type="primary"):
            new_map_data = create_map()
            set_route("editor", new_map_data["id"])
            st.rerun()

    with records_col:
        if st.button("记录", use_container_width=True):
            set_route("records")
            st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)


def render_records() -> None:
    inject_page_styles()
    st.markdown(
        """
        <style>
        .stApp h1,
        .stApp h2,
        .stApp h3,
        .stApp p,
        .stApp span,
        .stApp label,
        .stApp div[data-testid="stMarkdownContainer"],
        .stApp div[data-testid="stCaptionContainer"],
        .stApp div[data-testid="stCheckbox"] label,
        .stApp div[data-testid="stCheckbox"] p {
          color: #000000 !important;
        }

        div[data-testid="stHorizontalBlock"]:has(.record-heading)
          > div:first-child div[data-testid="stButton"] {
          margin-top: 15px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    left_col, title_col = st.columns([1, 5])
    with left_col:
        if st.button("返回"):
            set_route("home")
            st.rerun()
    with title_col:
        st.markdown('<h1 class="record-heading">历史记录</h1>', unsafe_allow_html=True)

    maps = load_maps()
    if not maps:
        st.info("还没有创建过知识导图。")
        return

    for item in maps:
        map_id = item["id"]
        created_at = item.get("created_at", "")
        updated_at = item.get("updated_at", "")
        node_count = len(item.get("nodes", []))
        with st.container(border=True):
            title = item.get("title", "未命名知识导图")
            st.subheader(title)
            st.caption(f"创建时间：{created_at}")
            st.caption(f"更新时间：{updated_at}")
            st.caption(f"节点数量：{node_count}")

            rename_col, action_col = st.columns([3, 4])
            with rename_col:
                next_title = st.text_input("标题", value=title, key=f"title-{map_id}", label_visibility="collapsed")
                if st.button("重命名", key=f"rename-{map_id}"):
                    try:
                        rename_map(map_id, next_title)
                        st.rerun()
                    except Exception as exc:
                        st.error(f"重命名失败：{exc}")

            with action_col:
                open_col, copy_col, delete_col = st.columns(3)
                with open_col:
                    if st.button("进入编辑", key=f"open-{map_id}", use_container_width=True):
                        set_route("editor", map_id)
                        st.rerun()
                with copy_col:
                    if st.button("复制", key=f"copy-{map_id}", use_container_width=True):
                        try:
                            duplicate_map(map_id)
                            st.rerun()
                        except Exception as exc:
                            st.error(f"复制失败：{exc}")
                with delete_col:
                    confirm_delete = st.checkbox("确认删除", key=f"confirm-delete-{map_id}")
                    if st.button("删除", key=f"delete-{map_id}", use_container_width=True, disabled=not confirm_delete):
                        try:
                            delete_map(map_id)
                            if st.session_state.map_id == map_id:
                                set_route("records")
                            st.rerun()
                        except Exception as exc:
                            st.error(f"删除失败：{exc}")



def render_editor(api_port: int) -> None:
    inject_page_styles()
    map_data = find_map(st.session_state.map_id)
    if map_data is None:
        st.warning("没有找到对应的知识导图。")
        if st.button("返回首页"):
            set_route("home")
            st.rerun()
        return

    title = escape(map_data.get("title", "未命名知识导图"))
    st.markdown(
        """
        <style>
        div[data-testid="stHorizontalBlock"]:has(.editor-header)
          > div:first-child div[data-testid="stButton"] {
          margin-top: 15px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    back_col, header_col = st.columns([1, 6])
    with back_col:
        if st.button("返回", use_container_width=True):
            set_route("home")
            st.rerun()
    with header_col:
        st.markdown(
            f"""
            <div class="editor-header">
              <div>
                <div class="editor-title">{title}</div>
                <div class="editor-subtitle">保存状态在画布顶部右侧显示</div>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    render_canvas(map_data, api_port)
