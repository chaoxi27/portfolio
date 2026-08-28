/* =========================================================================
 * 作品集内容数据（data.js）
 * -------------------------------------------------------------------------
 * 内容与展示分离：改内容只改这个文件，改样式只改 style.css，改交互只改 main.js。
 * 维护约定：
 *   - 每个项目一个对象，字段固定；新增项目 = 复制一个对象、填字段，再放进 projects 数组。
 *   - 卡片字段：title / group / oneLiner / tags / keyData
 *   - 详情字段：problem / background / method / output / methodology / highlights
 *   - group 取值：ai（AI 工具类）/ product（产品分析类）/ community（社区分析类）
 * ========================================================================= */

const SITE_DATA = {
  /* ---------- 站点与个人信息 ---------- */
  site: {
    name: "赵芷欣",
    role: "游戏运营",
    gender: "女",
    age: "23",
    highestDegree: "硕士",
    tagline: "关注游戏产品体验与 AI 工具应用的交界地带",
    contact: {
      phone: "19865864981",
      email: "1048616715@qq.com"
    },
    // 部署后改为真实文件路径
    resumePdf: "assets/resume.pdf",
    portfolioPdf: "assets/portfolio.pdf"
  },

  /* ---------- 个人定位 ---------- */
  positioning:
    "持续游玩原神、崩坏：星穹铁道等二次元游戏。产品分析上，能拆解活动和玩法的设计结构、推断设计意图，再沿不同玩家群体的体验路径定位风险节点；社区分析上，能从玩家反馈中归纳争议的驱动因素，对照产品策略与社区数据，判断运营的边界与可操作空间。有独立用 AI 辅助工作的能力，已做出玩家舆情、古籍匹配两个 agent，走通从数据采集到结构化输出的全流程。",

  /* ---------- 能力分组 ---------- */
  groups: [
    {
      key: "ai",
      label: "AI 工具类",
      desc: "从问题定义到规则/模型分工、技术选型、产品化落地，走通 AI 辅助工作的全流程"
    },
    {
      key: "product",
      label: "产品分析类",
      desc: "活动、玩法、商业化拆解，沿设计结构、意图、玩家分化、风险节点、运营影响展开"
    },
    {
      key: "community",
      label: "社区分析类",
      desc: "从社区反馈归纳争议驱动因素，对照产品策略与数据，判断运营边界与可操作空间"
    }
  ],

  /* ---------- 项目 ---------- */
  projects: [
    /* ===== AI 工具类 ===== */
    {
      id: "sentiment-agent",
      group: "ai",
      title: "游戏玩家舆情智能分析 Agent",
      subtitle: "小红书 / B站 双平台",
      tags: ["AI 工具开发", "规则 + 模型混合", "风险分级", "知识库维护"],
    },

    {
      id: "ancient-books",
      group: "ai",
      title: "古籍书目智能匹配系统",
      subtitle: "《隋书·经籍志》 ×《旧唐书·经籍志》",
      tags: ["规则分层 + LLM 判决", "技术选型", "成本控制", "产品化"],
    },

    /* ===== 产品分析类 ===== */
    {
      id: "month-eight",
      group: "product",
      title: "原神月之八版本大活动拆解",
      subtitle: "映夏！归乡？千灵节！",
      tags: ["活动拆解", "设计意图推断", "玩家分化", "风险节点"],
    },

    {
      id: "currency-war",
      group: "product",
      title: "货币战争玩法分析报告",
      subtitle: "崩坏：星穹铁道 3.7–4.3 常驻玩法",
      tags: ["玩法分析", "数据交叉验证", "方案设计"],
    },

    {
      id: "infinity-nikki",
      group: "product",
      title: "无限暖暖 2.8 版本阶梯礼包拆解",
      subtitle: "「一路尽璀璨」阶梯礼盒",
      tags: ["商业化拆解", "定价逻辑", "玩家分层"],
    },

    {
      id: "creation-path",
      group: "product",
      title: "创作路径对比——千星奇域与 TapTap 制造",
      subtitle: "图形编辑器 × AI 游戏生成",
      tags: ["平台生态分析", "结构性差异拆解", "AI 应用"],
    },

    /* ===== 社区分析类 ===== */
    {
      id: "amphoreus",
      group: "community",
      title: "翁法罗斯终章剧情分析",
      subtitle: "崩坏：星穹铁道 3.7 版本",
      tags: ["社区舆论复盘", "运营边界判断"],
    },

    {
      id: "otome-community",
      group: "community",
      title: "女主党与代入党之争",
      subtitle: "国乙社区 · 运营视角",
      tags: ["社区生态分析", "策略对比", "方法论迁移"],
    }
  ],

  /* ---------- 游戏经历 ---------- */
  gameExperience: [
    {
      category: "二次元游戏",
      items: [
        { name: "崩坏·星穹铁道", detail: "1120 天" },
        { name: "崩坏3", detail: "572 天" },
        { name: "绝区零", detail: "249 天" },
        { name: "明日方舟" },
        { name: "重返未来：1999" },
        { name: "忘却前夜" }
      ]
    },
    {
      category: "女性向游戏",
      items: [
        { name: "如鸢", detail: "600 天" },
        { name: "未定事件簿", detail: "364 天" },
        { name: "暖暖系列" }
      ]
    },
    {
      category: "独立游戏",
      items: [
        { name: "星露谷", detail: "110h+" },
        { name: "杀戮尖塔", detail: "30h+" },
        { name: "Balatro 小丑牌", detail: "20h+" },
        { name: "极乐迪斯科", detail: "20h+" },
        { name: "火山的女儿" },
        { name: "露玛岛" },
        { name: "药剂工艺" }
      ]
    },
    {
      category: "开放世界",
      items: [
        { name: "原神", detail: "1580 天" },
        { name: "无限暖暖", detail: "320 天" },
        { name: "燕云十六声" }
      ]
    }
  ],

  /* ---------- 简历 ---------- */
  resume: {
    education: [
      {
        school: "华南师范大学",
        period: "2021.09–2025.06",
        major: "汉语言文学",
        degree: "本科"
      },
      {
        school: "上海师范大学",
        period: "2025.09–至今",
        major: "中国古代文学",
        degree: "硕士"
      }
    ],
    project: {
      title: "游戏社区舆情智能分析 Agent",
      points: [
        "搭建从爬虫采集 → 信号发现 → LLM 精判 → 结构化输出的全自动舆情管线，覆盖小红书 / B站双平台",
        "设计规则 + 模型混合架构：规则层做初筛与聚类，LLM 层做语义精判与风险定级",
        "通过黑话知识库 + 语境注解机制解决模型在游戏垂直领域的理解偏差问题",
        "内置快速发现模块，千级数据可在十分钟内生成完整舆情简报",
        "已在崩坏：星穹铁道 4.1/4.2 及原神「月之六」等多个版本中完成端到端验证"
      ]
    },
    works: [
      {
        category: "活动、玩法、产品拆解与分析",
        items: [
          "原神月之八大活动拆解：拆解完整活动流程，识别资金卡点、难度曲线落差、教学缺失等风险节点并给出优化方向",
          "崩铁货币战争玩法分析：基于热门攻略 TOP 29，诊断流派强度、练度标注、攻略架构等痛点并提出优化方案",
          "编辑器路径对比：以原神·千星奇域和 TapTap 制造为例，对比学习门槛、分发机制与 AI 应用的生态差异"
        ]
      },
      {
        category: "商业化分析",
        items: [
          "无限暖暖 2.8 版本阶梯礼包拆解：识别破冰、止购、品类切换三个设计节点与用户分层转化路径"
        ]
      },
      {
        category: "社区生态分析与复盘",
        items: [
          "国乙社区生态分析：对女主党和代入党的争论进行分析，提炼 4 款游戏 4,340 条帖文，分析运营边界",
          "崩铁 3.7 版本运营复盘：复盘社区舆论结构，提出分时引导、信息断点补全等可操作策略"
        ]
      }
    ],
    internship: {
      title: "得物 · 舆情公关",
      period: "2026.07–至今",
      points: [
        "参与电商舆情处置全流程，梳理客服与 PR 两条处理路径的职责分工与响应差异，输出典型舆情成因归纳",
        "使用 AI 质检工具辅助完成 1500+ 条舆情工单质检，核验模型判定与人工标注的偏差，标注误判样本",
        "跟进团队舆情定位率与处理时效的周度统计，独立产出数据通报，定位指标缺口并驱动流程复盘"
      ]
    }
  }
};

/* 浏览器与 Node 环境下均可用 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = SITE_DATA;
}
if (typeof window !== "undefined") {
  window.SITE_DATA = SITE_DATA;
}
