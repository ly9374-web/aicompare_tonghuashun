      const apiUrl = __API_URL__;
      const mapData = __MAP_DATA_JSON__;
      const viewport = document.getElementById("viewport");
      const canvasWorld = document.getElementById("canvas-world");
      const canvasContent = document.getElementById("canvas-content");
      const nodesLayer = document.getElementById("nodes-layer");
      const edgesLayer = document.getElementById("edges-layer");
      const annotationLayer = document.getElementById("annotation-layer");
      const saveState = document.getElementById("save-state");
      const titleEl = document.getElementById("map-title");
      const nodeCountEl = document.getElementById("node-count");
      const layerBackButton = document.getElementById("layer-back-button");
      const layerTitleEl = document.getElementById("layer-title");
      const autoLayoutButton = document.getElementById("auto-layout-button");
      const uploadImageButton = document.getElementById("upload-image-button");
      const imageUploadInput = document.getElementById("image-upload-input");
      const redHighlighterButton = document.getElementById("red-highlighter-button");
      const greenHighlighterButton = document.getElementById("green-highlighter-button");
      const brushSizeInput = document.getElementById("brush-size-input");
      const eraserButton = document.getElementById("eraser-button");
      const commentButton = document.getElementById("comment-button");
      const compareButton = document.getElementById("compare-button");
      const contextMenu = document.getElementById("context-menu");
      const contextMenuAction = document.getElementById("context-menu-action");
      const contextMenuMoveUpAction = document.getElementById("context-menu-move-up-action");
      const contextMenuDeleteAction = document.getElementById("context-menu-delete-action");
      const contextMenuCollapseAction = document.getElementById("context-menu-collapse-action");

      const MIN_NODE_WIDTH = 120;
      const MAX_NODE_WIDTH = 360;
      const LEVEL_GAP = 190;
      const SIBLING_GAP = 30;
      const BRANCH_GAP = 56;
      const COMPACT_LEVEL_GAP = 96;
      const COMPACT_BRANCH_GAP = 30;
      const COMPACT_SIBLING_GAP = 22;
      const LAYER_GRID_GAP = 30;
      const LAYER_LEFT = 80;
      const LAYER_TOP = 92;
      const DRAG_THRESHOLD = 6;
      const RE_PARENT_OVERLAP_RATIO = 0.6;
      const RE_PARENT_HOLD_MS = 1000;
      const CANVAS_PADDING = 24;
      const CROWN_SPACE = 24;
      const MIN_SCALE = 0.35;
      const MAX_SCALE = 2.4;
      const COMPARE_GAP = 30;
      const MAX_UNDO_STEPS = 80;
      const WORLD_ORIGIN = 50000;
      const MIN_WORLD_SIZE = WORLD_ORIGIN * 2;
      const RED_TEXT_HIGHLIGHT = "rgba(248, 113, 113, 0.42)";
      const GREEN_TEXT_HIGHLIGHT = "rgba(74, 222, 128, 0.42)";

      let nodes = normalizeNodes(mapData.nodes || []);
      let manualEdges = normalizeManualEdges(mapData.edges || [], nodes);
      let annotations = normalizeAnnotations(mapData.annotations || [], nodes);
      let selectedId = nodes[0]?.id || null;
      let selectedEdgeId = null;
      let currentParentId = null;
      let editingId = null;
      let editingField = "text";
      let saveTimer = null;
      let isDragging = false;
      let dragState = null;
      let suppressNextClick = false;
      let isPanning = false;
      let panState = null;
      let contextNodeId = null;
      let connectionState = null;
      let hoverConnectTargetId = null;
      let annotationMode = "none";
      let brushSize = Number(brushSizeInput.value || 16);
      let activeStroke = null;
      let eraserActive = false;
      let canvasScale = Number(mapData.viewport_scale || 1);
      let undoStack = [];
      let isRestoring = false;
      let editSnapshotTaken = false;
      let didCenterCanvas = false;

      titleEl.textContent = mapData.title || "未命名知识导图";
      canvasScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, canvasScale || 1));

      function uuid() {
        if (window.crypto && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        return "node-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
      }

      function escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function htmlToText(html) {
        const box = document.createElement("div");
        box.innerHTML = sanitizeHtml(html);
        return box.textContent.trim();
      }

      function textToHtml(text) {
        return escapeHtml(text || "新主题");
      }

      function appendAutoHighlightedText(text, outputParent) {
        const source = String(text || "");
        const markers = [
          { token: "***", color: GREEN_TEXT_HIGHLIGHT },
          { token: "xxx", color: RED_TEXT_HIGHLIGHT }
        ];
        let cursor = 0;

        while (cursor < source.length) {
          let next = null;
          for (const marker of markers) {
            const start = source.indexOf(marker.token, cursor);
            if (start === -1) continue;
            if (!next || start < next.start || (start === next.start && marker.token.length > next.token.length)) {
              next = { ...marker, start };
            }
          }

          if (!next) {
            outputParent.appendChild(document.createTextNode(source.slice(cursor)));
            return;
          }

          const closeStart = source.indexOf(next.token, next.start + next.token.length);
          if (closeStart === -1) {
            outputParent.appendChild(document.createTextNode(source.slice(cursor)));
            return;
          }

          if (next.start > cursor) {
            outputParent.appendChild(document.createTextNode(source.slice(cursor, next.start)));
          }

          const innerText = source.slice(next.start + next.token.length, closeStart);
          if (innerText) {
            const span = document.createElement("span");
            span.style.backgroundColor = next.color;
            span.setAttribute("data-highlight", "true");
            span.appendChild(document.createTextNode(innerText));
            outputParent.appendChild(span);
          }
          cursor = closeStart + next.token.length;
        }
      }

      function sanitizeHtml(html) {
        const source = document.createElement("div");
        source.innerHTML = String(html || "");
        const clean = document.createElement("div");

        function copyNode(input, outputParent) {
          if (input.nodeType === Node.TEXT_NODE) {
            appendAutoHighlightedText(input.textContent || "", outputParent);
            return;
          }
          if (input.nodeType !== Node.ELEMENT_NODE) return;

          const tag = input.tagName.toLowerCase();
          if (tag === "br") {
            outputParent.appendChild(document.createElement("br"));
            return;
          }

          let output = outputParent;
          if (tag === "span" || tag === "font") {
            const background = input.style.backgroundColor || input.getAttribute("data-highlight-color") || "";
            const isComment = input.getAttribute("data-comment") === "true" ||
              input.style.fontWeight === "bold" ||
              input.style.fontWeight === "700" ||
              input.style.textDecorationLine.includes("underline") ||
              input.style.textDecoration.includes("underline");
            if (background || isComment) {
              const span = document.createElement("span");
              if (background) {
                span.style.backgroundColor = background;
                span.setAttribute("data-highlight", "true");
              }
              if (isComment) {
                span.style.fontWeight = "700";
                span.style.textDecoration = "underline";
                span.setAttribute("data-comment", "true");
              }
              outputParent.appendChild(span);
              output = span;
            }
          }

          Array.from(input.childNodes).forEach((child) => copyNode(child, output));
        }

        Array.from(source.childNodes).forEach((child) => copyNode(child, clean));
        return clean.innerHTML;
      }

      function compareLabel(node) {
        return Number(node.compare_index || 0) === 0 ? "chatgpt" : "AIME";
      }

      function canvasX(x) {
        return x + WORLD_ORIGIN;
      }

      function canvasY(y) {
        return y + WORLD_ORIGIN;
      }

      function logicalToCanvasPoint(point) {
        return { x: canvasX(point.x), y: canvasY(point.y) };
      }

      function normalizeNodes(rawNodes) {
        if (!rawNodes.length) {
          rawNodes = [{
            id: uuid(),
            text: "中心主题",
            x: 180,
            y: 310,
            width: 120,
            height: 44,
            parent_id: null,
            children: [],
            level: 0,
            manual: false,
            images: [],
            crown: false,
            compare_group_id: null,
            compare_index: null,
            collapsed: false,
            text_html: "中心主题",
            compare_main_html: "",
            compare_sub_html: ""
          }];
        }

        const list = rawNodes.map((node) => {
          const textHtml = sanitizeHtml(node.text_html || textToHtml(node.text || "新主题"));
          const mainHtml = sanitizeHtml(node.compare_main_html || "");
          const subHtml = sanitizeHtml(node.compare_sub_html || (node.compare_group_id ? textHtml : ""));
          const plainText = htmlToText(node.compare_group_id ? subHtml || mainHtml || textHtml : textHtml) || String(node.text || "新主题");
          return {
            id: String(node.id || uuid()),
            text: plainText,
            text_html: textHtml,
            compare_main_html: mainHtml,
            compare_sub_html: subHtml,
            x: Number(node.x || 180),
            y: Number(node.y || 310),
            width: Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, Number(node.width || MIN_NODE_WIDTH))),
            height: Number(node.height || 44),
            parent_id: node.parent_id || null,
            children: [],
            level: Number(node.level || 0),
            manual: Boolean(node.manual),
            crown: Boolean(node.crown),
            collapsed: Boolean(node.collapsed),
            compare_group_id: node.compare_group_id ? String(node.compare_group_id) : null,
            compare_index: node.compare_index === null || node.compare_index === undefined ? null : Number(node.compare_index),
            images: Array.isArray(node.images)
              ? node.images
                  .filter((image) => image && image.data_url)
                  .map((image) => ({
                    id: String(image.id || uuid()),
                    data_url: String(image.data_url),
                    width: Number(image.width || 0),
                    height: Number(image.height || 0)
                  }))
              : []
          };
        });

        const byParent = new Map();
        list.forEach((node) => {
          const key = node.parent_id || "__root__";
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key).push(node.id);
        });
        list.forEach((node) => {
          node.children = byParent.get(node.id) || [];
        });
        return list;
      }

      function normalizeManualEdges(rawEdges, nodeList) {
        const nodeIds = new Set(nodeList.map((node) => node.id));
        return rawEdges
          .filter((edge) => edge && edge.type === "manual")
          .filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)))
          .filter((edge) => String(edge.source) !== String(edge.target))
          .map((edge) => ({
            id: String(edge.id || uuid()),
            source: String(edge.source),
            target: String(edge.target),
            source_anchor: String(edge.source_anchor || "right"),
            target_anchor: String(edge.target_anchor || "left"),
            type: "manual"
          }));
      }

      function normalizeAnnotations(rawAnnotations, nodeList) {
        const nodeIds = new Set(nodeList.map((node) => node.id));
        const normalized = [];
        for (const annotation of rawAnnotations) {
          if (!annotation) continue;

          if (annotation.type === "highlight" && nodeIds.has(String(annotation.node_id))) {
            normalized.push({
            id: String(annotation.id || uuid()),
            type: "highlight",
            node_id: String(annotation.node_id),
            color: String(annotation.color || "#fff7cc")
            });
            continue;
          }

          if (annotation.type === "stroke" && Array.isArray(annotation.points) && annotation.points.length > 1) {
            const points = annotation.points
              .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
              .map((point) => ({ x: Number(point.x), y: Number(point.y) }));
            if (points.length > 1) {
              normalized.push({
                id: String(annotation.id || uuid()),
                type: "stroke",
                color: String(annotation.color || "rgba(239, 68, 68, 0.36)"),
                width: Number(annotation.width || 16),
                points
              });
            }
          }
        }
        return normalized;
      }

      function hasHighlight(nodeId) {
        return annotations.some((annotation) => annotation.type === "highlight" && annotation.node_id === nodeId);
      }

      function getNode(id) {
        return nodes.find((node) => node.id === id);
      }

      function validParentId(parentId) {
        return parentId && getNode(parentId) ? parentId : null;
      }

      function effectiveParentId(node) {
        if (node.compare_group_id) {
          const primary = primaryCompareNode(node);
          return validParentId(primary.parent_id);
        }
        return validParentId(node.parent_id);
      }

      function currentLayerNodes() {
        const parentId = validParentId(currentParentId);
        currentParentId = parentId;
        return nodes.filter((node) => effectiveParentId(node) === parentId);
      }

      function currentLayerUnits() {
        const layerNodes = currentLayerNodes();
        const layerIds = new Set(layerNodes.map((node) => node.id));
        const usedGroups = new Set();
        const units = [];

        for (const node of layerNodes) {
          if (!node.compare_group_id) {
            units.push({ nodes: [node], span: 1 });
            continue;
          }
          if (usedGroups.has(node.compare_group_id)) continue;
          const groupNodes = orderedCompareNodes(compareGroups().get(node.compare_group_id) || [])
            .filter((item) => layerIds.has(item.id));
          if (!groupNodes.length) continue;
          usedGroups.add(node.compare_group_id);
          units.push({ nodes: groupNodes, span: groupNodes.length });
        }
        return units;
      }

      function currentLayerTitle() {
        const parent = getNode(currentParentId);
        if (!parent) return "顶层节点";
        return nodeTextFromHtml(parent);
      }

      function nodeGroup(node) {
        if (!node?.compare_group_id) return node ? [node] : [];
        return orderedCompareNodes(compareGroups().get(node.compare_group_id) || [node]);
      }

      function primaryDraggedNode(node) {
        return primaryCompareNode(node);
      }

      function setGroupParent(groupNodes, parentId) {
        const nextParentId = validParentId(parentId);
        const parent = getNode(nextParentId);
        for (const node of groupNodes) {
          node.parent_id = nextParentId;
          node.level = parent ? parent.level + 1 : 0;
          node.manual = false;
        }
        rebuildChildren();
      }

      function nodeRect(node) {
        return {
          left: node.x,
          top: node.y,
          right: node.x + node.width,
          bottom: node.y + node.height,
          width: node.width,
          height: node.height
        };
      }

      function overlapRatio(a, b) {
        const aRect = nodeRect(a);
        const bRect = nodeRect(b);
        const width = Math.max(0, Math.min(aRect.right, bRect.right) - Math.max(aRect.left, bRect.left));
        const height = Math.max(0, Math.min(aRect.bottom, bRect.bottom) - Math.max(aRect.top, bRect.top));
        const overlap = width * height;
        const aArea = Math.max(1, aRect.width * aRect.height);
        const bArea = Math.max(1, bRect.width * bRect.height);
        return Math.max(overlap / aArea, overlap / bArea);
      }

      function updateLayerHeader() {
        if (layerTitleEl) {
          layerTitleEl.textContent = currentLayerTitle();
        }
        if (layerBackButton) {
          layerBackButton.disabled = !getNode(currentParentId);
        }
      }

      function directChildNodes(parentId) {
        return nodes.filter((node) => effectiveParentId(node) === parentId);
      }

      function openChildLayer(nodeId) {
        const node = getNode(nodeId);
        if (!node) return;
        syncEditingText();
        if (!directChildNodes(node.id).length) {
          showStatus("当前节点没有子节点");
          return;
        }
        currentParentId = node.id;
        selectedId = null;
        selectedEdgeId = null;
        editingId = null;
        editingField = "text";
        closeContextMenu();
        render();
      }

      function goToParentLayer() {
        const parent = getNode(currentParentId);
        if (!parent) return;
        syncEditingText();
        currentParentId = validParentId(parent.parent_id);
        selectedId = parent.id;
        selectedEdgeId = null;
        editingId = null;
        editingField = "text";
        closeContextMenu();
        render();
      }

      function getSiblings(node) {
        return nodes.filter((item) => item.parent_id === node.parent_id);
      }

      function hiddenNodeIds() {
        const hidden = new Set();
        nodes.forEach((node) => {
          if (!node.collapsed) return;
          node.children.forEach((childId) => {
            const child = getNode(childId);
            if (!child) return;
            if (child.compare_group_id) {
              nodes
                .filter((item) => item.compare_group_id === child.compare_group_id)
                .forEach((item) => hidden.add(item.id));
              return;
            }
            hidden.add(child.id);
          });
        });
        return hidden;
      }

      function visibleNodeList() {
        const hidden = hiddenNodeIds();
        return nodes.filter((node) => !hidden.has(node.id));
      }

      function hiddenChildCount(node) {
        if (!node.collapsed) return 0;
        const foldedUnits = new Set();
        node.children.forEach((childId) => {
          const child = getNode(childId);
          if (!child) return;
          foldedUnits.add(child.compare_group_id ? `compare:${child.compare_group_id}` : child.id);
        });
        return foldedUnits.size;
      }

      function selectNode(id) {
        selectedId = id;
        selectedEdgeId = null;
        if (!editingId) render();
      }

      function selectEdge(id) {
        selectedEdgeId = id;
        selectedId = null;
        editingId = null;
        closeContextMenu();
        render();
      }

      function editableSelector(id, field = "text") {
        return `[data-node-id="${id}"] [data-edit-field="${field}"]`;
      }

      function nodeTextFromHtml(node) {
        if (node.compare_group_id) {
          return htmlToText(node.compare_sub_html || node.compare_main_html || node.text_html || node.text) || "新主题";
        }
        return htmlToText(node.text_html || node.text) || "新主题";
      }

      function enterEdit(id, field = "text") {
        const keepScrollLeft = viewport.scrollLeft;
        const keepScrollTop = viewport.scrollTop;
        selectedId = id;
        editingId = id;
        editingField = field;
        editSnapshotTaken = false;
        render();
        const textEl = document.querySelector(editableSelector(id, field));
        if (!textEl) return;
        textEl.contentEditable = "true";
        textEl.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(textEl);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        viewport.scrollLeft = keepScrollLeft;
        viewport.scrollTop = keepScrollTop;
        requestAnimationFrame(() => {
          viewport.scrollLeft = keepScrollLeft;
          viewport.scrollTop = keepScrollTop;
        });
      }

      function exitEdit() {
        if (!editingId) return;
        const el = document.querySelector(editableSelector(editingId, editingField));
        const node = getNode(editingId);
        if (el && node) {
          const nextHtml = sanitizeHtml(el.innerHTML);
          if (node.compare_group_id && editingField === "compare_main") {
            node.compare_main_html = nextHtml;
          } else if (node.compare_group_id && editingField === "compare_sub") {
            node.compare_sub_html = nextHtml || "新主题";
          } else {
            node.text_html = nextHtml || "新主题";
          }
          node.text = nodeTextFromHtml(node);
          measureNodeText(node);
        }
        editingId = null;
        editingField = "text";
        render();
        scheduleSave();
      }

      function getMeasureBox() {
        let box = document.getElementById("measure-node");
        if (!box) {
          box = document.createElement("div");
          box.id = "measure-node";
          document.body.appendChild(box);
        }
        return box;
      }

      function measureNodeText(node) {
        const box = getMeasureBox();
        box.style.fontWeight = node.level === 0 ? "700" : "400";
        let textWidth = MIN_NODE_WIDTH;
        let textHeight = 0;
        if (node.compare_group_id) {
          const parts = [
            compareLabel(node),
            node.compare_main_html || "",
            node.compare_sub_html || "新主题"
          ];
          for (const part of parts) {
            box.innerHTML = sanitizeHtml(part) || "&nbsp;";
            textWidth = Math.max(textWidth, Math.ceil(box.offsetWidth));
            textHeight += Math.ceil(box.offsetHeight);
          }
          textWidth = Math.max(240, textWidth);
          textHeight += 42;
        } else {
          box.innerHTML = sanitizeHtml(node.text_html || textToHtml(node.text || "新主题"));
          textWidth = Math.ceil(box.offsetWidth);
          textHeight = Math.ceil(box.offsetHeight);
        }
        const imageWidth = Math.max(0, ...node.images.map((image) => Number(image.width || 0)));
        node.width = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, textWidth, imageWidth));

        const contentWidth = Math.max(1, node.width - 28);
        const imageHeight = node.images.reduce((total, image, index) => {
          const naturalWidth = Math.max(1, Number(image.width || contentWidth));
          const naturalHeight = Math.max(1, Number(image.height || 160));
          const scaledHeight = naturalHeight * (contentWidth / naturalWidth);
          return total + scaledHeight + (index === 0 ? 8 : 8);
        }, 0);
        const crownHeight = node.crown ? CROWN_SPACE : 0;
        node.height = Math.max(36, Math.ceil(textHeight + imageHeight + crownHeight));
      }

      function measureNode(node, el) {
        node.width = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, Math.ceil(el.offsetWidth)));
        node.height = Math.max(36, Math.ceil(el.offsetHeight));
      }

      function measureAllNodes() {
        nodes.forEach(measureNodeText);
        syncCompareGroups();
      }

      function compareGroups() {
        const groups = new Map();
        nodes.forEach((node) => {
          if (!node.compare_group_id) return;
          if (!groups.has(node.compare_group_id)) groups.set(node.compare_group_id, []);
          groups.get(node.compare_group_id).push(node);
        });
        return groups;
      }

      function orderedCompareNodes(groupNodes) {
        return [...groupNodes].sort((a, b) => {
          const aIndex = Number.isFinite(a.compare_index) ? a.compare_index : 0;
          const bIndex = Number.isFinite(b.compare_index) ? b.compare_index : 0;
          return aIndex - bIndex;
        });
      }

      function syncCompareGroups() {
        for (const groupNodes of compareGroups().values()) {
          if (groupNodes.length < 2) continue;
          const ordered = orderedCompareNodes(groupNodes);
          const base = ordered[0];
          const maxHeight = Math.max(...ordered.map((node) => node.height || 42));
          let nextX = base.x;
          for (const node of ordered) {
            node.x = nextX;
            node.y = base.y;
            node.height = maxHeight;
            node.manual = true;
            nextX += node.width + COMPARE_GAP;
          }
        }
      }

      function layoutCurrentLayer() {
        measureAllNodes();
        const units = currentLayerUnits();
        if (!units.length) {
          updateLayerHeader();
          return;
        }

        const rowHeight = Math.max(
          42,
          ...units.flatMap((unit) => unit.nodes.map((node) => node.height || 42))
        );
        let x = LAYER_LEFT;
        for (const unit of units) {
          for (const node of unit.nodes) {
            node.x = x;
            node.y = LAYER_TOP + (rowHeight - node.height) / 2;
            node.manual = true;
            x += node.width + LAYER_GRID_GAP;
          }
        }

        syncCompareGroups();
        updateLayerHeader();
      }

      function primaryCompareNode(node) {
        if (!node.compare_group_id) return node;
        const groupNodes = compareGroups().get(node.compare_group_id) || [];
        return orderedCompareNodes(groupNodes)[0] || node;
      }

      function isCompareFollower(node) {
        return Boolean(node.compare_group_id && primaryCompareNode(node).id !== node.id);
      }

      function layoutUnitWidth(node) {
        if (!node.compare_group_id) return node.width;
        const groupNodes = compareGroups().get(node.compare_group_id) || [];
        const ordered = orderedCompareNodes(groupNodes);
        if (ordered[0]?.id !== node.id) return 0;
        return ordered.reduce((total, item, index) => {
          return total + item.width + (index === 0 ? 0 : COMPARE_GAP);
        }, 0);
      }

      function getRootNode() {
        const nodeIds = new Set(nodes.map((node) => node.id));
        return nodes.find((node) => !node.parent_id || !nodeIds.has(node.parent_id)) || nodes[0];
      }

      function childNodes(node) {
        if (node.collapsed) return [];
        return node.children.map(getNode).filter(Boolean);
      }

      function syncLevels(node, level = 0) {
        node.level = level;
        for (const child of childNodes(node)) {
          syncLevels(child, level + 1);
        }
      }

      function computeSubtreeHeight(node, cache) {
        const children = childNodes(node);
        if (!children.length) {
          cache.set(node.id, node.height);
          return node.height;
        }

        const childHeight = children.reduce((total, child, index) => {
          return total + computeSubtreeHeight(child, cache) + (index === 0 ? 0 : COMPACT_BRANCH_GAP);
        }, 0);
        const height = Math.max(node.height, childHeight);
        cache.set(node.id, height);
        return height;
      }

      function collectLevelWidths(node, levelWidths) {
        if (!isCompareFollower(node)) {
          levelWidths[node.level] = Math.max(levelWidths[node.level] || MIN_NODE_WIDTH, layoutUnitWidth(node));
        }
        for (const child of childNodes(node)) {
          collectLevelWidths(child, levelWidths);
        }
      }

      function levelPositions(rootX, levelWidths) {
        const positions = [rootX];
        for (let level = 1; level < levelWidths.length; level += 1) {
          const previousWidth = levelWidths[level - 1] || MIN_NODE_WIDTH;
          positions[level] = positions[level - 1] + previousWidth + COMPACT_LEVEL_GAP;
        }
        return positions;
      }

      function assignSubtree(node, topY, cache, forceAll, levelX) {
        const subtreeHeight = cache.get(node.id) || node.height;
        if (forceAll || !node.manual) {
          node.x = levelX[node.level] ?? node.x;
          node.y = topY + subtreeHeight / 2 - node.height / 2;
        }
        const anchorCenterY = node.y + node.height / 2;

        const children = childNodes(node);
        if (!children.length) return;

        const childBlockHeight = children.reduce((total, child, index) => {
          return total + (cache.get(child.id) || child.height) + (index === 0 ? 0 : COMPACT_BRANCH_GAP);
        }, 0);
        let childTop = anchorCenterY - childBlockHeight / 2;

        for (const child of children) {
          const childHeight = cache.get(child.id) || child.height;
          assignSubtree(child, childTop, cache, forceAll, levelX);
          childTop += childHeight + COMPACT_BRANCH_GAP;
        }
      }

      function rectanglesOverlap(a, b) {
        if (a.compare_group_id && a.compare_group_id === b.compare_group_id) {
          return false;
        }
        return !(
          a.x + a.width + SIBLING_GAP <= b.x ||
          b.x + b.width + SIBLING_GAP <= a.x ||
          a.y + a.height + SIBLING_GAP <= b.y ||
          b.y + b.height + SIBLING_GAP <= a.y
        );
      }

      function avoidOverlaps(forceAll) {
        const ordered = visibleNodeList().filter((node) => !isCompareFollower(node)).sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        });
        const placed = [];

        for (const node of ordered) {
          if (forceAll || !node.manual) {
            let guard = 0;
            while (placed.some((item) => rectanglesOverlap(node, item)) && guard < 80) {
              node.y += COMPACT_SIBLING_GAP;
              guard += 1;
            }
          }
          placed.push(node);
        }
      }

      function layoutTree(options = {}) {
        const forceAll = Boolean(options.forceAll);
        rebuildChildren();
        const root = getRootNode();
        if (!root) return;

        syncLevels(root, 0);
        measureAllNodes();

        if (forceAll) {
          nodes.forEach((node) => node.manual = false);
        }

        const cache = new Map();
        const treeHeight = computeSubtreeHeight(root, cache);
        const viewportHeight = Math.max(620, viewport.clientHeight || 620);
        const rootX = Math.max(160, Math.round((viewport.clientWidth || 1200) * 0.18));
        const topY = Math.max(CANVAS_PADDING, viewportHeight / 2 - treeHeight / 2);
        const levelWidths = [];
        collectLevelWidths(root, levelWidths);
        assignSubtree(root, topY, cache, forceAll, levelPositions(rootX, levelWidths));
        avoidOverlaps(forceAll);
        syncCompareGroups();
      }

      function updateCanvasBounds() {
        syncCompareGroups();
        const layerNodes = currentLayerNodes();
        const maxX = Math.max(
          MIN_WORLD_SIZE,
          ...layerNodes.map((node) => canvasX(node.x + node.width + CANVAS_PADDING)),
          viewport.clientWidth / canvasScale + WORLD_ORIGIN
        );
        const maxY = Math.max(
          MIN_WORLD_SIZE,
          ...layerNodes.map((node) => canvasY(node.y + node.height + CANVAS_PADDING)),
          viewport.clientHeight / canvasScale + WORLD_ORIGIN
        );
        const width = Math.ceil(maxX);
        const height = Math.ceil(maxY);
        canvasContent.style.width = `${width}px`;
        canvasContent.style.height = `${height}px`;
        canvasContent.style.transform = `scale(${canvasScale})`;
        canvasWorld.style.width = `${Math.ceil(width * canvasScale)}px`;
        canvasWorld.style.height = `${Math.ceil(height * canvasScale)}px`;
        edgesLayer.setAttribute("width", String(width));
        edgesLayer.setAttribute("height", String(height));
        annotationLayer.setAttribute("width", String(width));
        annotationLayer.setAttribute("height", String(height));
        nodesLayer.style.width = `${width}px`;
        nodesLayer.style.height = `${height}px`;
        if (!didCenterCanvas) {
          viewport.scrollLeft = WORLD_ORIGIN * canvasScale;
          viewport.scrollTop = WORLD_ORIGIN * canvasScale;
          didCenterCanvas = true;
        }
      }

      function fitVisibleNodesToViewport() {
        const visibleNodes = visibleNodeList();
        if (!visibleNodes.length) return;

        const margin = 80;
        const minX = Math.min(...visibleNodes.map((node) => node.x));
        const minY = Math.min(...visibleNodes.map((node) => node.y));
        const maxX = Math.max(...visibleNodes.map((node) => node.x + node.width));
        const maxY = Math.max(...visibleNodes.map((node) => node.y + node.height));
        const boxWidth = Math.max(1, maxX - minX);
        const boxHeight = Math.max(1, maxY - minY);
        const availableWidth = Math.max(1, viewport.clientWidth - margin * 2);
        const availableHeight = Math.max(1, viewport.clientHeight - margin * 2);

        if (visibleNodes.length === 1) {
          canvasScale = 1;
        } else {
          const widthScale = availableWidth / boxWidth;
          const heightScale = availableHeight / boxHeight;
          let nextScale = Math.min(widthScale, heightScale, MAX_SCALE);
          if (nextScale < MIN_SCALE) {
            nextScale = widthScale >= MIN_SCALE ? Math.min(widthScale, MAX_SCALE) : MIN_SCALE;
          }
          canvasScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
        }

        updateCanvasBounds();
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        viewport.scrollLeft = (centerX + WORLD_ORIGIN) * canvasScale - viewport.clientWidth / 2;
        viewport.scrollTop = (centerY + WORLD_ORIGIN) * canvasScale - viewport.clientHeight / 2;
      }

      function focusCurrentLayerStart() {
        syncEditingText();
        canvasScale = 1;
        layoutCurrentLayer();
        updateCanvasBounds();
        renderNodes();
        renderEdges();
        renderAnnotations();

        const layerNodes = currentLayerNodes();
        if (!layerNodes.length) {
          showStatus("当前层级没有节点");
          return;
        }

        const minX = Math.min(...layerNodes.map((node) => node.x));
        const minY = Math.min(...layerNodes.map((node) => node.y));
        const maxY = Math.max(...layerNodes.map((node) => node.y + node.height));
        const centerY = (minY + maxY) / 2;
        viewport.scrollLeft = Math.max(0, canvasX(minX) - 40);
        viewport.scrollTop = Math.max(0, canvasY(centerY) * canvasScale - viewport.clientHeight / 2);
      }

      function createNodeWithParent(parentId) {
        const parent = getNode(parentId);
        const child = {
          id: uuid(),
          text: "新主题",
          x: parent ? parent.x + MAX_NODE_WIDTH + LEVEL_GAP : LAYER_LEFT,
          y: parent ? parent.y : LAYER_TOP,
          width: 120,
          height: 42,
          parent_id: parent ? parent.id : null,
          children: [],
          level: parent ? parent.level + 1 : 0,
          manual: false,
          images: [],
          crown: false,
          compare_group_id: null,
          compare_index: null,
          collapsed: false,
          text_html: "新主题",
          compare_main_html: "",
          compare_sub_html: ""
        };
        return child;
      }

      function createChild(parent) {
        if (!parent) return;
        pushUndoSnapshot();
        exitEdit();
        const child = createNodeWithParent(parent.id);
        nodes.push(child);
        rebuildChildren();
        currentParentId = parent.id;
        selectedId = child.id;
        render();
        scheduleSave();
        enterEdit(child.id);
      }

      function createSibling(node = null) {
        pushUndoSnapshot();
        exitEdit();
        const sibling = createNodeWithParent(node ? effectiveParentId(node) : currentParentId);
        nodes.push(sibling);
        rebuildChildren();
        selectedId = sibling.id;
        currentParentId = effectiveParentId(sibling);
        render();
        scheduleSave();
        enterEdit(sibling.id);
      }

      function createFreeNodeAt(x, y) {
        pushUndoSnapshot();
        exitEdit();
        const node = {
          id: uuid(),
          text: "新主题",
          x,
          y,
          width: 120,
          height: 42,
          parent_id: null,
          children: [],
          level: 0,
          manual: true,
          images: [],
          crown: false,
          compare_group_id: null,
          compare_index: null,
          collapsed: false,
          text_html: "新主题",
          compare_main_html: "",
          compare_sub_html: ""
        };
        nodes.push(node);
        rebuildChildren();
        currentParentId = null;
        selectedId = node.id;
        selectedEdgeId = null;
        render();
        scheduleSave();
        enterEdit(node.id);
      }

      function createComparePair() {
        const node = getNode(selectedId);
        if (!node) {
          showStatus("请先选择一个节点");
          return;
        }
        if (node.compare_group_id) {
          showStatus("当前节点已经在对比组中");
          return;
        }

        pushUndoSnapshot();
        exitEdit();
        syncEditingText();
        const sourceHtml = sanitizeHtml(node.text_html || textToHtml(node.text || "新主题"));
        const groupId = uuid();
        node.compare_group_id = groupId;
        node.compare_index = 0;
        node.compare_main_html = "";
        node.compare_sub_html = sourceHtml;
        node.text = nodeTextFromHtml(node);
        node.manual = true;
        measureNodeText(node);

        const twin = {
          id: uuid(),
          text: node.text,
          x: node.x + node.width + COMPARE_GAP,
          y: node.y,
          width: node.width,
          height: node.height,
          parent_id: effectiveParentId(node),
          children: [],
          level: node.level,
          manual: true,
          images: node.images.map((image) => ({ ...image, id: uuid() })),
          crown: false,
          compare_group_id: groupId,
          compare_index: 1,
          collapsed: false,
          text_html: sourceHtml,
          compare_main_html: "",
          compare_sub_html: sourceHtml
        };
        measureNodeText(twin);
        nodes.push(twin);
        syncCompareGroups();
        rebuildChildren();
        selectedId = twin.id;
        selectedEdgeId = null;
        render();
        scheduleSave();
      }

      function rebuildChildren() {
        nodes.forEach((node) => node.children = []);
        nodes.forEach((node) => {
          if (!node.parent_id) return;
          const parent = getNode(node.parent_id);
          if (parent && !parent.children.includes(node.id)) {
            parent.children.push(node.id);
          }
        });
      }

      function buildEdges() {
        const nodeIds = new Set(nodes.map((node) => node.id));
        const hidden = hiddenNodeIds();
        const autoEdges = nodes
          .filter((node) => node.parent_id && nodeIds.has(node.parent_id))
          .filter((node) => !hidden.has(node.id) && !hidden.has(node.parent_id))
          .map((node) => ({
            id: `edge-${node.parent_id}-${node.id}`,
            source: node.parent_id,
            target: node.id,
            source_anchor: "right",
            target_anchor: "left",
            type: "auto"
          }));
        const validManualEdges = manualEdges.filter((edge) => {
          return nodeIds.has(edge.source) &&
            nodeIds.has(edge.target) &&
            edge.source !== edge.target &&
            !hidden.has(edge.source) &&
            !hidden.has(edge.target);
        });
        return [...autoEdges, ...validManualEdges];
      }

      function serialize() {
        rebuildChildren();
        return {
          nodes: nodes.map((node) => ({
            id: node.id,
            text: node.text,
            x: Math.round(node.x),
            y: Math.round(node.y),
            width: Math.round(node.width),
            height: Math.round(node.height),
            parent_id: node.parent_id,
            children: [...node.children],
            level: node.level,
            manual: Boolean(node.manual),
            crown: Boolean(node.crown),
            collapsed: Boolean(node.collapsed),
            compare_group_id: node.compare_group_id,
            compare_index: node.compare_index,
            text_html: sanitizeHtml(node.text_html || textToHtml(node.text)),
            compare_main_html: sanitizeHtml(node.compare_main_html || ""),
            compare_sub_html: sanitizeHtml(node.compare_sub_html || ""),
            images: node.images.map((image) => ({
              id: image.id,
              data_url: image.data_url,
              width: Math.round(image.width),
              height: Math.round(image.height)
            }))
          })),
          edges: buildEdges(),
          annotations: annotations.map((annotation) => ({
            id: annotation.id,
            type: annotation.type,
            node_id: annotation.node_id,
            color: annotation.color,
            width: annotation.width,
            points: annotation.points
          }))
        };
      }

      function captureState(options = {}) {
        if (options.syncText !== false) {
          syncEditingText();
        }
        return {
          payload: serialize(),
          selectedId,
          selectedEdgeId,
          currentParentId,
          editingId: null
        };
      }

      function pushUndoSnapshot(options = {}) {
        if (isRestoring) return;
        const state = captureState(options);
        const encoded = JSON.stringify(state);
        if (undoStack[undoStack.length - 1] === encoded) return;
        undoStack.push(encoded);
        if (undoStack.length > MAX_UNDO_STEPS) {
          undoStack.shift();
        }
      }

      function restoreState(encoded) {
        const state = JSON.parse(encoded);
        isRestoring = true;
        nodes = normalizeNodes(state.payload.nodes || []);
        manualEdges = normalizeManualEdges(state.payload.edges || [], nodes);
        annotations = normalizeAnnotations(state.payload.annotations || [], nodes);
        selectedId = state.selectedId && getNode(state.selectedId) ? state.selectedId : nodes[0]?.id || null;
        selectedEdgeId = state.selectedEdgeId || null;
        currentParentId = validParentId(state.currentParentId);
        editingId = null;
        connectionState = null;
        hoverConnectTargetId = null;
        activeStroke = null;
        eraserActive = false;
        rebuildChildren();
        measureAllNodes();
        render();
        scheduleSave();
        isRestoring = false;
      }

      function undoLastChange() {
        if (!undoStack.length) {
          showStatus("没有可撤回的操作");
          return;
        }
        restoreState(undoStack.pop());
      }

      function scheduleSave() {
        saveState.textContent = "未保存";
        saveState.className = "dirty";
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 700);
      }

      async function saveNow() {
        try {
          syncEditingText();
          saveState.textContent = "保存中";
          saveState.className = "saving";
          const response = await fetch(`${apiUrl}/maps/${mapData.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(serialize())
          });
          if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload.error || "保存失败");
          }
          saveState.textContent = "已保存";
          saveState.className = "saved";
        } catch (error) {
          saveState.textContent = `保存失败：${error.message || error}`;
          saveState.className = "error";
          console.error(error);
        }
      }

      function showStatus(message) {
        saveState.textContent = message;
        saveState.className = "";
      }

      function closeContextMenu() {
        contextMenu.classList.remove("open");
        contextNodeId = null;
      }

      function openContextMenu(event, nodeId) {
        event.preventDefault();
        event.stopPropagation();
        exitEdit();
        selectedId = nodeId;
        contextNodeId = nodeId;
        const node = getNode(nodeId);
        contextMenuAction.textContent = node?.crown ? "移除王冠" : "添加王冠";
        if (contextMenuMoveUpAction) {
          contextMenuMoveUpAction.disabled = !effectiveParentId(node);
        }
        contextMenuCollapseAction.textContent = node?.collapsed ? "展示后续节点" : "不展示后续节点";
        contextMenuCollapseAction.disabled = !node?.children?.length;
        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.style.top = `${event.clientY}px`;
        contextMenu.classList.add("open");
        render();
      }

      function toggleContextCrown() {
        const node = getNode(contextNodeId);
        if (!node) {
          closeContextMenu();
          return;
        }
        pushUndoSnapshot();
        node.crown = !node.crown;
        measureNodeText(node);
        closeContextMenu();
        render();
        scheduleSave();
      }

      function moveContextNodeUpOneLevel() {
        const node = getNode(contextNodeId);
        const parentId = effectiveParentId(node);
        const parent = getNode(parentId);
        if (!node || !parent) {
          showStatus("当前节点已经是顶层节点");
          closeContextMenu();
          return;
        }

        pushUndoSnapshot();
        const groupNodes = nodeGroup(node);
        const nextParentId = validParentId(parent.parent_id);
        setGroupParent(groupNodes, nextParentId);
        currentParentId = nextParentId;
        selectedId = primaryCompareNode(node).id;
        selectedEdgeId = null;
        editingId = null;
        editingField = "text";
        closeContextMenu();
        render();
        scheduleSave();
      }

      function deleteContextNode() {
        const node = getNode(contextNodeId);
        if (!node) {
          closeContextMenu();
          return;
        }
        const nodeId = node.id;
        closeContextMenu();
        deleteNode(nodeId);
      }

      function toggleContextCollapse() {
        const node = getNode(contextNodeId);
        if (!node) {
          closeContextMenu();
          return;
        }
        if (!node.children.length && !node.collapsed) {
          showStatus("当前节点没有后续节点");
          closeContextMenu();
          return;
        }
        pushUndoSnapshot();
        node.collapsed = !node.collapsed;
        closeContextMenu();
        render();
        scheduleSave();
      }

      function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      function getImageSize(dataUrl) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({
            width: image.naturalWidth || image.width || 0,
            height: image.naturalHeight || image.height || 0
          });
          image.onerror = reject;
          image.src = dataUrl;
        });
      }

      function syncEditingText() {
        if (!editingId) return;
        const node = getNode(editingId);
        const textEl = document.querySelector(editableSelector(editingId, editingField));
        if (node && textEl) {
          const nextHtml = sanitizeHtml(textEl.innerHTML);
          if (node.compare_group_id && editingField === "compare_main") {
            node.compare_main_html = nextHtml;
          } else if (node.compare_group_id && editingField === "compare_sub") {
            node.compare_sub_html = nextHtml || "新主题";
          } else {
            node.text_html = nextHtml || "新主题";
          }
          node.text = nodeTextFromHtml(node);
        }
      }

      async function addImageDataUrlToSelected(dataUrl) {
        const node = getNode(selectedId);
        if (!node) {
          showStatus("请先选择一个节点");
          return;
        }

        syncEditingText();
        pushUndoSnapshot();
        const size = await getImageSize(dataUrl);
        node.images.push({
          id: uuid(),
          data_url: dataUrl,
          width: size.width,
          height: size.height
        });
        measureNodeText(node);
        render();
        scheduleSave();
        if (editingId === node.id) {
          enterEdit(node.id, editingField);
        }
      }

      async function addImageFilesToSelected(files) {
        const node = getNode(selectedId);
        if (!node) {
          showStatus("请先选择一个节点");
          return;
        }

        const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
        if (!imageFiles.length) {
          showStatus("请选择图片文件");
          return;
        }

        showStatus("插入图片中...");
        for (const file of imageFiles) {
          const dataUrl = await readFileAsDataUrl(file);
          await addImageDataUrlToSelected(dataUrl);
        }
      }

      async function handlePaste(event) {
        if (!editingId || editingId !== selectedId) return;
        const items = [...(event.clipboardData?.items || [])];
        const imageItems = items.filter((item) => item.type.startsWith("image/"));
        if (!imageItems.length) return;

        event.preventDefault();
        showStatus("插入截图中...");
        for (const item of imageItems) {
          const file = item.getAsFile();
          if (!file) continue;
          const dataUrl = await readFileAsDataUrl(file);
          await addImageDataUrlToSelected(dataUrl);
        }
      }

      function anchorPoint(node, anchor) {
        const points = {
          top: { x: node.x + node.width / 2, y: node.y },
          right: { x: node.x + node.width, y: node.y + node.height / 2 },
          bottom: { x: node.x + node.width / 2, y: node.y + node.height },
          left: { x: node.x, y: node.y + node.height / 2 }
        };
        return points[anchor] || points.right;
      }

      function controlOffset(anchor, distance) {
        const offsets = {
          top: { x: 0, y: -distance },
          right: { x: distance, y: 0 },
          bottom: { x: 0, y: distance },
          left: { x: -distance, y: 0 }
        };
        return offsets[anchor] || offsets.right;
      }

      function edgePathFromPoints(sourcePoint, targetPoint, sourceAnchor, targetAnchor) {
        const distance = Math.max(48, Math.min(180, Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y) / 2));
        const sourceControl = controlOffset(sourceAnchor, distance);
        const targetControl = controlOffset(targetAnchor, distance);
        const sourceCanvasPoint = logicalToCanvasPoint(sourcePoint);
        const targetCanvasPoint = logicalToCanvasPoint(targetPoint);
        return [
          `M ${sourceCanvasPoint.x} ${sourceCanvasPoint.y}`,
          `C ${sourceCanvasPoint.x + sourceControl.x} ${sourceCanvasPoint.y + sourceControl.y},`,
          `${targetCanvasPoint.x + targetControl.x} ${targetCanvasPoint.y + targetControl.y},`,
          `${targetCanvasPoint.x} ${targetCanvasPoint.y}`
        ].join(" ");
      }

      function edgePath(edge) {
        const source = getNode(edge.source);
        const target = getNode(edge.target);
        if (!source || !target) return "";
        return edgePathFromPoints(
          anchorPoint(source, edge.source_anchor || "right"),
          anchorPoint(target, edge.target_anchor || "left"),
          edge.source_anchor || "right",
          edge.target_anchor || "left"
        );
      }

      function renderEdges() {
        edgesLayer.innerHTML = "";
        connectionState = null;
        hoverConnectTargetId = null;
      }

      function strokePath(points) {
        if (!points.length) return "";
        const [first, ...rest] = points;
        const firstCanvasPoint = logicalToCanvasPoint(first);
        return [
          `M ${firstCanvasPoint.x} ${firstCanvasPoint.y}`,
          ...rest.map((point) => {
            const canvasPoint = logicalToCanvasPoint(point);
            return `L ${canvasPoint.x} ${canvasPoint.y}`;
          })
        ].join(" ");
      }

      function renderAnnotations() {
        annotationLayer.innerHTML = "";
        for (const annotation of annotations) {
          if (annotation.type !== "stroke") continue;
          const pathData = strokePath(annotation.points || []);
          if (!pathData) continue;

          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", pathData);
          path.setAttribute("class", "annotation-stroke");
          path.setAttribute("stroke", annotation.color);
          path.setAttribute("stroke-width", String(annotation.width || 16));
          annotationLayer.appendChild(path);
        }
      }

      function handleEditableInput(node, el, editableEl, field) {
        if (!editSnapshotTaken) {
          pushUndoSnapshot({ syncText: false });
          editSnapshotTaken = true;
        }
        const nextHtml = sanitizeHtml(editableEl.innerHTML);
        if (node.compare_group_id && field === "compare_main") {
          node.compare_main_html = nextHtml;
        } else if (node.compare_group_id && field === "compare_sub") {
          node.compare_sub_html = nextHtml || "新主题";
        } else {
          node.text_html = nextHtml || "新主题";
        }
        node.text = nodeTextFromHtml(node);
        measureNodeText(node);
        el.style.width = `${node.width}px`;
        el.style.minHeight = `${node.height}px`;
        measureNode(node, el);
        updateCanvasBounds();
        renderEdges();
        scheduleSave();
      }

      function makeEditable(node, el, field, className, html) {
        const editable = document.createElement("div");
        editable.className = className;
        editable.dataset.editField = field;
        editable.innerHTML = sanitizeHtml(html);
        editable.contentEditable = node.id === editingId && editingField === field ? "true" : "false";
        editable.addEventListener("input", () => handleEditableInput(node, el, editable, field));
        editable.addEventListener("paste", handlePaste);
        return editable;
      }

      function renderNodes() {
        nodesLayer.innerHTML = "";
        const layerNodes = currentLayerNodes();
        nodeCountEl.textContent = `${layerNodes.length}/${nodes.length} 个节点`;
        for (const node of layerNodes) {
          const el = document.createElement("div");
          el.className = `node level-${node.level}${node.compare_group_id ? " compare-node" : ""}${node.collapsed ? " collapsed-node" : ""}${node.id === selectedId ? " selected" : ""}${node.id === editingId ? " editing" : ""}${node.crown ? " crowned" : ""}${hasHighlight(node.id) ? " highlighted" : ""}${node.id === hoverConnectTargetId ? " connect-target" : ""}`;
          el.dataset.nodeId = node.id;
          el.style.left = `${canvasX(node.x)}px`;
          el.style.top = `${canvasY(node.y)}px`;
          el.style.width = `${node.width}px`;
          el.style.minHeight = `${node.height}px`;
          el.tabIndex = 0;

          if (node.crown) {
            const crownEl = document.createElement("div");
            crownEl.className = "node-crown";
            crownEl.textContent = "👑";
            el.appendChild(crownEl);
          }

          if (node.compare_group_id) {
            const labelEl = document.createElement("div");
            labelEl.className = "compare-label";
            labelEl.textContent = compareLabel(node);
            el.appendChild(labelEl);

            const mainEl = makeEditable(
              node,
              el,
              "compare_main",
              "node-text compare-editor compare-main-editor",
              node.compare_main_html || ""
            );
            el.appendChild(mainEl);

            const subEl = makeEditable(
              node,
              el,
              "compare_sub",
              "node-text compare-editor compare-sub-editor",
              node.compare_sub_html || "新主题"
            );
            el.appendChild(subEl);
          } else {
            const textEl = makeEditable(
              node,
              el,
              "text",
              "node-text",
              node.text_html || textToHtml(node.text)
            );
            el.appendChild(textEl);
          }

          if (node.images.length) {
            const imagesEl = document.createElement("div");
            imagesEl.className = "node-images";
            for (const imageData of node.images) {
              const imageEl = document.createElement("img");
              imageEl.className = "node-image";
              imageEl.src = imageData.data_url;
              imageEl.alt = "节点图片";
              imageEl.addEventListener("load", () => {
                measureNode(node, el);
                updateCanvasBounds();
                renderEdges();
              });
              imagesEl.appendChild(imageEl);
            }
            el.appendChild(imagesEl);
          }

          const foldedCount = hiddenChildCount(node);
          if (foldedCount) {
            const foldedEl = document.createElement("button");
            foldedEl.type = "button";
            foldedEl.className = "collapsed-badge";
            foldedEl.textContent = `已折叠 ${foldedCount} 个节点`;
            foldedEl.addEventListener("pointerdown", (event) => {
              event.preventDefault();
              event.stopPropagation();
            });
            foldedEl.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              pushUndoSnapshot();
              node.collapsed = false;
              render();
              scheduleSave();
            });
            el.appendChild(foldedEl);
          }

          el.addEventListener("pointerdown", (event) => {
            startDrag(event, node.id);
          });
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            if (suppressNextClick) {
              suppressNextClick = false;
              return;
            }
            if (event.detail >= 2) {
              openChildLayer(node.id);
              return;
            }
            enterEdit(node.id, node.compare_group_id ? "compare_sub" : "text");
          });
          el.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openChildLayer(node.id);
          });
          el.addEventListener("contextmenu", (event) => {
            openContextMenu(event, node.id);
          });
          nodesLayer.appendChild(el);
          measureNode(node, el);
        }
      }

      function render() {
        layoutCurrentLayer();
        renderNodes();
        updateCanvasBounds();
        renderEdges();
        renderAnnotations();
      }

      function viewportPoint(event) {
        const rect = viewport.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left + viewport.scrollLeft) / canvasScale - WORLD_ORIGIN,
          y: (event.clientY - rect.top + viewport.scrollTop) / canvasScale - WORLD_ORIGIN
        };
      }

      function setCanvasScale(nextScale, clientX, clientY) {
        const rect = viewport.getBoundingClientRect();
        const oldScale = canvasScale;
        const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
        if (Math.abs(targetScale - oldScale) < 0.001) return;

        const focusX = (clientX - rect.left + viewport.scrollLeft) / oldScale - WORLD_ORIGIN;
        const focusY = (clientY - rect.top + viewport.scrollTop) / oldScale - WORLD_ORIGIN;
        canvasScale = targetScale;
        updateCanvasBounds();
        viewport.scrollLeft = (focusX + WORLD_ORIGIN) * canvasScale - (clientX - rect.left);
        viewport.scrollTop = (focusY + WORLD_ORIGIN) * canvasScale - (clientY - rect.top);
      }

      function isBlankCanvasTarget(target) {
        return target === viewport ||
          target === canvasWorld ||
          target === canvasContent ||
          target === nodesLayer ||
          target === edgesLayer ||
          target === annotationLayer;
      }

      function startPan(event) {
        if (event.button !== 0 || !isBlankCanvasTarget(event.target)) return;
        event.preventDefault();
        closeContextMenu();
        exitEdit();
        selectedEdgeId = null;
        isPanning = true;
        panState = {
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop
        };
        viewport.classList.add("is-panning");
      }

      function continuePan(event) {
        if (!isPanning || !panState) return;
        event.preventDefault();
        viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
        viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
      }

      function finishPan() {
        if (!isPanning) return;
        isPanning = false;
        panState = null;
        viewport.classList.remove("is-panning");
      }

      function nearestAnchor(node, point) {
        const anchors = ["top", "right", "bottom", "left"];
        let bestAnchor = "left";
        let bestDistance = Infinity;
        for (const anchor of anchors) {
          const anchorLocation = anchorPoint(node, anchor);
          const distance = Math.hypot(anchorLocation.x - point.x, anchorLocation.y - point.y);
          if (distance < bestDistance) {
            bestAnchor = anchor;
            bestDistance = distance;
          }
        }
        return bestAnchor;
      }

      function nodeFromPointer(event) {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const nodeEl = element?.closest?.(".node");
        if (!nodeEl) return null;
        return getNode(nodeEl.dataset.nodeId);
      }

      function startConnection(event, nodeId, anchor) {
        event.preventDefault();
        event.stopPropagation();
        const node = getNode(nodeId);
        if (!node) return;
        selectedId = nodeId;
        selectedEdgeId = null;
        const start = anchorPoint(node, anchor);
        connectionState = {
          sourceId: nodeId,
          sourceAnchor: anchor,
          start,
          current: { ...start }
        };
        hoverConnectTargetId = null;
        render();
      }

      function updateConnection(event) {
        if (!connectionState) return;
        connectionState.current = viewportPoint(event);
        const target = nodeFromPointer(event);
        hoverConnectTargetId = target && target.id !== connectionState.sourceId ? target.id : null;
        render();
      }

      function finishConnection(event) {
        if (!connectionState) return;
        const target = nodeFromPointer(event);
        if (target && target.id !== connectionState.sourceId) {
          pushUndoSnapshot();
          const targetAnchor = nearestAnchor(target, viewportPoint(event));
          manualEdges.push({
            id: uuid(),
            source: connectionState.sourceId,
            target: target.id,
            source_anchor: connectionState.sourceAnchor,
            target_anchor: targetAnchor,
            type: "manual"
          });
          selectedEdgeId = manualEdges[manualEdges.length - 1].id;
          selectedId = null;
          scheduleSave();
        }
        connectionState = null;
        hoverConnectTargetId = null;
        render();
      }

      function deleteEdge(edgeId) {
        const edge = buildEdges().find((item) => item.id === edgeId);
        if (!edge) return;

        pushUndoSnapshot();
        if (edge.type === "manual") {
          manualEdges = manualEdges.filter((item) => item.id !== edgeId);
        } else {
          const target = getNode(edge.target);
          if (target) {
            target.parent_id = null;
            target.level = 0;
          }
          rebuildChildren();
        }
        selectedEdgeId = null;
        render();
        scheduleSave();
      }

      function deleteNode(nodeId) {
        if (!getNode(nodeId)) return;
        pushUndoSnapshot();
        nodes = nodes.filter((node) => node.id !== nodeId);
        nodes.forEach((node) => {
          if (node.parent_id === nodeId) {
            node.parent_id = null;
            node.level = 0;
          }
        });
        manualEdges = manualEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
        annotations = annotations.filter((annotation) => annotation.node_id !== nodeId);
        rebuildChildren();
        currentParentId = validParentId(currentParentId);
        selectedId = currentLayerNodes()[0]?.id || null;
        selectedEdgeId = null;
        editingId = null;
        render();
        scheduleSave();
      }

      function deleteSelection() {
        if (selectedEdgeId) {
          deleteEdge(selectedEdgeId);
          return;
        }
        if (selectedId) {
          deleteNode(selectedId);
        }
      }

      function toggleHighlight() {
        const node = getNode(selectedId);
        if (!node) {
          showStatus("请先选择一个节点");
          return;
        }

        pushUndoSnapshot();
        const existing = annotations.find((annotation) => {
          return annotation.type === "highlight" && annotation.node_id === node.id;
        });
        if (existing) {
          annotations = annotations.filter((annotation) => annotation.id !== existing.id);
        } else {
          annotations.push({
            id: uuid(),
            type: "highlight",
            node_id: node.id,
            color: "#fff7cc"
          });
        }
        render();
        scheduleSave();
      }

      function setAnnotationMode(nextMode) {
        annotationMode = annotationMode === nextMode ? "none" : nextMode;
        redHighlighterButton.classList.toggle("active", annotationMode === "red");
        greenHighlighterButton.classList.toggle("active", annotationMode === "green");
        eraserButton.classList.toggle("active", annotationMode === "eraser");
        annotationLayer.classList.toggle("active", annotationMode !== "none");
        if (annotationMode !== "none") {
          selectedEdgeId = null;
          editingId = null;
          closeContextMenu();
          render();
        }
      }

      function strokeColorForMode(mode) {
        if (mode === "green") return "rgba(34, 197, 94, 0.34)";
        return "rgba(239, 68, 68, 0.36)";
      }

      function startAnnotation(event) {
        if (annotationMode === "none") return;
        event.preventDefault();
        event.stopPropagation();
        const point = viewportPoint(event);

        if (annotationMode === "eraser") {
          pushUndoSnapshot();
          eraserActive = true;
          eraseAnnotationsNear(point);
          return;
        }

        pushUndoSnapshot();
        activeStroke = {
          id: uuid(),
          type: "stroke",
          color: strokeColorForMode(annotationMode),
          width: brushSize,
          points: [point]
        };
        annotations.push(activeStroke);
        renderAnnotations();
      }

      function continueAnnotation(event) {
        if (annotationMode === "none") return;
        event.preventDefault();
        event.stopPropagation();
        const point = viewportPoint(event);

        if (annotationMode === "eraser" && eraserActive) {
          eraseAnnotationsNear(point);
          return;
        }

        if (!activeStroke) return;
        const last = activeStroke.points[activeStroke.points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
        activeStroke.points.push(point);
        renderAnnotations();
      }

      function finishAnnotation(event) {
        if (annotationMode === "none") return;
        event.preventDefault();
        event.stopPropagation();
        if (activeStroke && activeStroke.points.length < 2) {
          annotations = annotations.filter((annotation) => annotation.id !== activeStroke.id);
        }
        activeStroke = null;
        eraserActive = false;
        renderAnnotations();
        scheduleSave();
      }

      function distanceToSegment(point, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
        const projected = { x: a.x + t * dx, y: a.y + t * dy };
        return Math.hypot(point.x - projected.x, point.y - projected.y);
      }

      function strokeNearPoint(stroke, point) {
        const points = stroke.points || [];
        const threshold = Math.max(10, brushSize);
        for (let index = 1; index < points.length; index += 1) {
          if (distanceToSegment(point, points[index - 1], points[index]) <= threshold) {
            return true;
          }
        }
        return false;
      }

      function eraseAnnotationsNear(point) {
        const before = annotations.length;
        annotations = annotations.filter((annotation) => {
          return annotation.type !== "stroke" || !strokeNearPoint(annotation, point);
        });
        if (annotations.length !== before) {
          renderAnnotations();
          scheduleSave();
        }
      }

      function editableFromSelection() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
        const editable = container?.closest?.("[data-edit-field]");
        if (!editable || !nodesLayer.contains(editable)) return null;
        const nodeEl = editable.closest(".node");
        const node = nodeEl ? getNode(nodeEl.dataset.nodeId) : null;
        if (!node) return null;
        return { editable, node, field: editable.dataset.editField || "text" };
      }

      function syncEditableElement(node, editable, field) {
        const nextHtml = sanitizeHtml(editable.innerHTML);
        editable.innerHTML = nextHtml;
        if (node.compare_group_id && field === "compare_main") {
          node.compare_main_html = nextHtml;
        } else if (node.compare_group_id && field === "compare_sub") {
          node.compare_sub_html = nextHtml || "新主题";
        } else {
          node.text_html = nextHtml || "新主题";
        }
        node.text = nodeTextFromHtml(node);
        measureNodeText(node);
      }

      function applyTextHighlight(color) {
        const target = editableFromSelection();
        if (!target) {
          showStatus("请先选中 texteditor 里的文字");
          return;
        }
        pushUndoSnapshot({ syncText: false });
        selectedId = target.node.id;
        selectedEdgeId = null;
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const span = document.createElement("span");
        span.style.backgroundColor = color;
        span.setAttribute("data-highlight", "true");
        span.appendChild(range.extractContents());
        range.insertNode(span);
        selection.removeAllRanges();
        syncEditableElement(target.node, target.editable, target.field);
        render();
        scheduleSave();
      }

      function removeTextHighlight() {
        const target = editableFromSelection();
        if (!target) {
          showStatus("请先选中要擦除高亮的文字");
          return;
        }
        pushUndoSnapshot({ syncText: false });
        selectedId = target.node.id;
        selectedEdgeId = null;
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const highlighted = Array.from(target.editable.querySelectorAll('span[data-highlight="true"], span[style*="background"]'));
        highlighted.forEach((span) => {
          if (!range.intersectsNode(span)) return;
          const parent = span.parentNode;
          while (span.firstChild) {
            parent.insertBefore(span.firstChild, span);
          }
          parent.removeChild(span);
        });
        selection.removeAllRanges();
        syncEditableElement(target.node, target.editable, target.field);
        render();
        scheduleSave();
      }

      function applyCommentStyle() {
        const target = editableFromSelection();
        if (!target) {
          showStatus("请先选中 texteditor 里的文字");
          return;
        }
        pushUndoSnapshot({ syncText: false });
        selectedId = target.node.id;
        selectedEdgeId = null;
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontWeight = "700";
        span.style.textDecoration = "underline";
        span.setAttribute("data-comment", "true");
        span.appendChild(range.extractContents());
        range.insertNode(span);
        selection.removeAllRanges();
        syncEditableElement(target.node, target.editable, target.field);
        render();
        scheduleSave();
      }

      function startDrag(event, nodeId) {
        if (event.button !== 0) return;
        if (editingId === nodeId) return;
        const node = getNode(nodeId);
        if (!node) return;
        event.preventDefault();
        event.stopPropagation();
        if (editingId) {
          syncEditingText();
          editingId = null;
          editingField = "text";
          scheduleSave();
        }
        selectedId = nodeId;
        selectedEdgeId = null;
        const start = viewportPoint(event);
        const groupNodes = nodeGroup(node);
        dragState = {
          nodeId,
          pointerId: event.pointerId,
          startX: start.x,
          startY: start.y,
          started: false,
          reparentTargetId: null,
          reparentTargetStartedAt: null,
          nodePositions: groupNodes.map((item) => ({
            id: item.id,
            x: item.x,
            y: item.y
          }))
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      function draggedPrimaryNode() {
        const node = getNode(dragState?.nodeId);
        return node ? primaryDraggedNode(node) : null;
      }

      function reparentTargetForDrag() {
        const source = draggedPrimaryNode();
        if (!source) return null;
        const draggedIds = new Set(dragState.nodePositions.map((position) => position.id));
        return currentLayerNodes()
          .filter((node) => !draggedIds.has(node.id))
          .filter((node) => primaryCompareNode(node).id === node.id)
          .find((node) => overlapRatio(source, node) > RE_PARENT_OVERLAP_RATIO) || null;
      }

      function updateReparentTarget() {
        const target = reparentTargetForDrag();
        const now = Date.now();
        if (!target) {
          dragState.reparentTargetId = null;
          dragState.reparentTargetStartedAt = null;
          hoverConnectTargetId = null;
          return;
        }
        if (dragState.reparentTargetId !== target.id) {
          dragState.reparentTargetId = target.id;
          dragState.reparentTargetStartedAt = now;
        }
        hoverConnectTargetId = target.id;
      }

      document.addEventListener("pointermove", (event) => {
        if (isPanning) {
          continuePan(event);
          return;
        }
        if (annotationMode !== "none" && (activeStroke || eraserActive)) {
          continueAnnotation(event);
          return;
        }
        if (connectionState) {
          updateConnection(event);
          return;
        }
        if (!dragState) return;
        const current = viewportPoint(event);
        const dx = current.x - dragState.startX;
        const dy = current.y - dragState.startY;
        if (!dragState.started && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!dragState.started) {
          pushUndoSnapshot();
          isDragging = true;
          dragState.started = true;
        }
        for (const position of dragState.nodePositions) {
          const node = getNode(position.id);
          if (!node) continue;
          node.x = position.x + dx;
          node.y = position.y + dy;
          node.manual = true;
        }
        syncCompareGroups();
        updateReparentTarget();
        for (const position of dragState.nodePositions) {
          const node = getNode(position.id);
          const el = document.querySelector(`[data-node-id="${position.id}"]`);
          if (node && el) {
            el.style.left = `${canvasX(node.x)}px`;
            el.style.top = `${canvasY(node.y)}px`;
            el.style.minHeight = `${node.height}px`;
          }
        }
        updateCanvasBounds();
        renderEdges();
      });

      function finishDrag() {
        if (!dragState) return;
        if (!dragState.started) {
          dragState = null;
          isDragging = false;
          return;
        }
        const target = getNode(dragState.reparentTargetId);
        const heldLongEnough = target &&
          dragState.reparentTargetStartedAt &&
          Date.now() - dragState.reparentTargetStartedAt >= RE_PARENT_HOLD_MS;
        const sourceNode = getNode(dragState.nodeId);
        const sourceGroup = sourceNode ? nodeGroup(sourceNode) : [];
        isDragging = false;
        dragState = null;
        suppressNextClick = true;
        hoverConnectTargetId = null;
        if (target && heldLongEnough && sourceGroup.length) {
          const primarySource = primaryCompareNode(sourceNode);
          setGroupParent(sourceGroup, target.id);
          currentParentId = target.id;
          selectedId = primarySource.id;
          selectedEdgeId = null;
          editingId = null;
          editingField = "text";
          render();
          scheduleSave();
          return;
        }
        render();
        scheduleSave();
      }

      document.addEventListener("pointerup", finishDrag);
      document.addEventListener("pointerup", finishPan);
      document.addEventListener("pointerup", finishConnection);
      document.addEventListener("pointerup", finishAnnotation);
      document.addEventListener("pointercancel", finishDrag);
      document.addEventListener("pointercancel", finishPan);
      document.addEventListener("pointercancel", finishAnnotation);
      document.addEventListener("pointercancel", () => {
        connectionState = null;
        hoverConnectTargetId = null;
        render();
      });

      viewport.addEventListener("click", (event) => {
        if (annotationMode !== "none") {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        closeContextMenu();
        if (event.target === viewport || event.target === nodesLayer || event.target === edgesLayer) {
          selectedEdgeId = null;
          exitEdit();
        }
      });

      viewport.addEventListener("pointerdown", (event) => {
        if (annotationMode !== "none") {
          startAnnotation(event);
        }
      }, true);

      viewport.addEventListener("pointerdown", (event) => {
        if (annotationMode === "none" && !connectionState) {
          startPan(event);
        }
      });

      viewport.addEventListener("dblclick", (event) => {
        if (!isBlankCanvasTarget(event.target)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        createSibling(null);
      });

      viewport.addEventListener("scroll", closeContextMenu);

      viewport.addEventListener("wheel", (event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const zoomFactor = Math.exp(-event.deltaY * 0.01);
          setCanvasScale(canvasScale * zoomFactor, event.clientX, event.clientY);
        }
      }, { passive: false });

      let pinchState = null;
      function touchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
      }

      function touchCenter(touches) {
        return {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2
        };
      }

      viewport.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 2 || annotationMode !== "none") return;
        event.preventDefault();
        pinchState = {
          distance: touchDistance(event.touches),
          scale: canvasScale
        };
      }, { passive: false });

      viewport.addEventListener("touchmove", (event) => {
        if (!pinchState || event.touches.length !== 2) return;
        event.preventDefault();
        const center = touchCenter(event.touches);
        const nextScale = pinchState.scale * (touchDistance(event.touches) / pinchState.distance);
        setCanvasScale(nextScale, center.x, center.y);
      }, { passive: false });

      viewport.addEventListener("touchend", () => {
        pinchState = null;
      });

      document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
          if (!editingId) {
            event.preventDefault();
            closeContextMenu();
            undoLastChange();
          }
          return;
        }

        closeContextMenu();
        if (annotationMode !== "none") {
          if (event.key === "Escape") {
            event.preventDefault();
            setAnnotationMode("none");
          }
          return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
          if (!editingId) {
            event.preventDefault();
            deleteSelection();
          }
          return;
        }

        const node = getNode(selectedId);

        if (event.key === "Tab") {
          event.preventDefault();
          if (!node) {
            showStatus("请先选择一个节点");
            return;
          }
          createChild(node);
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          createSibling(node);
          return;
        }

      });

      layerBackButton?.addEventListener("click", () => {
        goToParentLayer();
      });

      autoLayoutButton.addEventListener("click", () => {
        closeContextMenu();
        focusCurrentLayerStart();
      });

      uploadImageButton.addEventListener("click", () => {
        closeContextMenu();
        if (!getNode(selectedId)) {
          showStatus("请先选择一个节点");
          return;
        }
        imageUploadInput.click();
      });

      [redHighlighterButton, greenHighlighterButton, eraserButton, commentButton].forEach((button) => {
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
        });
      });

      redHighlighterButton.addEventListener("click", () => {
        closeContextMenu();
        applyTextHighlight(RED_TEXT_HIGHLIGHT);
      });

      greenHighlighterButton.addEventListener("click", () => {
        closeContextMenu();
        applyTextHighlight(GREEN_TEXT_HIGHLIGHT);
      });

      eraserButton.addEventListener("click", () => {
        closeContextMenu();
        removeTextHighlight();
      });

      commentButton.addEventListener("click", () => {
        closeContextMenu();
        applyCommentStyle();
      });

      compareButton.addEventListener("click", () => {
        closeContextMenu();
        createComparePair();
      });

      brushSizeInput.addEventListener("input", () => {
        brushSize = Number(brushSizeInput.value || 16);
      });

      imageUploadInput.addEventListener("change", async () => {
        await addImageFilesToSelected(imageUploadInput.files || []);
        imageUploadInput.value = "";
      });

      contextMenuAction.addEventListener("click", toggleContextCrown);
      contextMenuMoveUpAction?.addEventListener("click", moveContextNodeUpOneLevel);
      contextMenuDeleteAction?.addEventListener("click", deleteContextNode);
      contextMenuCollapseAction.addEventListener("click", toggleContextCollapse);

      document.addEventListener("click", (event) => {
        if (!contextMenu.contains(event.target)) {
          closeContextMenu();
        }
      });

      window.addEventListener("beforeunload", () => {
        if (saveTimer) saveNow();
      });

      function defaultAnalysisField(node) {
        return node?.compare_group_id ? "compare_sub" : "text";
      }

      function editorHtmlForField(node, field) {
        if (node.compare_group_id && field === "compare_sub") return node.compare_sub_html || "";
        if (node.compare_group_id && field === "compare_main") return node.compare_main_html || "";
        return node.text_html || textToHtml(node.text || "新主题");
      }

      function setEditorHtmlForField(node, field, html) {
        if (node.compare_group_id && field === "compare_sub") {
          node.compare_sub_html = html || "新主题";
        } else if (node.compare_group_id && field === "compare_main") {
          node.compare_main_html = html;
        } else {
          node.text_html = html || "新主题";
        }
        node.text = nodeTextFromHtml(node);
      }

      function getAiAnalysisTarget() {
        syncEditingText();
        const node = getNode(contextNodeId || selectedId);
        if (!node) return null;
        const field = defaultAnalysisField(node);
        return {
          nodeId: node.id,
          field,
          text: htmlToText(editorHtmlForField(node, field)),
          isCompareNode: Boolean(node.compare_group_id)
        };
      }

      function replaceEditorContent(nodeId, field, text) {
        const node = getNode(nodeId);
        if (!node) return false;
        syncEditingText();
        pushUndoSnapshot();
        editingId = null;
        editingField = "text";
        const nextField = node.compare_group_id ? "compare_sub" : field;
        const nextHtml = sanitizeHtml(textToHtml(text || "新主题"));
        setEditorHtmlForField(node, nextField, nextHtml);
        measureNodeText(node);
        selectedId = node.id;
        selectedEdgeId = null;
        closeContextMenu();
        render();
        scheduleSave();
        return true;
      }

      window.KnowledgeMapCanvas = {
        apiUrl,
        closeContextMenu,
        getAiAnalysisTarget,
        replaceEditorContent,
        showStatus
      };

      rebuildChildren();
      measureAllNodes();
      render();
      saveState.textContent = "已保存";
      saveState.className = "saved";
