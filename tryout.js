/* =========================================================================
 * 在线试用（tryout.js）
 * -------------------------------------------------------------------------
 * 为「游戏玩家舆情智能分析 Agent」「古籍书目智能匹配系统」两个项目提供
 * 在线试用入口。纯前端实现，无后端、不经过任何服务器：
 *   - 演示版：回放预跑好的真实结果，零成本零风险。
 *   - 自助体验：面试官自填 API Key，浏览器直连模型厂商，Key 仅存本机浏览器。
 * 数据全部来自真实预跑结果，见各字段注释。
 * ========================================================================= */

(function () {
  "use strict";

  /* ---------- 模型供应商（与 Python 端一致） ---------- */
  const PROVIDERS = {
    deepseek: {
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1/chat/completions",
      model: "deepseek-chat",
    },
    qwen: {
      label: "通义千问",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      model: "qwen-plus",
    },
    doubao: {
      label: "豆包",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      model: "doubao-pro-32k",
    },
  };

  /* ---------- 舆情 Agent：LLM 精判系统提示词（与 demo/llm_sentiment.py 一致） ---------- */
  const SENTIMENT_SYSTEM_PROMPT = `你是一个二游社区舆情分析专家。你会收到一组聚类后的讨论信号，每个信号包含话题实体、总帖子数（total_count）和最多20条样本标题。样本是优先把含敏感词/负面词的标题排在前面，最多20条。

请按照以下三个步骤对每个信号组进行判断。

---

## 第一步：逐条判断样本情绪

对每条样本标题标注情绪：正面 / 负面 / 中性。

判断标准：
- 正面：赞美、满意、期待、喜欢、安利
- 负面：吐槽、抱怨、愤怒、失望、指控、号召集体行动、退坑宣言
- 中性：客观描述、提问、资讯分享、标题党（夸张但非真不满）

---

## 第二步：反推整体比例

统计样本中「负面」标题的条数，记为 P。结合 total_count 反推整体负面信号的强度。

反推前提：样本已经优先挑出了最负面的标题。因此：
- 如果连刻意挑选的20条样本中负面都很少 → 整个聚类中真正的负面比例只会更低
- 不能将 P/20 的比例直接乘以 total_count 外推

反推对照：

| 样本负面 P | total_count | → 反推结论 |
|:--------:|:-----------:|---------|
| ≥ 10 | < 100 | 负面高度集中，舆情烈度强 |
| ≥ 10 | 100~1000 | 负面密集，需关注 |
| ≥ 10 | > 1000 | 下探空间大，负面真实规模可能可观，强烈关注 |
| 5~9 | < 100 | 小聚类中负面较集中 |
| 5~9 | ≥ 100 | 负面信号被高声量稀释，大致是零星不满 |
| ≤ 4 | 不限 | 刻意挑选才这几条，不具备负面信号强度 |

---

## 第三步：整体判断

综合前两步结果，给出以下输出：

| 字段 | 类型 | 说明 |
|------|------|------|
| sentiment | string | 正面/负面/中性/混合 |
| risk_level | string | 高风险/可能发酵/普通讨论 |
| is_genuine_issue | boolean | 是否为需要运营关注的舆情问题 |
| summary | string | 一句话摘要，30字以内 |
| reasoning | string | 判断依据，50字以内 |

### 风险等级判定

**高风险**：样本中同时满足 —
- 出现行动信号：号召集体行动（"举报""投诉""冲官方""12377"）、多人退坑宣言、对游戏内容的侮辱/低俗指控
- P ≥ 5

**可能发酵**：满足以下任一 —
- 有行动信号但 P=3~4（孤例不成规模）
- 无行动信号但 P ≥ 5 且 total_count < 100（小聚类中负面集中）
- 无行动信号但 P ≥ 10 且 total_count ≥ 100（负面密集，即使无组织也有发酵风险）

**普通讨论**：其余所有情况。包括 P ≤ 4、高声量稀释、正常游戏讨论。

### 是否为真实舆情问题

- true：risk_level 为高风险或可能发酵
- false：risk_level 为普通讨论

---

返回 JSON 对象，格式如下。
negative_samples 是你判定为真正负面/有风险的样本编号列表（从 1 开始），只列确实负面的，标题党不计入。

{"id": 1, "sentiment": "负面", "risk_level": "高风险", "is_genuine_issue": true,
 "negative_samples": [1, 3, 6],
 "summary": "...", "reasoning": "..."}`;

  /* ---------- 古籍 Agent：LLM 裁决提示词（与裸测模式 bare_test_judge.py 一致） ---------- */
  const ANCIENT_SYSTEM_PROMPT = `你是古籍目录学专家，负责判断《隋书·经籍志》与《旧唐书·经籍志》之间的书目对应关系。请严格按要求输出 JSON。`;

  function buildAncientUserPrompt(c) {
    const candText = c.candidates
      .map((x, i) => `${i + 1}. 《${x.title}》 - ${x.author} - ${x.volumes}卷`)
      .join("\n");

    return `请判断以下隋志记录与哪个旧唐志记录最匹配：

隋志记录：
《${c.sui.title}》 - ${c.sui.author} - ${c.sui.volumes}卷

候选旧唐志记录：
${candText}

注意：卷数在流传中出现变化较大，可能翻倍增减，不可据此肯定或否决匹配。
两可之间无法确定时返回 matched_index 为 0，不要强行匹配。

请严格按照以下JSON格式输出，不要包含任何其他文字或解释：
{"matched_index": <整数>, "reason": "<简要说明>"}

- matched_index: 匹配的候选记录编号（从1开始），无法匹配时填0
- reason: 匹配或不匹配的简要理由
- 编号必须对应候选记录：数字1对应候选1，数字2对应候选2，以此类推

只输出上述JSON，不要包含其他内容。`;
  }

  /* ---------- 各项目试用数据 ---------- */
  const TRYOUT_DATA = {
    /* ===== A1 舆情 Agent ===== */
    "sentiment-agent": {
      title: "游戏玩家舆情智能分析 Agent",
      demo: {
        steps: ["数据加载", "清洗去重", "规则粗筛", "程序评分", "LLM 精判", "预警报告"],
        // 以下数据来自「原神 6.5 版本『月之六』首日舆情日报」真实预跑结果
        reportTitle: "原神 6.5 版本「月之六」首日舆情日报",
        reportSource: "数据来源：小红书 + B站 · 原始帖文 11,098 条",
        stats: [
          { label: "原始帖文", value: "11,098" },
          { label: "去重清洗后", value: "5,226" },
          { label: "有效反馈", value: "1,591" },
          { label: "高风险预警", value: "1" },
          { label: "可能发酵", value: "20" },
        ],
        risks: [
          { level: "高风险", cls: "red", title: "原神月之六无限材料BUG", platform: "小红书", reason: "无限材料恶性 BUG" },
          { level: "可能发酵", cls: "orange", title: "莉奈娅抽不抽？版本特供是巧思，还是精密消费陷阱", platform: "B站", reason: "质疑消费陷阱易引不满" },
          { level: "可能发酵", cls: "orange", title: "没人感觉原神真的抄了很多吗", platform: "小红书", reason: "抄袭指控可能引发争议" },
          { level: "可能发酵", cls: "orange", title: "这破任务做的让人窝火", platform: "小红书", reason: "任务设计不满怒气较高" },
          { level: "可能发酵", cls: "orange", title: "原神一点都不好玩", platform: "小红书", reason: "抱怨不好玩且同簇 2 条" },
        ],
        advice: [
          "紧急核查并修复「无限材料」恶性 BUG，评估影响范围并准备修复公告。",
          "关注莉奈娅强度争议的社区风向，若「消费陷阱」叙事蔓延，可通过官方角色教学侧面展示真实表现。",
          "评估新地图探索引导与难度曲线，考虑为任务与机关增加更清晰的提示。",
        ],
      },
      byok: {
        // 预置样本标题，来自「月之六」日报『节奏』聚类，情绪以负面为主
        sampleTitles: [
          "没人感觉原神真的抄了很多吗",
          "完全搞不懂有什么好吹的",
          "这还是原神吗？？？",
          "米哈游剧情真越来越无聊了，凉了吧。。",
          "我为什么不推荐任何人抽莉奈娅",
          "莉奈娅抽不抽？版本特供是巧思，还是精密消费陷阱",
        ],
      },
    },

    /* ===== A2 古籍 Agent ===== */
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
              { title: "史记音", author: "邹诞生", volumes: "3" },
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
              { title: "汉书音义", author: "萧该", volumes: "12" },
              { title: "汉书音", author: "包恺", volumes: "12" },
              { title: "汉书音", author: "夏侯泳", volumes: "2" },
            ],
            matched: "无匹配",
            detail: "旧唐志中未见刘显对应书目，返回空",
          },
        ],
      },
      byok: {
        // 预置案例，来自人工校对正确匹配版真实记录（候选含正确答案与干扰项）
        cases: [
          {
            label: "史记音义 · 徐野民（异名匹配）",
            sui: { title: "史记音义", author: "徐野民", volumes: "12" },
            candidates: [
              { title: "史记音义", author: "徐广", volumes: "13" },
              { title: "史记音", author: "邹诞生", volumes: "3" },
              { title: "史记", author: "司马迁", volumes: "130" },
              { title: "史记", author: "裴骃", volumes: "80" },
            ],
          },
          {
            label: "汉书 · 班固（精确匹配）",
            sui: { title: "汉书", author: "班固", volumes: "115" },
            candidates: [
              { title: "汉书", author: "班固", volumes: "115" },
              { title: "汉书集解音义", author: "应劭", volumes: "24" },
              { title: "汉书音义", author: "韦昭", volumes: "7" },
              { title: "汉书音训", author: "服虔", volumes: "1" },
            ],
          },
          {
            label: "史记音 · 邹诞生（书名相近）",
            sui: { title: "史记音", author: "邹诞生", volumes: "3" },
            candidates: [
              { title: "史记音义", author: "邹诞生", volumes: "3" },
              { title: "史记音义", author: "徐广", volumes: "13" },
              { title: "史记", author: "裴骃", volumes: "80" },
            ],
          },
          {
            label: "汉书音 · 刘显（无匹配）",
            sui: { title: "汉书音", author: "刘显", volumes: "2" },
            candidates: [
              { title: "汉书音义", author: "萧该", volumes: "12" },
              { title: "汉书音", author: "包恺", volumes: "12" },
              { title: "汉书音", author: "夏侯泳", volumes: "2" },
            ],
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

  function parseJson(text) {
    if (!text) return {};
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const first = t.match(/\{[\s\S]*\}/);
    if (first) t = first[0];
    try {
      return JSON.parse(t);
    } catch (e) {
      return {};
    }
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
        <div class="tryout-tabs">
          <button class="tryout-tab active" data-tab="demo" type="button">演示版</button>
          <button class="tryout-tab" data-tab="byok" type="button">自助体验</button>
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
    overlay.querySelectorAll(".tryout-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        overlay.querySelectorAll(".tryout-tab").forEach((t) =>
          t.classList.toggle("active", t === tab)
        );
        renderTab(tab.getAttribute("data-tab"));
      });
    });
  }

  function open(id) {
    if (!TRYOUT_DATA[id]) return;
    currentId = id;
    const overlay = ensureOverlay();
    overlay.querySelector("#tryout-title").textContent =
      TRYOUT_DATA[id].title + " · 在线试用";
    overlay.querySelectorAll(".tryout-tab").forEach((t) =>
      t.classList.toggle("active", t.getAttribute("data-tab") === "demo")
    );
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    renderTab("demo");
  }

  function close() {
    const overlay = document.getElementById("tryout-overlay");
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function renderTab(tab) {
    const body = document.getElementById("tryout-body");
    if (tab === "demo") body.innerHTML = renderDemo();
    else body.innerHTML = renderByok();
    bindTabEvents(tab);
  }

  /* ============================================================
   * 演示版
   * ============================================================ */
  function renderDemo() {
    const d = TRYOUT_DATA[currentId].demo;
    return `
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
  }

  function renderDemoResult() {
    const d = TRYOUT_DATA[currentId].demo;
    if (currentId === "sentiment-agent") return renderSentimentResult(d);
    return renderAncientResult(d);
  }

  function renderSentimentResult(d) {
    const stats = d.stats
      .map(
        (s) => `
        <div class="demo-stat">
          <div class="demo-stat-value">${esc(s.value)}</div>
          <div class="demo-stat-label">${esc(s.label)}</div>
        </div>`
      )
      .join("");
    const risks = d.risks
      .map(
        (r) => `
        <div class="demo-risk">
          <span class="risk-badge ${r.cls}">${esc(r.level)}</span>
          <div class="demo-risk-main">
            <div class="demo-risk-title">${esc(r.title)}</div>
            <div class="demo-risk-meta">${esc(r.platform)} · ${esc(r.reason)}</div>
          </div>
        </div>`
      )
      .join("");
    const advice = d.advice.map((a) => `<li>${esc(a)}</li>`).join("");

    return `
      <div class="demo-report-head">
        <div class="demo-report-title">${esc(d.reportTitle)}</div>
        <div class="demo-report-source">${esc(d.reportSource)}</div>
      </div>
      <div class="demo-stats">${stats}</div>
      <div class="demo-section-title">风险帖汇总</div>
      <div class="demo-risks">${risks}</div>
      <div class="demo-section-title">运营建议</div>
      <ol class="demo-advice">${advice}</ol>`;
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

  /* ============================================================
   * 自助体验（BYOK）
   * ============================================================ */
  function renderByok() {
    const providerOpts = Object.keys(PROVIDERS)
      .map(
        (k) => `<option value="${k}">${PROVIDERS[k].label}</option>`
      )
      .join("");

    const isSentiment = currentId === "sentiment-agent";

    return `
      <div class="tryout-note">
        面试官自填 API Key，浏览器直连模型厂商完成一次真实调用。Key 仅存于你本机浏览器
        （localStorage），关闭页面后仍保留、可手动清除，<strong>不经过本网站任何服务器</strong>。
      </div>

      <div class="byok-config">
        <div class="byok-field">
          <label>模型供应商</label>
          <select id="byok-provider">${providerOpts}</select>
        </div>
        <div class="byok-field">
          <label>API Key</label>
          <input id="byok-key" type="password" autocomplete="off" placeholder="sk-..." />
        </div>
        <div class="byok-field">
          <label>模型名称（可选）</label>
          <input id="byok-model" type="text" placeholder="留空使用默认模型" />
        </div>
      </div>

      ${
        isSentiment
          ? `
      <div class="byok-input">
        <div class="byok-field">
          <label>话题实体（可选）</label>
          <input id="byok-entity" type="text" placeholder="例如：莉奈娅强度" />
        </div>
        <div class="byok-field">
          <label>涉及帖子数（可选）</label>
          <input id="byok-count" type="number" min="1" placeholder="默认等于样本条数" />
        </div>
        <div class="byok-field">
          <label>样本标题（每行一条）</label>
          <textarea id="byok-titles" rows="7" placeholder="粘贴帖子标题，每行一条"></textarea>
          <button class="byok-link" id="byok-sample" type="button">填入示例</button>
        </div>
      </div>
      <div class="byok-run-row">
        <button class="btn btn-primary" id="byok-run" type="button">开始分析</button>
      </div>`
          : `
      <div class="byok-input">
        <div class="byok-field">
          <label>预置案例</label>
          <select id="byok-case">
            ${TRYOUT_DATA[currentId].byok.cases
              .map((c, i) => `<option value="${i}">${esc(c.label)}</option>`)
              .join("")}
          </select>
          <div class="byok-case-preview" id="byok-case-preview"></div>
        </div>
      </div>
      <div class="byok-run-row">
        <button class="btn btn-primary" id="byok-run" type="button">开始裁决</button>
      </div>`
      }

      <div class="byok-result" id="byok-result" hidden></div>`;
  }

  function bindTabEvents(tab) {
    if (tab === "demo") {
      const runBtn = document.getElementById("tryout-run");
      if (runBtn) runBtn.addEventListener("click", runDemo);
      return;
    }

    const providerSel = document.getElementById("byok-provider");
    const keyInput = document.getElementById("byok-key");
    const modelInput = document.getElementById("byok-model");

    // 回填上次保存的 key / 模型
    const saved = readKey();
    if (saved.provider) providerSel.value = saved.provider;
    if (saved.key) keyInput.value = saved.key;
    if (saved.model) modelInput.value = saved.model;
    if (keyInput.value) {
      const k = keyInput.value;
      keyInput.value = k; // 触发一次，保持
    }

    const isSentiment = currentId === "sentiment-agent";

    if (isSentiment) {
      document.getElementById("byok-sample").addEventListener("click", () => {
        document.getElementById("byok-titles").value =
          TRYOUT_DATA[currentId].byok.sampleTitles.join("\n");
      });
    } else {
      const caseSel = document.getElementById("byok-case");
      const preview = document.getElementById("byok-case-preview");
      const renderPreview = () => {
        const c = TRYOUT_DATA[currentId].byok.cases[Number(caseSel.value)];
        preview.innerHTML =
          `<div class="byok-preview-line">隋志：《${esc(c.sui.title)}》— ${esc(c.sui.author)} — ${esc(c.sui.volumes)}卷</div>` +
          `<div class="byok-preview-line">候选：${c.candidates
            .map((x, i) => `${i + 1}.《${esc(x.title)}》— ${esc(x.author)}（${esc(x.volumes)}卷）`)
            .join("；")}</div>`;
      };
      caseSel.addEventListener("change", renderPreview);
      renderPreview();
    }

    document.getElementById("byok-run").addEventListener("click", () => runByok());
  }

  /* ---------- key 存取 ---------- */
  function readKey() {
    try {
      return JSON.parse(localStorage.getItem("tryout_api") || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveKey(provider, key, model) {
    try {
      localStorage.setItem("tryout_api", JSON.stringify({ provider, key, model }));
    } catch (e) {
      /* 忽略写入失败 */
    }
  }

  /* ---------- 调用 LLM ---------- */
  async function callLLM(provider, apiKey, model, systemPrompt, userPrompt) {
    const p = PROVIDERS[provider];
    let resp;
    try {
      resp = await fetch(p.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: model || p.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });
    } catch (e) {
      throw new Error(
        "网络请求失败，可能是该供应商不允许浏览器直连（CORS 跨域限制）。建议换用 DeepSeek，或改用「演示版」查看效果。"
      );
    }

    if (!resp.ok) {
      let detail = "";
      try {
        const j = await resp.json();
        detail = j.error?.message || j.message || "";
      } catch (e) {
        /* 忽略 */
      }
      const hint =
        resp.status === 401
          ? "API Key 无效"
          : resp.status === 429
          ? "触发频率限制"
          : "请求失败";
      throw new Error(`${hint}（HTTP ${resp.status}）${detail ? "：" + detail : ""}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  }

  function runByok() {
    const provider = document.getElementById("byok-provider").value;
    const apiKey = document.getElementById("byok-key").value.trim();
    const model = document.getElementById("byok-model").value.trim();
    const resultEl = document.getElementById("byok-result");
    const runBtn = document.getElementById("byok-run");

    if (!apiKey) {
      resultEl.hidden = false;
      resultEl.innerHTML = `<div class="byok-error">请先填写 API Key。</div>`;
      return;
    }

    saveKey(provider, apiKey, model);

    let systemPrompt, userPrompt;
    if (currentId === "sentiment-agent") {
      const entity = document.getElementById("byok-entity").value.trim() || "自定义话题";
      const titles = document
        .getElementById("byok-titles")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const countRaw = document.getElementById("byok-count").value.trim();
      const count = countRaw ? Number(countRaw) : titles.length;

      if (!titles.length) {
        resultEl.hidden = false;
        resultEl.innerHTML = `<div class="byok-error">请至少输入一条样本标题。</div>`;
        return;
      }

      systemPrompt = SENTIMENT_SYSTEM_PROMPT;
      userPrompt =
        `以下是今日社区中发现的讨论聚类信号，请逐一评估：\n\n` +
        `--- 信号组 1 ---\n` +
        `实体/话题: ${entity}\n` +
        `关联帖子数: ${count}\n` +
        `样本标题:\n` +
        titles.map((t, i) => `  [${i + 1}] ${t}`).join("\n") +
        `\n\n请返回 JSON 对象，格式如下：\n` +
        `{"id": 1, "sentiment": "负面", "risk_level": "高风险", "is_genuine_issue": true, "negative_samples": [1, 3], "summary": "...", "reasoning": "..."}`;
    } else {
      const caseIdx = Number(document.getElementById("byok-case").value);
      const c = TRYOUT_DATA[currentId].byok.cases[caseIdx];
      systemPrompt = ANCIENT_SYSTEM_PROMPT;
      userPrompt = buildAncientUserPrompt(c);
    }

    runBtn.disabled = true;
    resultEl.hidden = false;
    resultEl.innerHTML = `<div class="byok-loading">正在调用 ${PROVIDERS[provider].label}，请稍候…</div>`;

    callLLM(provider, apiKey, model, systemPrompt, userPrompt)
      .then((text) => {
        if (currentId === "sentiment-agent") renderSentimentByokResult(resultEl, text);
        else renderAncientByokResult(resultEl, text);
      })
      .catch((err) => {
        resultEl.innerHTML = `<div class="byok-error">${esc(err.message)}</div>`;
      })
      .finally(() => {
        runBtn.disabled = false;
      });
  }

  function renderSentimentByokResult(el, text) {
    const j = parseJson(text);
    if (!j || !("risk_level" in j)) {
      el.innerHTML = `<div class="byok-error">未能解析模型返回，请重试。原始返回：<pre>${esc(
        text
      )}</pre></div>`;
      return;
    }
    const riskCls =
      j.risk_level === "高风险" ? "red" : j.risk_level === "可能发酵" ? "orange" : "blue";
    const neg = Array.isArray(j.negative_samples)
      ? j.negative_samples.map((n) => String(n)).join("、")
      : "—";
    el.innerHTML = `
      <div class="byok-result-card">
        <div class="byok-result-row"><span class="k">情绪判定</span><span class="v">${esc(
          j.sentiment || "—"
        )}</span></div>
        <div class="byok-result-row"><span class="k">风险等级</span><span class="v"><span class="risk-badge ${riskCls}">${esc(
          j.risk_level || "—"
        )}</span></span></div>
        <div class="byok-result-row"><span class="k">是否需关注</span><span class="v">${
          j.is_genuine_issue ? "是" : "否"
        }</span></div>
        <div class="byok-result-row"><span class="k">负面样本编号</span><span class="v">${esc(
          neg
        )}</span></div>
        <div class="byok-result-row"><span class="k">摘要</span><span class="v">${esc(
          j.summary || "—"
        )}</span></div>
        <div class="byok-result-row"><span class="k">判断依据</span><span class="v">${esc(
          j.reasoning || "—"
        )}</span></div>
      </div>`;
  }

  function renderAncientByokResult(el, text) {
    const caseIdx = Number(document.getElementById("byok-case").value);
    const c = TRYOUT_DATA[currentId].byok.cases[caseIdx];
    const j = parseJson(text);
    if (!j || !("matched_index" in j)) {
      el.innerHTML = `<div class="byok-error">未能解析模型返回，请重试。原始返回：<pre>${esc(
        text
      )}</pre></div>`;
      return;
    }
    const idx = Number(j.matched_index);
    let matchedText;
    if (idx >= 1 && idx <= c.candidates.length) {
      const m = c.candidates[idx - 1];
      matchedText = `候选 ${idx}：《${m.title}》— ${m.author}`;
    } else {
      matchedText = "无匹配";
    }
    el.innerHTML = `
      <div class="byok-result-card">
        <div class="byok-result-row"><span class="k">裁决结果</span><span class="v"><strong>${esc(
          matchedText
        )}</strong></span></div>
        <div class="byok-result-row"><span class="k">理由</span><span class="v">${esc(
          j.reason || "—"
        )}</span></div>
        <div class="byok-result-row"><span class="k">候选列表</span><span class="v">${c.candidates
          .map((x, i) => `${i + 1}.《${esc(x.title)}》— ${esc(x.author)}（${esc(x.volumes)}卷）`)
          .join("<br>")}</span></div>
      </div>`;
  }

  /* ---------- 暴露接口 ---------- */
  window.TRYOUT = { open };
})();
