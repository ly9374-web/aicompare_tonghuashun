from __future__ import annotations

import json
import shutil
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from knowledge_map.config import DATA_DIR, MAPS_FILE
from knowledge_map.models import (
    build_edges,
    center_node,
    normalize_manual_edges,
    normalize_map,
    normalize_nodes,
)


DATA_LOCK = threading.Lock()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not MAPS_FILE.exists():
        save_maps([])


def load_maps() -> list[dict[str, Any]]:
    ensure_storage()
    try:
        payload = json.loads(MAPS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        recover_maps_file()
        payload = {"maps": []}

    maps = payload if isinstance(payload, list) else payload.get("maps", [])
    if not isinstance(maps, list):
        recover_maps_file()
        maps = []
    return [normalize_map(item) for item in maps if isinstance(item, dict)]


def save_maps(maps: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    normalized = [normalize_map(item) for item in maps]
    tmp_file = MAPS_FILE.with_suffix(".json.tmp")
    tmp_file.write_text(
        json.dumps({"maps": normalized}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_file.replace(MAPS_FILE)


def recover_maps_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if MAPS_FILE.exists():
        backup = MAPS_FILE.with_suffix(f".broken-{utc_now_iso().replace(':', '-')}.json")
        try:
            shutil.copy2(MAPS_FILE, backup)
        except OSError:
            pass
    MAPS_FILE.write_text(json.dumps({"maps": []}, ensure_ascii=False, indent=2), encoding="utf-8")


def create_map() -> dict[str, Any]:
    now = utc_now_iso()
    existing_maps = load_maps()
    root = center_node()
    new_map = {
        "id": str(uuid.uuid4()),
        "title": f"知识导图 {len(existing_maps) + 1}",
        "created_at": now,
        "updated_at": now,
        "nodes": [root],
        "edges": [],
        "annotations": [],
    }
    new_map["edges"] = build_edges(new_map["nodes"])
    save_maps([new_map, *existing_maps])
    return new_map


def find_map(map_id: str | None) -> dict[str, Any] | None:
    if not map_id:
        return None
    return next((item for item in load_maps() if item.get("id") == map_id), None)


def rename_map(map_id: str, title: str) -> bool:
    title = title.strip() or "未命名知识导图"
    with DATA_LOCK:
        maps = load_maps()
        for item in maps:
            if item.get("id") == map_id:
                item["title"] = title
                item["updated_at"] = utc_now_iso()
                save_maps(maps)
                return True
    return False


def delete_map(map_id: str) -> bool:
    with DATA_LOCK:
        maps = load_maps()
        remaining = [item for item in maps if item.get("id") != map_id]
        if len(remaining) == len(maps):
            return False
        save_maps(remaining)
        return True


def duplicate_map(map_id: str) -> dict[str, Any] | None:
    with DATA_LOCK:
        maps = load_maps()
        source = next((item for item in maps if item.get("id") == map_id), None)
        if source is None:
            return None

        now = utc_now_iso()
        copied = json.loads(json.dumps(source, ensure_ascii=False))
        copied["id"] = str(uuid.uuid4())
        copied["title"] = f"{source.get('title', '未命名知识导图')} 副本"
        copied["created_at"] = now
        copied["updated_at"] = now
        save_maps([copied, *maps])
        return copied


def update_map_payload(map_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    with DATA_LOCK:
        maps = load_maps()
        target: dict[str, Any] | None = None
        for item in maps:
            if item.get("id") == map_id:
                nodes = normalize_nodes(payload.get("nodes", item.get("nodes", [])))
                manual_edges = normalize_manual_edges(payload.get("edges", []), nodes)
                item["nodes"] = nodes
                item["edges"] = [*build_edges(nodes), *manual_edges]
                item["annotations"] = payload.get("annotations", item.get("annotations", []))
                item["updated_at"] = utc_now_iso()
                target = item
                break

        if target is None:
            return None

        save_maps(maps)
        return target
