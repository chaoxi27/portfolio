/* =========================================================================
 * 在线试用（tryout.js）
 * -------------------------------------------------------------------------
 * 为「古籍书目智能匹配系统」项目提供在线试用入口。纯前端实现，无后端、
 * 不经过任何服务器，回放预跑好的真实结果。
 *
 * 「游戏玩家舆情智能分析 Agent」不再走本弹层，改为跳转在线完整工具
 * （见 data.js 的 liveUrl 与 main.js 的跳转按钮）。
 * ========================================================================= */

(function () {
  "use strict";

  /* ---------- 各项目试用数据 ---------- */
  const TRYOUT_DATA = {
    /* ===== A2 古籍 Agent（仅演示版，回放预跑结果，不暴露规则与代码细节） ===== */
    "ancient-books": {
      title: "古籍书目智能匹配系统",
      demo: {
        steps: ["输入书目", "预处理", "7 层规则扫描", "LLM 裁决", "输出结果"],
        // 以下案例来自《隋书·经籍志》《旧唐书·经籍志》人工校对正确匹配版
        cases: [
          {
            name: "异名匹配",
            sui: { title: "史记音义", author: "徐野民", volumes: "12" },
            candidates: [
              { title: "史记音义", author: "徐广", volumes: "13" },
              { title: "史记音义", author: "邹诞生", volumes: "3" },
              { title: "史记", author: "司马迁", volumes: "130" },
            ],
            matched: "《史记音义》— 徐广",
            detail: "徐野民即徐广（作者异名），卷数 12 → 13（增 1）",
          },
          {
            name: "精确匹配",
            sui: { title: "汉书", author: "班固", volumes: "115" },
            candidates: [
              { title: "汉书", author: "班固", volumes: "115" },
              { title: "汉书集解音义", author: "应劭", volumes: "24" },
              { title: "汉书音义", author: "韦昭", volumes: "7" },
            ],
            matched: "《汉书》— 班固",
            detail: "书名、作者、卷数完全一致，卷数 115 → 115（不变）",
          },
          {
            name: "无匹配",
            sui: { title: "汉书音", author: "刘显", volumes: "2" },
            candidates: [
              { title: "汉书音", author: "萧该", volumes: "12" },
              { title: "汉书音", author: "包恺", volumes: "12" },
              { title: "汉书音", author: "夏侯泳", volumes: "2" },
            ],
            matched: "无匹配",
            detail: "旧唐志中未见刘显对应书目，返回空",
          },
        ],
      },
    },
  };

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ---------- 状态 ---------- */
  let currentId = null;

  /* ---------- 弹层 DOM（首次打开时创建） ---------- */
  function ensureOverlay() {
    let overlay = document.getElementById("tryout-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "tryout-overlay";
    overlay.className = "tryout-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="tryout-modal" role="dialog" aria-modal="true">
        <div class="tryout-head">
          <div class="tryout-heading">
            <span class="tryout-title" id="tryout-title"></span>
            <span class="tryout-subtitle">纯前端演示 · 不经过任何服务器</span>
          </div>
          <button class="tryout-close" id="tryout-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="tryout-body" id="tryout-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    bindOverlayEvents(overlay);
    return overlay;
  }

  function bindOverlayEvents(overlay) {
    overlay.querySelector("#tryout-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  function open(id) {
    if (!TRYOUT_DATA[id]) return;
    currentId = id;
    const overlay = ensureOverlay();
    overlay.querySelector("#tryout-title").textContent =
      TRYOUT_DATA[id].title + " · 在线试用";
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    renderDemo();
  }

  function close() {
    const overlay = document.getElementById("tryout-overlay");
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  /* ============================================================
   * 演示版
   * ============================================================ */
  function renderDemo() {
    const d = TRYOUT_DATA[currentId].demo;
    const body = document.getElementById("tryout-body");
    body.innerHTML = `
      <p class="tryout-note">该项目正在投稿中，仅提供演示版本。</p>
      <p class="tryout-note">回放一次真实的运行过程与结果。数据为预先跑出的真实输出，非实时调用。</p>
      <div class="tryout-run-row">
        <button class="btn btn-primary" id="tryout-run" type="button">▶ 运行</button>
      </div>
      <div class="demo-steps" id="tryout-demo-steps">
        ${d.steps
          .map(
            (s, i) => `
          <div class="demo-step" data-step="${i}">
            <span class="demo-step-dot"></span>
            <span class="demo-step-name">${esc(s)}</span>
          </div>`
          )
          .join("")}
      </div>
      <div class="demo-result" id="tryout-demo-result" hidden></div>`;
    const runBtn = document.getElementById("tryout-run");
    if (runBtn) runBtn.addEventListener("click", runDemo);
  }

  function renderDemoResult() {
    const d = TRYOUT_DATA[currentId].demo;
    return renderAncientResult(d);
  }

  function renderAncientResult(d) {
    const cases = d.cases
      .map(
        (c) => `
        <div class="demo-ancient-case">
          <div class="demo-ancient-name">${esc(c.name)}</div>
          <div class="demo-ancient-row">
            <span class="demo-ancient-label">隋志</span>
            <span>《${esc(c.sui.title)}》— ${esc(c.sui.author)} — ${esc(c.sui.volumes)}卷</span>
          </div>
          <div class="demo-ancient-row">
            <span class="demo-ancient-label">候选</span>
            <span>${c.candidates
              .map((x) => `《${esc(x.title)}》— ${esc(x.author)}`)
              .join(" · ")}</span>
          </div>
          <div class="demo-ancient-row">
            <span class="demo-ancient-label">裁决</span>
            <strong>${esc(c.matched)}</strong>
          </div>
          <div class="demo-ancient-detail">${esc(c.detail)}</div>
        </div>`
      )
      .join("");
    return `<div class="demo-ancient-list">${cases}</div>`;
  }

  function runDemo() {
    const steps = Array.from(document.querySelectorAll("#tryout-demo-steps .demo-step"));
    const result = document.getElementById("tryout-demo-result");
    const runBtn = document.getElementById("tryout-run");
    if (!steps.length) return;

    steps.forEach((s) => s.classList.remove("done", "active"));
    result.hidden = true;
    result.innerHTML = "";
    runBtn.disabled = true;

    let idx = 0;
    const timer = setInterval(() => {
      if (idx > 0) steps[idx - 1].classList.add("done");
      if (idx < steps.length) {
        steps[idx].classList.add("active");
        idx++;
        return;
      }
      clearInterval(timer);
      steps.forEach((s) => {
        s.classList.add("done");
        s.classList.remove("active");
      });
      result.hidden = false;
      result.innerHTML = renderDemoResult();
      runBtn.disabled = false;
    }, 340);
  }

  /* ---------- 暴露接口 ---------- */
  window.TRYOUT = { open };
})();
