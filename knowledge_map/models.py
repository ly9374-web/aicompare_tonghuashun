from __future__ import annotations

import uuid
from typing import Any


def new_node(
    *,
    text: str,
    x: int,
    y: int,
    parent_id: str | None,
    level: int,
    width: int = 140,
    height: int = 44,
    manual: bool = False,
    images: list[dict[str, Any]] | None = None,
    crown: bool = False,
    compare_group_id: str | None = None,
    compare_index: int | None = None,
    text_html: str | None = None,
    compare_main_html: str | None = None,
    compare_sub_html: str | None = None,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "text": text,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "parent_id": parent_id,
        "children": [],
        "level": level,
        "manual": manual,
        "images": images or [],
        "crown": crown,
        "compare_group_id": compare_group_id,
        "compare_index": compare_index,
        "text_html": text_html or text,
        "compare_main_html": compare_main_html or "",
        "compare_sub_html": compare_sub_html or "",
    }


def center_node() -> dict[str, Any]:
    return new_node(text="中心主题", x=180, y=310, parent_id=None, level=0, width=120)


def build_edges(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    node_ids = {node.get("id") for node in nodes}
    for node in nodes:
        parent_id = node.get("parent_id")
        node_id = node.get("id")
        if parent_id and parent_id in node_ids and node_id:
            edges.append(
                {
                    "id": f"edge-{parent_id}-{node_id}",
                    "source": parent_id,
                    "target": node_id,
                    "source_anchor": "right",
                    "target_anchor": "left",
                    "type": "auto",
                }
            )
    return edges


def normalize_manual_edges(
    edges: list[dict[str, Any]],
    nodes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    node_ids = {node.get("id") for node in nodes}
    normalized: list[dict[str, Any]] = []

    for raw in edges:
        if not isinstance(raw, dict) or raw.get("type") != "manual":
            continue

        source = raw.get("source")
        target = raw.get("target")
        if source not in node_ids or target not in node_ids or source == target:
            continue

        normalized.append(
            {
                "id": str(raw.get("id") or uuid.uuid4()),
                "source": str(source),
                "target": str(target),
                "source_anchor": str(raw.get("source_anchor") or "right"),
                "target_anchor": str(raw.get("target_anchor") or "left"),
                "type": "manual",
            }
        )

    return normalized


def normalize_annotations(
    annotations: list[dict[str, Any]],
    nodes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    node_ids = {node.get("id") for node in nodes}
    normalized: list[dict[str, Any]] = []

    for raw in annotations:
        if not isinstance(raw, dict):
            continue

        if raw.get("type") == "highlight":
            node_id = raw.get("node_id")
            if node_id not in node_ids:
                continue

            normalized.append(
                {
                    "id": str(raw.get("id") or uuid.uuid4()),
                    "type": "highlight",
                    "node_id": str(node_id),
                    "color": str(raw.get("color") or "#fff7cc"),
                }
            )
            continue

        if raw.get("type") == "stroke":
            points = raw.get("points", [])
            if not isinstance(points, list) or len(points) < 2:
                continue

            normalized_points: list[dict[str, float]] = []
            for point in points:
                if not isinstance(point, dict):
                    continue
                try:
                    normalized_points.append({"x": float(point["x"]), "y": float(point["y"])})
                except (KeyError, TypeError, ValueError):
                    continue

            if len(normalized_points) < 2:
                continue

            normalized.append(
                {
                    "id": str(raw.get("id") or uuid.uuid4()),
                    "type": "stroke",
                    "color": str(raw.get("color") or "rgba(239, 68, 68, 0.36)"),
                    "width": int(raw.get("width", 16)),
                    "points": normalized_points,
                }
            )

    return normalized


def normalize_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    by_parent: dict[str | None, list[str]] = {}

    for raw in nodes:
        node_id = str(raw.get("id") or uuid.uuid4())
        parent_id = raw.get("parent_id")
        images: list[dict[str, Any]] = []
        for image in raw.get("images", []):
            if not isinstance(image, dict) or not image.get("data_url"):
                continue
            images.append(
                {
                    "id": str(image.get("id") or uuid.uuid4()),
                    "data_url": str(image.get("data_url")),
                    "width": int(image.get("width", 0)),
                    "height": int(image.get("height", 0)),
                }
            )
        try:
            compare_index = int(raw["compare_index"]) if raw.get("compare_index") is not None else None
        except (TypeError, ValueError):
            compare_index = None

        is_compare_node = bool(raw.get("compare_group_id"))
        node = {
            "id": node_id,
            "text": str(raw.get("text") or "新主题"),
            "x": int(raw.get("x", 180)),
            "y": int(raw.get("y", 310)),
            "width": int(raw.get("width", 120)),
            "height": int(raw.get("height", 44)),
            "parent_id": parent_id,
            "children": [],
            "level": int(raw.get("level", 0)),
            "manual": bool(raw.get("manual", False)),
            "images": images,
            "crown": bool(raw.get("crown", False)),
            "compare_group_id": raw.get("compare_group_id") or None,
            "compare_index": compare_index,
            "text_html": str(raw.get("text_html") or raw.get("text") or "新主题"),
            "compare_main_html": str(raw.get("compare_main_html") or ""),
            "compare_sub_html": str(raw.get("compare_sub_html") or (raw.get("text") if is_compare_node else "") or ""),
        }
        normalized.append(node)
        by_parent.setdefault(parent_id, []).append(node_id)

    for node in normalized:
        node["children"] = by_parent.get(node["id"], [])

    return normalized


def normalize_map(map_data: dict[str, Any]) -> dict[str, Any]:
    nodes = normalize_nodes(map_data.get("nodes") or [center_node()])
    manual_edges = normalize_manual_edges(map_data.get("edges", []), nodes)
    map_data["nodes"] = nodes
    map_data["edges"] = [*build_edges(nodes), *manual_edges]
    map_data["annotations"] = normalize_annotations(map_data.get("annotations", []), nodes)
    return map_data
