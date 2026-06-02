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
      const autoLayoutButton = document.getElementById("auto-layout-button");
      const uploadImageButton = document.getElementById("upload-image-button");
      const imageUploadInput = document.getElementById("image-upload-input");
      const redHighlighterButton = document.getElementById("red-highlighter-button");
      const greenHighlighterButton = document.getElementById("green-highlighter-button");
      const brushSizeInput = document.getElementById("brush-size-input");
      const eraserButton = document.getElementById("eraser-button");
      const compareButton = document.getElementById("compare-button");
      const contextMenu = document.getElementById("context-menu");
      const contextMenuAction = document.getElementById("context-menu-action");

      const MIN_NODE_WIDTH = 120;
      const MAX_NODE_WIDTH = 360;
      const LEVEL_GAP = 190;
      const SIBLING_GAP = 30;
      const BRANCH_GAP = 56;
      const CANVAS_PADDING = 24;
      const CROWN_SPACE = 24;
      const MIN_SCALE = 0.35;
      const MAX_SCALE = 2.4;
      const COMPARE_GAP = 10;
      const MAX_UNDO_STEPS = 80;
      const RED_TEXT_HIGHLIGHT = "rgba(248, 113, 113, 0.42)";
      const GREEN_TEXT_HIGHLIGHT = "rgba(74, 222, 128, 0.42)";

      let nodes = normalizeNodes(mapData.nodes || []);
      let manualEdges = normalizeManualEdges(mapData.edges || [], nodes);
      let annotations = normalizeAnnotations(mapData.annotations || [], nodes);
      let selectedId = nodes[0]?.id || null;
      let selectedEdgeId = null;
      let editingId = null;
      let editingField = "text";
      let saveTimer = null;
      let isDragging = false;
      let dragState = null;
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

      function sanitizeHtml(html) {
        const source = document.createElement("div");
        source.innerHTML = String(html || "");
        const clean = document.createElement("div");

        function copyNode(input, outputParent) {
          if (input.nodeType === Node.TEXT_NODE) {
            outputParent.appendChild(document.createTextNode(input.textContent || ""));
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
            if (background) {
              const span = document.createElement("span");
              span.style.backgroundColor = background;
              span.setAttribute("data-highlight", "true");
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

      function getSiblings(node) {
        return nodes.filter((item) => item.parent_id === node.parent_id);
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
        selectedId = id;
        editingId = id;
        editingField = field;
        editSnapshotTaken = false;
        render();
        const textEl = document.querySelector(editableSelector(id, field));
        if (!textEl) return;
        textEl.contentEditable = "true";
        textEl.focus();
        const range = document.createRange();
        range.selectNodeContents(textEl);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
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
        layoutTree({ forceAll: false });
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

      function getRootNode() {
        const nodeIds = new Set(nodes.map((node) => node.id));
        return nodes.find((node) => !node.parent_id || !nodeIds.has(node.parent_id)) || nodes[0];
      }

      function childNodes(node) {
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
          return total + computeSubtreeHeight(child, cache) + (index === 0 ? 0 : BRANCH_GAP);
        }, 0);
        const height = Math.max(node.height, childHeight);
        cache.set(node.id, height);
        return height;
      }

      function assignSubtree(node, x, topY, cache, forceAll) {
        const subtreeHeight = cache.get(node.id) || node.height;
        if (forceAll || !node.manual) {
          node.x = x;
          node.y = topY + subtreeHeight / 2 - node.height / 2;
        }
        const anchorX = node.x;
        const anchorCenterY = node.y + node.height / 2;

        const children = childNodes(node);
        if (!children.length) return;

        const childBlockHeight = children.reduce((total, child, index) => {
          return total + (cache.get(child.id) || child.height) + (index === 0 ? 0 : BRANCH_GAP);
        }, 0);
        let childTop = anchorCenterY - childBlockHeight / 2;
        const childX = anchorX + MAX_NODE_WIDTH + LEVEL_GAP;

        for (const child of children) {
          const childHeight = cache.get(child.id) || child.height;
          assignSubtree(child, childX, childTop, cache, forceAll);
          childTop += childHeight + BRANCH_GAP;
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
        const ordered = [...nodes].sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        });
        const placed = [];

        for (const node of ordered) {
          if (forceAll || !node.manual) {
            let guard = 0;
            while (placed.some((item) => rectanglesOverlap(node, item)) && guard < 80) {
              node.y += node.height + SIBLING_GAP;
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
        assignSubtree(root, rootX, topY, cache, forceAll);
        avoidOverlaps(forceAll);
        syncCompareGroups();
      }

      function updateCanvasBounds() {
        syncCompareGroups();
        const maxX = Math.max(viewport.clientWidth, ...nodes.map((node) => node.x + node.width + CANVAS_PADDING));
        const maxY = Math.max(viewport.clientHeight, ...nodes.map((node) => node.y + node.height + CANVAS_PADDING));
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
      }

      function createChild(parent) {
        pushUndoSnapshot();
        exitEdit();
        const child = {
          id: uuid(),
          text: "新主题",
          x: parent.x + MAX_NODE_WIDTH + LEVEL_GAP,
          y: parent.y,
          width: 120,
          height: 42,
          parent_id: parent.id,
          children: [],
          level: parent.level + 1,
          manual: false,
          images: [],
          crown: false,
          compare_group_id: null,
          compare_index: null,
          text_html: "新主题",
          compare_main_html: "",
          compare_sub_html: ""
        };
        nodes.push(child);
        rebuildChildren();
        layoutTree({ forceAll: false });
        selectedId = child.id;
        render();
        scheduleSave();
        enterEdit(child.id);
      }

      function createSibling(node) {
        pushUndoSnapshot();
        exitEdit();
        if (!node.parent_id) {
          createChild(node);
          return;
        }

        const sibling = {
          id: uuid(),
          text: "新主题",
          x: node.x,
          y: node.y + Math.max(68, node.height + 24),
          width: 120,
          height: 42,
          parent_id: node.parent_id,
          children: [],
          level: node.level,
          manual: false,
          images: [],
          crown: false,
          compare_group_id: null,
          compare_index: null,
          text_html: "新主题",
          compare_main_html: "",
          compare_sub_html: ""
        };
        nodes.push(sibling);
        rebuildChildren();
        layoutTree({ forceAll: false });
        selectedId = sibling.id;
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
          x: Math.max(8, x),
          y: Math.max(8, y),
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
          text_html: "新主题",
          compare_main_html: "",
          compare_sub_html: ""
        };
        nodes.push(node);
        rebuildChildren();
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
          parent_id: null,
          children: [],
          level: node.level,
          manual: true,
          images: node.images.map((image) => ({ ...image, id: uuid() })),
          crown: false,
          compare_group_id: groupId,
          compare_index: 1,
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
        const autoEdges = nodes
          .filter((node) => node.parent_id && nodeIds.has(node.parent_id))
          .map((node) => ({
            id: `edge-${node.parent_id}-${node.id}`,
            source: node.parent_id,
            target: node.id,
            source_anchor: "right",
            target_anchor: "left",
            type: "auto"
          }));
        const validManualEdges = manualEdges.filter((edge) => {
          return nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target;
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
        layoutTree({ forceAll: false });
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
        layoutTree({ forceAll: false });
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
        return [
          `M ${sourcePoint.x} ${sourcePoint.y}`,
          `C ${sourcePoint.x + sourceControl.x} ${sourcePoint.y + sourceControl.y},`,
          `${targetPoint.x + targetControl.x} ${targetPoint.y + targetControl.y},`,
          `${targetPoint.x} ${targetPoint.y}`
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
        for (const edge of buildEdges()) {
          const pathData = edgePath(edge);
          if (!pathData) continue;

          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", pathData);
          path.setAttribute("class", `edge-path ${edge.type === "manual" ? "manual-edge" : "auto-edge"}${edge.id === selectedEdgeId ? " selected-edge" : ""}`);
          path.dataset.edgeId = edge.id;
          path.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            selectEdge(edge.id);
          });
          path.addEventListener("click", (event) => {
            event.stopPropagation();
            selectEdge(edge.id);
          });
          edgesLayer.appendChild(path);
        }

        if (connectionState) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", edgePathFromPoints(
            connectionState.start,
            connectionState.current,
            connectionState.sourceAnchor,
            "left"
          ));
          path.setAttribute("class", "edge-path temp-edge");
          edgesLayer.appendChild(path);
        }
      }

      function strokePath(points) {
        if (!points.length) return "";
        const [first, ...rest] = points;
        return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(" ");
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
        editable.addEventListener("dblclick", (event) => {
          event.stopPropagation();
          enterEdit(node.id, field);
        });
        return editable;
      }

      function renderNodes() {
        nodesLayer.innerHTML = "";
        nodeCountEl.textContent = `${nodes.length} 个节点`;
        for (const node of nodes) {
          const el = document.createElement("div");
          el.className = `node level-${node.level}${node.compare_group_id ? " compare-node" : ""}${node.id === selectedId ? " selected" : ""}${node.id === editingId ? " editing" : ""}${node.crown ? " crowned" : ""}${hasHighlight(node.id) ? " highlighted" : ""}${node.id === hoverConnectTargetId ? " connect-target" : ""}`;
          el.dataset.nodeId = node.id;
          el.style.left = `${node.x}px`;
          el.style.top = `${node.y}px`;
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

          if (node.id === selectedId && editingId !== node.id) {
            for (const anchor of ["top", "right", "bottom", "left"]) {
              const pointEl = document.createElement("button");
              pointEl.type = "button";
              pointEl.className = `connection-point ${anchor}`;
              pointEl.dataset.anchor = anchor;
              pointEl.setAttribute("aria-label", `${anchor} connection point`);
              pointEl.addEventListener("pointerdown", (event) => startConnection(event, node.id, anchor));
              el.appendChild(pointEl);
            }
          }

          el.addEventListener("pointerdown", (event) => startDrag(event, node.id));
          el.addEventListener("click", () => selectNode(node.id));
          el.addEventListener("dblclick", (event) => {
            event.stopPropagation();
            enterEdit(node.id, node.compare_group_id ? "compare_sub" : "text");
          });
          el.addEventListener("contextmenu", (event) => {
            openContextMenu(event, node.id);
          });
          nodesLayer.appendChild(el);
          measureNode(node, el);
        }
      }

      function render() {
        renderNodes();
        updateCanvasBounds();
        renderEdges();
        renderAnnotations();
      }

      function viewportPoint(event) {
        const rect = viewport.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left + viewport.scrollLeft) / canvasScale,
          y: (event.clientY - rect.top + viewport.scrollTop) / canvasScale
        };
      }

      function setCanvasScale(nextScale, clientX, clientY) {
        const rect = viewport.getBoundingClientRect();
        const oldScale = canvasScale;
        const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
        if (Math.abs(targetScale - oldScale) < 0.001) return;

        const focusX = (clientX - rect.left + viewport.scrollLeft) / oldScale;
        const focusY = (clientY - rect.top + viewport.scrollTop) / oldScale;
        canvasScale = targetScale;
        updateCanvasBounds();
        viewport.scrollLeft = focusX * canvasScale - (clientX - rect.left);
        viewport.scrollTop = focusY * canvasScale - (clientY - rect.top);
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
        selectedId = nodes[0]?.id || null;
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

      function startDrag(event, nodeId) {
        if (event.button !== 0) return;
        if (editingId === nodeId) return;
        if (event.target.closest?.("[data-edit-field]")) return;
        const node = getNode(nodeId);
        if (!node) return;
        pushUndoSnapshot();
        selectNode(nodeId);
        isDragging = true;
        const start = viewportPoint(event);
        const groupNodes = node.compare_group_id
          ? nodes.filter((item) => item.compare_group_id === node.compare_group_id)
          : [node];
        dragState = {
          nodeId,
          startX: start.x,
          startY: start.y,
          nodePositions: groupNodes.map((item) => ({
            id: item.id,
            x: item.x,
            y: item.y
          }))
        };
        event.currentTarget.setPointerCapture(event.pointerId);
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
        if (!isDragging || !dragState) return;
        const current = viewportPoint(event);
        const dx = current.x - dragState.startX;
        const dy = current.y - dragState.startY;
        for (const position of dragState.nodePositions) {
          const node = getNode(position.id);
          if (!node) continue;
          node.x = Math.max(8, position.x + dx);
          node.y = Math.max(8, position.y + dy);
          node.manual = true;
        }
        syncCompareGroups();
        for (const position of dragState.nodePositions) {
          const node = getNode(position.id);
          const el = document.querySelector(`[data-node-id="${position.id}"]`);
          if (node && el) {
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.style.minHeight = `${node.height}px`;
          }
        }
        updateCanvasBounds();
        renderEdges();
      });

      function finishDrag() {
        if (!isDragging) return;
        isDragging = false;
        dragState = null;
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
        const point = viewportPoint(event);
        createFreeNodeAt(point.x - 60, point.y - 21);
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
        if (!node) return;

        if (event.key === "Tab") {
          event.preventDefault();
          createChild(node);
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          createSibling(node);
          return;
        }

        if (event.key === " " && editingId) {
          event.preventDefault();
          exitEdit();
        }
      });

      autoLayoutButton.addEventListener("click", () => {
        pushUndoSnapshot();
        exitEdit();
        layoutTree({ forceAll: true });
        render();
        scheduleSave();
      });

      uploadImageButton.addEventListener("click", () => {
        closeContextMenu();
        if (!getNode(selectedId)) {
          showStatus("请先选择一个节点");
          return;
        }
        imageUploadInput.click();
      });

      [redHighlighterButton, greenHighlighterButton, eraserButton].forEach((button) => {
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

      document.addEventListener("click", (event) => {
        if (!contextMenu.contains(event.target)) {
          closeContextMenu();
        }
      });

      window.addEventListener("beforeunload", () => {
        if (saveTimer) saveNow();
      });

      rebuildChildren();
      measureAllNodes();
      render();
      saveState.textContent = "已保存";
      saveState.className = "saved";
