# AI 回答知识导图对比工具

这个项目使用 Python + Streamlit 构建，画布交互通过 `streamlit.components.v1.html` 嵌入原生 HTML/CSS/JavaScript 实现。

## 运行方式

```bash
pip install -r requirements.txt
streamlit run app.py
```

启动后访问：

```text
http://localhost:8501
```

## 项目目录

```text
.
├── app.py
├── requirements.txt
├── data/
│   └── maps.json
└── knowledge_map/
    ├── config.py
    ├── local_api.py
    ├── models.py
    ├── storage.py
    ├── frontend/
    │   ├── canvas.html
    │   ├── canvas.css
    │   └── canvas.js
    └── ui/
        ├── app_shell.py
        ├── canvas.py
        └── pages.py
```

## Streamlit 页面按钮和组件名称

位置：`knowledge_map/ui/pages.py`

| 页面 | 显示文本 | 代码组件/Key | 作用 |
|---|---|---|---|
| 首页 | 开始 | `st.button("开始")` | 创建新的知识导图并进入编辑页 |
| 首页 | 记录 | `st.button("记录")` | 进入历史记录页 |
| 历史页 | 返回 | `st.button("返回")` | 返回首页 |
| 历史页 | 标题输入框 | `st.text_input("标题", key=f"title-{map_id}")` | 修改 map 标题 |
| 历史页 | 重命名 | `st.button("重命名", key=f"rename-{map_id}")` | 保存新标题 |
| 历史页 | 进入编辑 | `st.button("进入编辑", key=f"open-{map_id}")` | 打开历史 map |
| 历史页 | 复制 | `st.button("复制", key=f"copy-{map_id}")` | 复制当前 map |
| 历史页 | 确认删除 | `st.checkbox("确认删除", key=f"confirm-delete-{map_id}")` | 删除前确认 |
| 历史页 | 删除 | `st.button("删除", key=f"delete-{map_id}")` | 删除历史 map |
| 编辑页 | 返回首页 | `st.button("返回首页")` | 找不到 map 时返回首页 |
| 编辑页 | 返回 | `st.button("返回")` | 返回首页 |

## 首页和编辑页 CSS 类名

位置：`knowledge_map/ui/pages.py`

| 类名 | 作用 |
|---|---|
| `.hero-shell` | 首页主视觉容器 |
| `.hero-kicker` | 首页顶部小标签 |
| `.hero-title` | 首页产品标题 |
| `.hero-subtitle` | 首页副标题 |
| `.hero-actions` | 首页“开始/记录”按钮区域 |
| `.record-heading` | 历史记录页标题 |
| `.editor-header` | 编辑页上方信息栏 |
| `.editor-title` | 编辑页标题 |
| `.editor-subtitle` | 编辑页说明文字 |

## 嵌入式画布 DOM ID

位置：`knowledge_map/frontend/canvas.html`

| ID | 类型 | JS 变量名 | 作用 |
|---|---|---|---|
| `app-shell` | `div` | 无 | 整个嵌入式画布外壳 |
| `map-title` | `strong` | `titleEl` | 显示当前 map 标题 |
| `node-count` | `span` | `nodeCountEl` | 显示节点数量 |
| `save-state` | `div` | `saveState` | 显示保存状态：未保存/保存中/已保存/失败 |
| `viewport` | `div` | `viewport` | 可滚动画布视口 |
| `canvas-world` | `div` | `canvasWorld` | 实际无限画布容器 |
| `canvas-content` | `div` | `canvasContent` | 随缩放一起变换的画布内容层 |
| `edges-layer` | `svg` | `edgesLayer` | 节点连线层 |
| `nodes-layer` | `div` | `nodesLayer` | 节点 DOM 层 |
| `annotation-layer` | `svg` | `annotationLayer` | 荧光笔标注层 |
| `image-upload-input` | `input[type=file]` | `imageUploadInput` | 隐藏图片上传输入框 |
| `context-menu` | `div` | `contextMenu` | 右键菜单容器 |
| `context-menu-action` | `button` | `contextMenuAction` | 添加/移除王冠菜单项 |
| `context-menu-collapse-action` | `button` | `contextMenuCollapseAction` | 展示/不展示后续节点菜单项 |

## 右侧工具栏按钮 ID

位置：`knowledge_map/frontend/canvas.html`

| 按钮 ID | JS 变量名 | 显示文本 | 作用 |
|---|---|---|---|
| `upload-image-button` | `uploadImageButton` | 上传图片 | 给当前选中节点插入图片 |
| `red-highlighter-button` | `redHighlighterButton` | 红色高亮 | 给当前选中文字加红色荧光高亮 |
| `green-highlighter-button` | `greenHighlighterButton` | 绿色高亮 | 给当前选中文字加绿色荧光高亮 |
| `brush-size-input` | `brushSizeInput` | 隐藏输入 | 兼容旧脚本变量，不在界面显示 |
| `eraser-button` | `eraserButton` | 去除高亮 | 去除当前选中文字的荧光高亮 |
| `comment-button` | `commentButton` | 评语 | 给当前选中文字加粗并添加下划线 |
| `compare-button` | `compareButton` | 对比 | 将当前节点变成左右并列的对比节点 |
| `auto-layout-button` | `autoLayoutButton` | 自动整理 | 自动重新排版节点 |

## 画布静态 CSS 类名

位置：`knowledge_map/frontend/canvas.css`

| 类名 | 作用 |
|---|---|
| `.canvas-topbar` | 画布顶部栏 |
| `.title-group` | 标题和节点数量分组 |
| `.toolbar-hint` | 顶部快捷键提示 |
| `.side-toolbar` | 右侧毛玻璃工具栏 |
| `.tool-icon` | 工具按钮中的小标签 |
| `.red-tool` | 红色文字高亮工具图标 |
| `.green-tool` | 绿色文字高亮工具图标 |
| `.erase-tool` | 去除文字高亮工具图标 |
| `.comment-tool` | 评语工具图标 |
| `.compare-tool` | 对比工具图标 |
| `.edge-path` | 所有 SVG 连线基础样式 |
| `.auto-edge` | 自动父子连线 |
| `.manual-edge` | 手动连接线 |
| `.selected-edge` | 当前选中的连线 |
| `.temp-edge` | 拖拽连接点时的临时线 |
| `.annotation-stroke` | 荧光笔 SVG stroke 标注 |

## 动态生成的节点组件名称

位置：`knowledge_map/frontend/canvas.js`

| 名称 | 类型 | 说明 |
|---|---|---|
| `.node` | 动态 `div` | texteditor 节点卡片 |
| `.compare-node` | 动态 class | 对比 texteditor 三段式节点 |
| `.level-0` | 动态 class | 中心节点/独立节点层级样式 |
| `.selected` | 动态 class | 当前选中节点样式 |
| `.editing` | 动态 class | 当前正在编辑文本的节点 |
| `.crowned` | 动态 class | 有王冠的节点 |
| `.highlighted` | 动态 class | 旧版节点高亮标注 |
| `.connect-target` | 动态 class | 拖线时可连接目标高亮 |
| `.node-crown` | 动态 `div` | 王冠 emoji 容器 |
| `.node-text` | 动态 `div` | 节点文本编辑区域，`contenteditable` |
| `.collapsed-badge` | 动态 `button` | 折叠后显示“已折叠 N 个节点”，点击展开 |
| `.compare-label` | 动态 `div` | 对比节点顶部固定标题：`chatgpt` / `AIME` |
| `.compare-main-editor` | 动态 `div` | 对比节点中部左对齐可编辑区域 |
| `.compare-sub-editor` | 动态 `div` | 对比节点下部左对齐可编辑区域 |
| `.node-images` | 动态 `div` | 节点图片容器 |
| `.node-image` | 动态 `img` | 节点内图片 |
| `.connection-point.top` | 动态 `button` | 节点顶部连接点 |
| `.connection-point.right` | 动态 `button` | 节点右侧连接点 |
| `.connection-point.bottom` | 动态 `button` | 节点底部连接点 |
| `.connection-point.left` | 动态 `button` | 节点左侧连接点 |
| `data-node-id` | 动态 dataset | 节点 DOM 对应的节点 id |
| `data-edge-id` | 动态 dataset | SVG edge 对应的 edge id |
| `data-anchor` | 动态 dataset | 连接点方向：`top/right/bottom/left` |
| `data-edit-field` | 动态 dataset | 当前编辑区域：`text/compare_main/compare_sub` |

## 前端核心状态变量

位置：`knowledge_map/frontend/canvas.js`

| 变量名 | 作用 |
|---|---|
| `nodes` | 当前 map 的节点数组 |
| `manualEdges` | 用户手动创建的 edge 数组 |
| `annotations` | 节点高亮和荧光笔标注数组 |
| `selectedId` | 当前选中的节点 id |
| `selectedEdgeId` | 当前选中的 edge id |
| `editingId` | 当前正在编辑文本的节点 id |
| `editingField` | 当前正在编辑的字段：`text/compare_main/compare_sub` |
| `saveTimer` | 自动保存 debounce 定时器 |
| `isDragging` | 是否正在拖拽节点 |
| `dragState` | 节点拖拽状态 |
| `isPanning` | 是否正在拖动画布 |
| `panState` | 画布拖拽平移状态 |
| `connectionState` | 从连接点拖线时的临时连接状态 |
| `hoverConnectTargetId` | 拖线时鼠标悬停的目标节点 id |
| `contextNodeId` | 右键菜单作用的节点 id |
| `canvasScale` | 当前画布缩放比例 |
| `undoStack` | `Ctrl+Z` 使用的操作快照栈 |
| `editSnapshotTaken` | 当前文本编辑是否已记录撤回快照 |

## 数据结构字段

位置：`knowledge_map/models.py`

### Node

| 字段 | 说明 |
|---|---|
| `id` | 节点唯一 id |
| `text` | 节点文本 |
| `text_html` | 普通节点富文本 HTML，保存文字荧光高亮 |
| `x` / `y` | 节点在画布上的位置 |
| `width` / `height` | 节点尺寸 |
| `parent_id` | 父节点 id；独立节点为 `null` |
| `children` | 子节点 id 列表 |
| `level` | 节点层级 |
| `manual` | 是否被用户手动拖拽过 |
| `images` | 节点图片数组 |
| `crown` | 是否显示王冠 |
| `collapsed` | 是否不展示直接子节点 |
| `compare_group_id` | 对比组 id；普通节点为 `null` |
| `compare_index` | 对比组内顺序，左侧通常为 `0`，右侧为 `1` |
| `compare_main_html` | 对比节点中部左对齐区域 HTML |
| `compare_sub_html` | 对比节点下部左对齐区域 HTML |

### Edge

| 字段 | 说明 |
|---|---|
| `id` | edge 唯一 id |
| `source` | 起点节点 id |
| `target` | 终点节点 id |
| `source_anchor` | 起点连接方向 |
| `target_anchor` | 终点连接方向 |
| `type` | `auto` 或 `manual` |

### Image

| 字段 | 说明 |
|---|---|
| `id` | 图片唯一 id |
| `data_url` | base64 图片数据 |
| `width` / `height` | 图片原始尺寸 |

### Annotation

| 字段 | 说明 |
|---|---|
| `id` | 标注唯一 id |
| `type` | `highlight` 或 `stroke` |
| `node_id` | 节点高亮对应的节点 id，仅 `highlight` 使用 |
| `color` | 标注颜色 |
| `width` | 笔刷宽度，仅 `stroke` 使用 |
| `points` | 画布坐标点数组，仅 `stroke` 使用 |

## Python 模块职责

| 文件 | 作用 |
|---|---|
| `app.py` | Streamlit 启动入口 |
| `knowledge_map/config.py` | 全局配置和路径 |
| `knowledge_map/models.py` | 数据结构创建、归一化、自动 edge 生成 |
| `knowledge_map/storage.py` | JSON 读写、自动恢复、创建/更新/复制/删除 map |
| `knowledge_map/local_api.py` | 前端自动保存使用的本地 HTTP API |
| `knowledge_map/ui/app_shell.py` | Streamlit 页面分发 |
| `knowledge_map/ui/pages.py` | 首页、历史页、编辑页 |
| `knowledge_map/ui/canvas.py` | 读取并注入前端 HTML/CSS/JS |
| `knowledge_map/frontend/canvas.html` | 画布 DOM 模板 |
| `knowledge_map/frontend/canvas.css` | 画布视觉样式 |
| `knowledge_map/frontend/canvas.js` | 画布交互逻辑 |
