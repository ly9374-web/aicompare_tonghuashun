(function () {
  const button = document.getElementById("context-menu-ai-action");
  const canvas = window.KnowledgeMapCanvas;

  if (!button || !canvas) return;

  const idleText = button.textContent || "ai分析";

  function setLoading(isLoading) {
    button.disabled = isLoading;
    button.textContent = isLoading ? "分析中..." : idleText;
  }

  async function analyzeCurrentEditor() {
    const target = canvas.getAiAnalysisTarget();
    if (!target || !target.text.trim()) {
      canvas.showStatus("当前 texteditor 没有可分析内容");
      canvas.closeContextMenu();
      return;
    }

    setLoading(true);
    canvas.showStatus("ai分析中...");
    canvas.closeContextMenu();

    try {
      const response = await fetch(`${canvas.apiUrl}/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: target.text })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "请求失败");
      }

      const resultText = String(payload.text || "").trim();
      if (!resultText) {
        throw new Error("返回内容为空");
      }

      if (!canvas.replaceEditorContent(target.nodeId, target.field, resultText)) {
        throw new Error("目标节点不存在");
      }
      canvas.showStatus("ai分析已替换当前内容");
    } catch (error) {
      canvas.showStatus(`ai分析失败：${error.message || error}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  button.addEventListener("click", analyzeCurrentEditor);
})();
