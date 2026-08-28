/* =========================================================================
 * 作品集交互与渲染（main.js）
 * 从 data.js 的 SITE_DATA 读取内容，渲染到 index.html 的对应容器。
 * 改内容在 data.js，改展示逻辑在这里。
 * ========================================================================= */

(function () {
  "use strict";

  const D = window.SITE_DATA;

  /* ---------- 工具 ---------- */
  function el(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ---------- Hero ---------- */
  function renderHero() {
    el("hero-name").textContent = D.site.name;
    el("hero-tagline").textContent = D.site.tagline;
  }

  /* ---------- 关于我 ---------- */
  function renderAbout() {
    el("about-positioning").textContent = D.positioning;
  }

  /* ---------- 作品集 ---------- */
  function buildProjectDetail(p) {
    const blocks = [
      ["解决什么问题", p.problem],
      ["项目背景", p.background],
      ["方法与过程", p.method],
      ["关键产出与数据", p.output],
      ["方法论沉淀", p.methodology]
    ];

    let html = blocks
      .map(
        ([label, text]) =>
          `<div class="detail-block">
            <div class="detail-label">${esc(label)}</div>
            <p class="detail-text">${esc(text)}</p>
          </div>`
      )
      .join("");

    const highlights = (p.highlights || [])
      .map((h) => `<li>${esc(h)}</li>`)
      .join("");
    if (highlights) {
      html += `<div class="detail-block">
        <div class="detail-label">核心亮点</div>
        <ul class="highlight-list">${highlights}</ul>
      </div>`;
    }

    return html;
  }

  function buildProjectCard(p) {
    const tags = (p.tags || [])
      .map((t) => `<span class="tag">${esc(t)}</span>`)
      .join("");

    return `
      <article class="project-card" data-id="${esc(p.id)}">
        <div class="project-card-head">
          <div class="project-main">
            <h3 class="project-title">${esc(p.title)}</h3>
            <div class="project-subtitle">${esc(p.subtitle || "")}</div>
            <p class="project-oneliner">${esc(p.oneLiner)}</p>
            <div class="project-meta">
              ${tags}
              <span class="key-data">${esc(p.keyData)}</span>
            </div>
          </div>
          <span class="project-toggle">＋</span>
        </div>
        <div class="project-detail">${buildProjectDetail(p)}</div>
      </article>`;
  }

  function renderProjects() {
    const container = el("project-groups");
    let html = "";

    D.groups.forEach((g) => {
      const projects = D.projects.filter((p) => p.group === g.key);
      if (!projects.length) return;

      html += `<div class="project-group">
        <div class="group-head">
          <div class="group-label">${esc(g.label)}</div>
          <div class="group-desc">${esc(g.desc)}</div>
        </div>
        ${projects.map(buildProjectCard).join("")}
      </div>`;
    });

    container.innerHTML = html;
  }

  /* 项目卡片展开 / 收起 */
  function bindProjectToggle() {
    const cards = document.querySelectorAll(".project-card");
    cards.forEach((card) => {
      const head = card.querySelector(".project-card-head");
      head.addEventListener("click", () => {
        card.classList.toggle("open");
      });
    });
  }

  /* ---------- 分析维度 ---------- */
  function renderFramework() {
    const container = el("framework-grid");
    container.innerHTML = D.analysisFramework
      .map(
        (f) => `
        <div class="framework-card">
          <div class="framework-title">${esc(f.title)}</div>
          <div class="framework-desc">${esc(f.desc)}</div>
        </div>`
      )
      .join("");
  }

  /* ---------- 游戏经历 ---------- */
  function renderGames() {
    const container = el("game-groups");
    container.innerHTML = D.gameExperience
      .map((g) => {
        const items = g.items
          .map(
            (it) =>
              `<span class="game-item">${esc(it.name)}<span class="detail">${esc(
                it.detail
              )}</span></span>`
          )
          .join("");
        return `<div class="game-group">
          <div class="game-category">${esc(g.category)}</div>
          <div class="game-list">${items}</div>
        </div>`;
      })
      .join("");
  }

  /* ---------- 简历 ---------- */
  function renderResume() {
    const R = D.resume;
    let html = "";

    // 教育经历
    const edu = R.education
      .map(
        (e) => `
        <div class="resume-block">
          <div class="resume-head">
            <span class="resume-title">${esc(e.school)}</span>
            <span class="resume-period">${esc(e.period)}</span>
          </div>
          <div class="resume-sub">${esc(e.major)} · ${esc(e.degree)}</div>
        </div>`
      )
      .join("");

    // 项目经历
    const projPoints = R.project.points
      .map((t) => `<li>${esc(t)}</li>`)
      .join("");
    const proj = `
      <div class="resume-block">
        <div class="resume-cat">项目经历</div>
        <div class="resume-head">
          <span class="resume-title">${esc(R.project.title)}</span>
        </div>
        <ul class="resume-list">${projPoints}</ul>
      </div>`;

    // 个人作品
    const works = R.works
      .map((w) => {
        const items = w.items.map((t) => `<li>${esc(t)}</li>`).join("");
        return `<div class="resume-cat">${esc(w.category)}</div>
          <ul class="resume-list">${items}</ul>`;
      })
      .join("");

    // 实习经历
    const internPoints = R.internship.points
      .map((t) => `<li>${esc(t)}</li>`)
      .join("");
    const intern = `
      <div class="resume-block">
        <div class="resume-cat">实习经历</div>
        <div class="resume-head">
          <span class="resume-title">${esc(R.internship.title)}</span>
          <span class="resume-period">${esc(R.internship.period)}</span>
        </div>
        <ul class="resume-list">${internPoints}</ul>
      </div>`;

    html = `
      <div class="resume-cat">教育经历</div>
      ${edu}
      ${proj}
      <div class="resume-cat">个人作品</div>
      ${works}
      ${intern}`;

    el("resume-content").innerHTML = html;
  }

  /* ---------- 联系与下载 ---------- */
  function renderContact() {
    const c = D.site.contact;
    el("contact-content").innerHTML = `
      <div class="contact-item">
        <div class="label">电话</div>
        <div class="value">${esc(c.phone)}</div>
      </div>
      <div class="contact-item">
        <div class="label">邮箱</div>
        <div class="value">${esc(c.email)}</div>
      </div>
      <div class="contact-item">
        <div class="label">简历 PDF</div>
        <div class="value"><a href="${esc(D.site.resumePdf)}" target="_blank">下载简历</a></div>
      </div>
      <div class="contact-item">
        <div class="label">作品集 PDF</div>
        <div class="value"><a href="${esc(D.site.portfolioPdf)}" target="_blank">下载作品集</a></div>
      </div>`;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    renderHero();
    renderAbout();
    renderProjects();
    bindProjectToggle();
    renderFramework();
    renderGames();
    renderResume();
    renderContact();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
