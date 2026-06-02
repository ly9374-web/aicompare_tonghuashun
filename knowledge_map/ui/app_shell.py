import streamlit as st

from knowledge_map.config import APP_TITLE
from knowledge_map.local_api import start_local_api
from knowledge_map.storage import ensure_storage
from knowledge_map.ui.pages import init_route, render_editor, render_home, render_records


def main() -> None:
    st.set_page_config(page_title=APP_TITLE, layout="wide")
    init_route()
    ensure_storage()
    api_port = start_local_api()

    view = st.session_state.view
    if view == "records":
        render_records()
    elif view == "editor":
        render_editor(api_port)
    else:
        render_home()
