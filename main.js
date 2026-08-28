/* =========================================================================
 * 作品集交互与渲染（main.js）
 * 从 data.js 的 SITE_DATA 读取内容，渲染到 index.html 的对应容器。
 * 改内容在 data.js，改展示逻辑在这里。
 * ========================================================================= */

(function () {
  "use strict";

  const D = window.SITE_DATA;
  const C = window.PROJECT_CONTENT;

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

  /* ---------- 关于我（含简历） ---------- */
  function renderAbout() {
    const S = D.site;
    const R = D.resume;

    const edu = R.education
      .map(
        (e) => `
        <div class="resume-item">
          <div class="resume-item-head">
            <span class="resume-item-title">${esc(e.school)}</span>
            <span class="resume-item-period">${esc(e.period)}</span>
          </div>
          <div class="resume-item-sub">${esc(e.major)} · ${esc(e.degree)}</div>
        </div>`
      )
      .join("");

    const projPoints = R.project.points
      .map((t) => `<li>${esc(t)}</li>`)
      .join("");
    const proj = `
      <div class="resume-item">
        <div class="resume-item-head">
          <span class="resume-item-title">${esc(R.project.title)}</span>
        </div>
        <ul class="resume-list">${projPoints}</ul>
      </div>`;

    const works = R.works
      .map((w) => {
        const items = w.items.map((t) => `<li>${esc(t)}</li>`).join("");
        return `
        <div class="resume-item">
          <div class="resume-item-head">
            <span class="resume-item-title">${esc(w.category)}</span>
          </div>
          <ul class="resume-list">${items}</ul>
        </div>`;
      })
      .join("");

    const internPoints = R.internship.points
      .map((t) => `<li>${esc(t)}</li>`)
      .join("");
    const intern = `
      <div class="resume-item">
        <div class="resume-item-head">
          <span class="resume-item-title">${esc(R.internship.title)}</span>
          <span class="resume-item-period">${esc(R.internship.period)}</span>
        </div>
        <ul class="resume-list">${internPoints}</ul>
      </div>`;

    el("about-content").innerHTML = `
      <div class="resume-header">
        <div class="resume-name">${esc(S.name)}<span class="resume-role">意向岗位：${esc(S.role)}</span></div>
        <div class="resume-line">电话：${esc(S.contact.phone)}　邮箱：${esc(S.contact.email)}</div>
        <div class="resume-line">性别：${esc(S.gender)}　年龄：${esc(S.age)}　最高学历：${esc(S.highestDegree)}</div>
      </div>
      <p class="resume-positioning">${esc(D.positioning)}</p>
      <div class="resume-section-title">教育经历</div>
      ${edu}
      <div class="resume-section-title">项目经历</div>
      ${proj}
      <div class="resume-section-title">个人作品</div>
      ${works}
      <div class="resume-section-title">实习经历</div>
      ${intern}`;
  }

  /* ---------- 分区 tab 切换 ---------- */
  function showSection(id) {
    document.querySelectorAll(".section").forEach((s) => {
      s.classList.toggle("active", s.id === id);
    });
    document.querySelectorAll(".tab-link").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + id);
    });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  function bindNav() {
    document.querySelectorAll(".tab-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showSection(a.getAttribute("href").slice(1));
      });
    });
    document.querySelectorAll(".group-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showSection("portfolio");
        const targetId = a.getAttribute("href").slice(1);
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
      });
    });
  }

  /* ---------- 作品集 ---------- */
  function buildProjectDetail(p) {
    const pc = C[p.id] || {};
    return `<div class="project-article">${pc.content || ""}</div>`;
  }

  function buildProjectCard(p) {
    const tags = (p.tags || [])
      .map((t) => `<span class="tag">${esc(t)}</span>`)
      .join("");

    const pc = C[p.id] || {};
    const overview = String(pc.overview || "")
      .split("\n")
      .filter((s) => s.trim())
      .map((s) => `<p>${esc(s)}</p>`)
      .join("");

    return `
      <article class="project-card" data-id="${esc(p.id)}">
        <div class="project-card-head">
          <div class="project-main">
            <h3 class="project-title">${esc(p.title)}</h3>
            <div class="project-subtitle">${esc(p.subtitle || "")}</div>
            <div class="project-meta">${tags}</div>
            <div class="project-overview">${overview}</div>
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

      html += `<div class="project-group" id="group-${esc(g.key)}">
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
    const floatCollapse = el("float-collapse");

    function syncFloat() {
      if (!floatCollapse) return;
      const anyOpen = document.querySelector(".project-card.open");
      floatCollapse.hidden = !anyOpen;
    }

    cards.forEach((card) => {
      const head = card.querySelector(".project-card-head");
      head.addEventListener("click", () => {
        card.classList.toggle("open");
        syncFloat();
      });
    });

    if (floatCollapse) {
      floatCollapse.addEventListener("click", () => {
        document
          .querySelectorAll(".project-card.open")
          .forEach((c) => c.classList.remove("open"));
        syncFloat();
      });
    }
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
    renderAbout();
    renderProjects();
    bindProjectToggle();
    renderFramework();
    renderGames();
    renderContact();
    bindNav();
    showSection("about");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
