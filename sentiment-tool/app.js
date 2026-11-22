// 网页版舆情分析小工具 — 纯规则版，不调任何 API。
// 流程：数据加载 → 清洗 → 找信号 → 评分 → 预警定级 → 报告。
// 词库在 data/lexicon.js（window.LEXICON，含 starrail / genshin 两套）。
// 逻辑对齐 agent/demo/signal_detector.py + scoring.py。
(function () {
  "use strict";

  // ============ 词库状态（随主题/游戏切换） ============
  let L = null;                 // 当前游戏的词库对象
  let STOPWORDS = new Set();    // 停用词（含游戏实体）
  let COMMON_WORDS = new Set(); // 通用中文词黑名单
  let NORMAL_TOPICS = new Set();// 正常游戏讨论主题
  let GRAMMAR_WORDS = new Set();// 语法虚词
  let SLANG_LOOKUP = {};        // 昵称/实体名 → 规范实体
  let KNOWN_TERMS = [];         // 已知实体+昵称（保序，用于信源A2取第一个匹配）
  let KNOWN_TERMS_SET = new Set();
  let STRONG_EMOTION = new Set();
  let GAME_FULL_NAMES = [];     // 目标游戏全名（长度>=2），n-gram 词含它则不进信源B

  function setGame(game) {
    L = (window.LEXICON && window.LEXICON[game]) || null;
    if (!L) {
      L = window.LEXICON ? (window.LEXICON.starrail || window.LEXICON.genshin) : null;
      if (!L) return false;
    }
    STOPWORDS = new Set(L.stopwords || []);
    COMMON_WORDS = new Set(L.commonWords || []);
    NORMAL_TOPICS = new Set(L.normalGameTopics || []);
    GRAMMAR_WORDS = new Set(L.grammarWords || []);
    SLANG_LOOKUP = {};
    KNOWN_TERMS = [];
    KNOWN_TERMS_SET = new Set();
    for (const [entity, info] of Object.entries(L.slang || {})) {
      if (STOPWORDS.has(entity)) continue;
      KNOWN_TERMS.push(entity);
      KNOWN_TERMS_SET.add(entity);
      SLANG_LOOKUP[entity] = entity;
      for (const nick of info.nicknames || []) {
        if (nick.length >= 2 && !STOPWORDS.has(nick)) {
          KNOWN_TERMS.push(nick);
          KNOWN_TERMS_SET.add(nick);
        }
        if (nick.length >= 2) SLANG_LOOKUP[nick] = entity;
      }
    }
    STRONG_EMOTION = new Set([
      ...(L.sensitive || []), ...(L.negative || []),
      "骂", "喷", "冲", "炎上", "举报", "退钱", "退款", "卸载",
      "弃坑", "退游", "恶心", "失望", "愤怒", "恶心人",
      "店大欺客", "区别对待", "不公平", "凭什么"
    ]);
    GAME_FULL_NAMES = (L.targetKeywords || []).filter(
      k => k.length >= 2 && /[一-鿿]/.test(k)
    );
    return true;
  }

  // ============ 工具 ============

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{24FF}\u{1F100}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu;

  // ============ CSV 解析 ============

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = "";
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (c !== '\r') {
        field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function normalizePlatform(p) {
    if (!p) return "B站";
    if (p.includes("小红书") || p === "xhs" || p === "XHS") return "小红书";
    if (p.includes("B站") || p.includes("b站") || p === "bili" || p === "bilibili") return "B站";
    return "B站";
  }

  // 通用表头解析：认「标题/正文/平台」（中文优先，兼容 title/desc/body/platform）
  function rowsToRecords(rows) {
    if (rows.length < 2) return [];
    const header = rows[0].map(h => String(h == null ? "" : h).trim());
    const idx = (names) => {
      for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
      return -1;
    };
    const tCol = idx(["标题", "title"]);
    if (tCol < 0) return [];
    const bCol = idx(["正文", "body", "desc", "视频介绍"]);
    const pCol = idx(["平台", "platform", "source"]);
    const records = [];
    for (let r = 1; r < rows.length; r++) {
      const title = String((rows[r][tCol] == null ? "" : rows[r][tCol])).trim();
      if (!title) continue;
      const body = bCol >= 0 ? String(rows[r][bCol] == null ? "" : rows[r][bCol]).trim() : "";
      const platform = pCol >= 0 ? normalizePlatform(String(rows[r][pCol] == null ? "" : rows[r][pCol]).trim()) : "B站";
      records.push({ title, body, platform });
    }
    return records;
  }

  // 上传 CSV（三字段：标题/正文/平台）
  function csvToRecords(text) {
    const rows = parseCSV(text.replace(/^﻿/, ""));
    return rowsToRecords(rows);
  }

  // 上传 xlsx（三字段，依赖 SheetJS：window.XLSX）
  function xlsxToRecords(arrayBuffer) {
    if (typeof XLSX === "undefined") throw new Error("未加载 xlsx 解析库，请用 CSV 格式。");
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    return rowsToRecords(rows);
  }

  // ============ 去重（按标题） ============

  function dedup(records) {
    const seen = new Set();
    const out = [];
    for (const r of records) {
      if (seen.has(r.title)) continue;
      seen.add(r.title);
      out.push(r);
    }
    return out;
  }

  // ============ 清洗（7 层规则，对齐 preprocessor.py） ============

  function clean(records) {
    const cleaned = [], excluded = [];
    for (const rec of records) {
      const title = rec.title;
      let reason = null;

      if (rec.platform === "B站" && title.replace(/\s/g, "").length < 5) {
        reason = "字数不足";
      } else if (/^[\d\s.,+\-]+$/.test(title)) {
        reason = "纯数字/符号";
      } else if (title.replace(EMOJI_RE, "").trim().length === 0) {
        reason = "纯表情";
      } else if (!/[a-zA-Z一-鿿぀-ゟ゠-ヿ가-힯]/.test(title)) {
        reason = "纯符号";
      } else if (title.replace(/https?:\/\/\S+|www\.\S+/g, "").trim().length < 2) {
        reason = "纯URL";
      } else if ((L.competitors.some(c => title.includes(c)) ||
                  L.nonTargetMarkers.some(m => title.includes(m))) &&
                 !L.targetKeywords.some(tk => title.includes(tk))) {
        reason = "竞品游戏";
      } else if (L.adPatterns.some(a => title.includes(a))) {
        reason = "广告/引流";
      }

      if (reason) excluded.push({ ...rec, reason });
      else cleaned.push(rec);
    }
    return { cleaned, excluded };
  }

  // ============ 分词（信源B 用，对齐 signal_detector 的 n-gram 做法） ============

  function extractChineseRuns(title) {
    const runs = [];
    let buf = [];
    for (const ch of title) {
      const cp = ch.codePointAt(0);
      const isCJK = (cp >= 0x4E00 && cp <= 0x9FFF) || ch === "·";
      if (isCJK) buf.push(ch);
      else { if (buf.length >= 2) runs.push(buf.join("")); buf = []; }
    }
    if (buf.length >= 2) runs.push(buf.join(""));
    return runs;
  }

  function hasGrammarJunk(w) {
    if (GRAMMAR_WORDS.has(w)) return true;
    return /[的了着过地得在]/.test(w);
  }

  // 按游戏全名把 run 切开，避免 n-gram 跨游戏名产生"原神新""神新"这类碎片
  function splitByGameNames(run) {
    if (!GAME_FULL_NAMES.length) return [run];
    const names = GAME_FULL_NAMES.slice().sort((a, b) => b.length - a.length);
    return run.split(new RegExp(names.join("|"), "g")).filter(p => p.length >= 2);
  }

  function segmentForSignal(title) {
    const words = new Set();
    const runs = extractChineseRuns(title);
    for (const run0 of runs) {
      for (const run of splitByGameNames(run0)) {
        const maxN = Math.min(run.length, 10);
        for (let n = 2; n <= maxN; n++) {
          for (let i = 0; i <= run.length - n; i++) {
            words.add(run.slice(i, i + n));
          }
        }
      }
    }
    const result = [];
    for (const w of words) {
      if (w.length < 2) continue;
      if (STOPWORDS.has(w)) continue;
      if (COMMON_WORDS.has(w)) continue;
      if (hasGrammarJunk(w)) continue;
      if (GAME_FULL_NAMES.some(g => w.includes(g))) continue;
      if (/^[\d.\-+\s]+$/.test(w)) continue;
      result.push(w);
    }
    return result;
  }

  // ============ 样本标题选取 ============

  function pickSampleTitles(records, indices, extraKeywords) {
    const kws = new Set(extraKeywords || []);
    const entries = indices.map(idx => {
      const title = records[idx].title;
      const platform = records[idx].platform || "B站";
      let score = 0;
      for (const w of STRONG_EMOTION) if (title.includes(w)) score++;
      for (const w of kws) if (title.includes(w)) score++;
      return { score, title, platform };
    });
    entries.sort((a, b) => b.score - a.score);
    return entries.slice(0, 20);
  }

  function platformsOf(indices, records) {
    const s = new Set();
    for (const i of indices) if (records[i]) s.add(records[i].platform);
    return [...s].sort();
  }

  // ============ 信源 A：敏感词 + 负面词共现（>=5 条） ============

  function detectSensitiveHits(records) {
    const signals = [];
    const sensitiveCandidates = {};
    const negativeCandidates = {};

    for (let i = 0; i < records.length; i++) {
      const title = records[i].title;

      for (const sw of L.sensitive) {
        if (title.includes(sw)) (sensitiveCandidates[sw] || (sensitiveCandidates[sw] = [])).push(i);
      }
      const hasNegative = L.negative.some(nw => title.includes(nw));
      if (hasNegative) {
        const matched = KNOWN_TERMS.filter(e => e.length >= 2 && title.includes(e))
          .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))[0];
        if (matched) {
          const entity = SLANG_LOOKUP[matched] || matched;
          (negativeCandidates[entity] || (negativeCandidates[entity] = [])).push(i);
        }
      }
    }

    const seenIndices = new Set();
    const pushSignal = (entity, indices, isSensitive, matchedSensitive) => {
      const unique = indices.filter(i => !seenIndices.has(i));
      if (unique.length < 5) return;
      for (const i of unique) seenIndices.add(i);
      const extraKws = [entity, ...((L.slang[entity] && L.slang[entity].nicknames) || [])].slice(0, 5);
      signals.push({
        entity,
        sourceChannel: isSensitive ? "敏感词命中" : "负面情绪+实体共现",
        count: unique.length,
        postIndices: unique,
        platforms: platformsOf(unique, records),
        hasSensitive: isSensitive,
        matchedSensitive: isSensitive ? [entity] : [],
        sampleTitles: pickSampleTitles(records, unique, extraKws),
        priority: "high",
      });
    };

    // 敏感词信号优先
    Object.entries(sensitiveCandidates)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([kw, idxs]) => pushSignal(kw, idxs, true, [kw]));
    // 负面词+实体共现
    Object.entries(negativeCandidates)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([entity, idxs]) => pushSignal(entity, idxs, false, []));

    return signals;
  }

  // ============ 信源 B：高频未登录词（n-gram，>=5 条，Top10） ============

  function discoverNewTerms(records, minFreq) {
    minFreq = minFreq || 5;
    const wordCount = new Map();

    for (const rec of records) {
      const words = segmentForSignal(rec.title);
      for (const w of words) {
        wordCount.set(w, (wordCount.get(w) || 0) + 1);
      }
    }

    // 对齐 Python 端 word_counter.most_common(500)：先按词频降序取前 500，再过滤
    const topWords = [...wordCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 500);

    const candidates = [];
    for (const [word, count] of topWords) {
      if (count < minFreq) continue;
      if (STOPWORDS.has(word) || KNOWN_TERMS_SET.has(word)) continue;
      if (COMMON_WORDS.has(word)) continue;
      if (hasGrammarJunk(word)) continue;
      if (L.sensitive.includes(word) || L.negative.includes(word)) continue;
      if (NORMAL_TOPICS.has(word)) continue;
      candidates.push([word, count]);
    }

    const commonAndTopics = new Set([...COMMON_WORDS, ...NORMAL_TOPICS]);

    // 子串碎片剔除（4 重检查）
    const deduped = [];
    for (const [word, count] of candidates) {
      let isFragment = false;
      // 检查1：其他候选词的子串
      for (const [other, otherCount] of candidates) {
        if (other === word) continue;
        if (word.length < other.length && other.includes(word)) {
          const lenDiff = other.length - word.length;
          if (lenDiff >= 2) { isFragment = true; break; }
          else if ((wordCount.get(word) || 0) <= (wordCount.get(other) || 0) * 1.5) {
            isFragment = true; break;
          }
        }
      }
      // 检查2：已知黑话实体的子串
      if (!isFragment) {
        for (const known of KNOWN_TERMS) {
          if (word.length < known.length && known.includes(word)) { isFragment = true; break; }
        }
      }
      // 检查3：common/topics 中某词的子串
      if (!isFragment) {
        for (const c of commonAndTopics) {
          if (word.length < c.length && c.includes(word)) { isFragment = true; break; }
        }
      }
      // 检查4：word 包含 common/topics 中 >=3 字词且剩余 <=2 字
      if (!isFragment) {
        for (const c of commonAndTopics) {
          if (c.length >= 3 && c !== word && word.includes(c)) {
            const extra = word.replace(c, "");
            if (extra.length <= 2) { isFragment = true; break; }
          }
        }
      }
      if (!isFragment) deduped.push([word, count]);
    }

    // 实体解析：未登录词包含已知实体 → 归到实体名下
    const resolvedCounts = {};
    for (const [word, count] of deduped) {
      let entity = SLANG_LOOKUP[word] || null;
      if (!entity) {
        for (const known of KNOWN_TERMS) {
          if (known.length >= 2 && known !== word && word.includes(known)) {
            const extra = word.replace(known, "");
            if (extra.length <= 2 || (known.length >= 3 && word.startsWith(known))) {
              entity = SLANG_LOOKUP[known] || known; break;
            }
          }
        }
      }
      if (!entity) entity = word;
      resolvedCounts[entity] = (resolvedCounts[entity] || 0) + count;
    }
    const resolvedSorted = Object.entries(resolvedCounts).sort((a, b) => b[1] - a[1]);

    // Top 10 构建信号
    const signals = [];
    for (const [entity] of resolvedSorted.slice(0, 10)) {
      const allNames = new Set([entity]);
      const info = L.slang[entity];
      if (info) for (const nick of info.nicknames || []) if (nick.length >= 2) allNames.add(nick);

      const indices = [];
      for (let i = 0; i < records.length; i++) {
        const title = records[i].title;
        for (const name of allNames) {
          if (title.includes(name)) { indices.push(i); break; }
        }
      }
      signals.push({
        entity,
        sourceChannel: "高频未登录词",
        count: indices.length,
        postIndices: indices,
        platforms: platformsOf(indices, records),
        hasSensitive: false,
        matchedSensitive: [],
        sampleTitles: pickSampleTitles(records, indices, [entity]),
        priority: "medium",
      });
    }
    return signals;
  }

  // ============ 信源 C：黑话实体聚类（confirmed/candidate，>=10 条，Top10） ============

  function clusterSlangEntities(records, minFreq) {
    minFreq = minFreq || 10;
    const entityIndices = {};
    for (let i = 0; i < records.length; i++) {
      const title = records[i].title;
      for (const [entity, info] of Object.entries(L.slang)) {
        if (info.status !== "confirmed" && info.status !== "candidate") continue;
        if (STOPWORDS.has(entity)) continue;
        const allNames = [entity, ...(info.nicknames || [])].filter(n => n && !STOPWORDS.has(n));
        for (const name of allNames) {
          if (name.length >= 2 && title.includes(name)) {
            (entityIndices[entity] || (entityIndices[entity] = [])).push(i);
            break;
          }
        }
      }
    }
    const signals = [];
    for (const [entity, indices] of Object.entries(entityIndices).sort((a, b) => b[1].length - a[1].length)) {
      const count = indices.length;
      if (count < minFreq) continue;
      if (count > records.length * 0.5) continue;
      signals.push({
        entity,
        sourceChannel: "正常讨论（黑话实体）",
        count,
        postIndices: indices,
        platforms: platformsOf(indices, records),
        hasSensitive: false,
        matchedSensitive: [],
        sampleTitles: pickSampleTitles(records, indices, [entity]),
        priority: "low",
      });
    }
    return signals.slice(0, 10);
  }

  // ============ 合流（对齐 _merge_signals） ============

  function detectSignals(records) {
    const all = [];
    const seenEntities = new Set();

    for (const s of detectSensitiveHits(records)) {
      if (!seenEntities.has(s.entity)) {
        seenEntities.add(s.entity);
        all.push(s);
      }
    }
    for (const s of discoverNewTerms(records)) {
      if (!seenEntities.has(s.entity)) {
        seenEntities.add(s.entity);
        all.push(s);
      } else {
        for (const existing of all) {
          if (existing.entity === s.entity) {
            const merged = [...new Set([...existing.postIndices, ...s.postIndices])];
            existing.postIndices = merged;
            existing.count = merged.length;
            existing.sampleTitles = s.sampleTitles;
            existing.sourceChannel += " + 未登录词";
            break;
          }
        }
      }
    }
    for (const s of clusterSlangEntities(records)) {
      if (!seenEntities.has(s.entity)) {
        seenEntities.add(s.entity);
        all.push(s);
      }
    }

    for (const s of all) s.crossPlatform = s.platforms.length >= 2;
    all.sort((a, b) => b.count - a.count);
    return all;
  }

  // ============ 评分（4 维，对齐 scoring.py） ============

  function scoreSignals(signals, totalRecords) {
    const signalWords = [...L.actionWords, ...L.emotionWords, ...L.qualityWords];

    for (const s of signals) {
      const ratio = s.count / Math.max(totalRecords, 1);
      const cross = s.platforms.length >= 2 ? 8 : 3;
      const ratioScore = ratio > 0.05 ? 10 : ratio > 0.02 ? 7 : ratio > 0.01 ? 4 : 2;
      const s1 = cross * 0.5 + ratioScore * 0.5;

      const sample = s.sampleTitles.slice(0, 20);
      let signalHits = 0, lightHits = 0;
      for (const t of sample) {
        if (signalWords.some(w => t.title.includes(w))) signalHits++;
        else if (L.negativeLight.some(w => t.title.includes(w))) lightHits++;
      }
      const s2 = Math.min(2 + signalHits * 1.5 + lightHits * 0.5, 10);

      const hitCount = sample.filter(t => signalWords.some(w => t.title.includes(w))).length;
      const density = s.count > 0 ? hitCount / Math.min(20, s.count) : 0;
      const s3 = density > 0.4 ? 10 : density > 0.25 ? 8 : density > 0.15 ? 6 : density > 0.05 ? 4 : 2;

      const isConfirmed = L.slang[s.entity] && L.slang[s.entity].status === "confirmed";
      let s4 = 2;
      if (isConfirmed) s4 += 3;
      if (s.platforms.length >= 2) s4 += 3;
      if (s.count >= 100) s4 += 2; else if (s.count >= 30) s4 += 1;
      s4 = Math.min(s4, 10);

      s.score = +(s1 * 0.2 + s2 * 0.3 + s3 * 0.3 + s4 * 0.2).toFixed(1);
    }
    signals.sort((a, b) => b.score - a.score);
    return signals;
  }

  // ============ 主流程 ============

  function run(records) {
    records = dedup(records);
    const { cleaned, excluded } = clean(records);
    let signals = detectSignals(cleaned);
    signals = scoreSignals(signals, cleaned.length);
    return { records, cleaned, excluded, signals };
  }

  // ============ 渲染 ============

  function render(result, label) {
    const { records, cleaned, signals } = result;

    document.getElementById("data-label").textContent = label;
    document.getElementById("stat-raw").textContent = records.length;
    document.getElementById("stat-clean").textContent = cleaned.length;
    document.getElementById("stat-excluded").textContent = records.length - cleaned.length;
    document.getElementById("stat-signals").textContent = signals.length;

    const list = document.getElementById("signal-list");
    list.innerHTML = "";
    if (!signals.length) {
      list.innerHTML = '<p class="empty">未发现聚类信号。</p>';
      return;
    }
    for (const s of signals) {
      const card = document.createElement("div");
      card.className = "signal-card";
      const samples = s.sampleTitles.slice(0, 6).map((t) =>
        `<li><span class="plat-tag ${t.platform === "小红书" ? "xhs" : "bili"}">${esc(t.platform)}</span>${esc(t.title)}</li>`).join("");
      card.innerHTML = `
        <div class="signal-head">
          <span class="signal-entity">${esc(s.entity)}</span>
        </div>
        <div class="signal-meta">
          规模 ${s.count} 条 · 平台 ${s.platforms.join("/")} · 评分 ${s.score}
        </div>
        <ul class="signal-samples">${samples}</ul>`;
      list.appendChild(card);
    }
  }

  function showError(msg) {
    const list = document.getElementById("signal-list");
    list.innerHTML = `<p class="empty">${esc(msg)}</p>`;
  }

  // ============ 预置数据 ============

  // 各示例主题对应的 LLM 精判日报页（选中主题后在结果区挂入口）
  const DAILY_LINKS = {
    "原神至冬": "daily_原神至冬.html",
    "崩铁4.7": "daily_崩铁4.7.html",
    "崩铁4.1": "daily_崩铁4.1.html",
    "原神月之六": "daily_原神月之六.html",
  };

  function updateDailyLink(themeName) {
    const el = document.getElementById("daily-link");
    if (!el) return;
    const href = DAILY_LINKS[themeName];
    el.innerHTML = href
      ? `<span class="daily-link-label">本套数据的 LLM 精判日报：</span><a class="btn daily-btn" href="${href}" target="_blank">查看日报 →</a>`
      : "";
  }

  function loadSampleTheme(theme) {
    if (!setGame(theme.game)) { showError("词库未加载。"); return; }
    const records = [];
    for (const platform of ["小红书", "B站"]) {
      for (const r of (theme.data && theme.data[platform]) || []) {
        records.push({ title: r.title, body: r.body || "", platform });
      }
    }
    const hasXhs = theme.data && theme.data["小红书"] && theme.data["小红书"].length > 0;
    const label = `示例数据（${theme.name}${hasXhs ? "" : " · 仅B站"}）· ${records.length} 条`;
    render(run(records), label);
    updateDailyLink(theme.name);
  }

  // ============ 事件绑定 ============

  function bind() {
    // 预置数据主题按钮
    const themeBar = document.getElementById("theme-bar");
    if (themeBar && window.SAMPLE_DATA && window.SAMPLE_DATA.themes) {
      themeBar.innerHTML = "";
      window.SAMPLE_DATA.themes.forEach((theme) => {
        const btn = document.createElement("button");
        btn.className = "btn theme-btn";
        const hasXhs = theme.data && theme.data["小红书"] && theme.data["小红书"].length > 0;
        btn.textContent = theme.name + (hasXhs ? "" : "（仅B站）");
        btn.addEventListener("click", function () {
          themeBar.querySelectorAll(".theme-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          loadSampleTheme(theme);
        });
        themeBar.appendChild(btn);
      });
      const firstBtn = themeBar.querySelector(".theme-btn");
      if (firstBtn) { firstBtn.classList.add("active"); firstBtn.click(); }
    }

    // 上传（CSV / xlsx）：选文件先暂存，点「开始解析」再跑
    const uploadStatus = document.getElementById("upload-status");
    const parseBtn = document.getElementById("parse-btn");
    let pendingRecords = null;
    let pendingLabel = "";

    document.getElementById("file-input").addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const game = document.getElementById("game-select")
        ? document.getElementById("game-select").value : "starrail";
      if (!setGame(game)) { showError("词库未加载。"); return; }

      const handle = function (records) {
        if (!records.length) {
          showError("没解析出有效记录，请确认表格含「标题」列（可带「正文」「平台」列）。");
          pendingRecords = null;
          pendingLabel = "";
          uploadStatus.textContent = "未选择文件";
          parseBtn.disabled = true;
          return;
        }
        pendingRecords = records;
        pendingLabel = `${file.name} · ${records.length} 条`;
        uploadStatus.textContent = `已就绪：${records.length} 条`;
        parseBtn.disabled = false;
      };
      const reader = new FileReader();
      if (/\.xlsx?$/i.test(file.name)) {
        reader.onload = function () {
          try { handle(xlsxToRecords(reader.result)); }
          catch (err) { showError("解析失败：" + err.message); }
        };
        reader.readAsArrayBuffer(file);
      } else {
        reader.onload = function () {
          try { handle(csvToRecords(String(reader.result))); }
          catch (err) { showError("解析失败：" + err.message); }
        };
        reader.readAsText(file, "utf-8");
      }
    });

    parseBtn.addEventListener("click", function () {
      if (!pendingRecords) return;
      render(run(pendingRecords), pendingLabel);
      const dailyEl = document.getElementById("daily-link");
      if (dailyEl) dailyEl.textContent = "上传数据仅跑规则版，不调用 LLM 精判，不生成 LLM 日报。";
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", bind);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      clean, detectSignals, scoreSignals, csvToRecords,
      xlsxToRecords, parseCSV, run, setGame, dedup, segmentForSignal
    };
  }
})();
