const config = window.SCOPEPROOF_CONFIG || {};
let supabase = null;
if (config.supabaseUrl && config.supabaseAnonKey) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

const params = new URLSearchParams(window.location.search);
const requestedForm = ["X", "A"].includes(params.get("form")) ? params.get("form") : null;
const requestedStimulus = ["P01", "S02", "C05", "D08"].includes(params.get("stimulus"))
  ? params.get("stimulus")
  : null;
const preview = params.get("preview") === "1" || requestedForm !== null;
const skipIntro = preview && params.get("skip_intro") === "1";
// 材料版本。任何改变被试所见内容的修订都必须同时提升 MATERIALS_VERSION、storageKey
// 和 CONSENT_VERSION，否则新旧数据在库里无法区分，且旧会话可能恢复后接触新材料。
// v5：D08 改为同一张公开图表上的当前网站运行主张；页面采用 Acme 白底编辑风。
// 这两项都会改变被试所见材料，因此不得与 v4 会话合并。
const MATERIALS_VERSION = "v5";
const CONSENT_VERSION = `scopeproof-xa-zh-${MATERIALS_VERSION}-huixiang`;
const storageKey = `scopeproof_xa_cloud_session_${MATERIALS_VERSION}`;

// scope content（R3 边界声明）是 2×2 中 C 条件的处理本身，不是中性界面修补：
// 它几乎直接回答 C05 这类 L1 historical origin 主张。
//
// 必须同时满足 preview 才生效。只看 ?scope=1 是不安全的：生产地址加一个参数就能把 C 处理
// 投给正式被试，而库里没有任何字段记录该被试看过 scope content，事后无法区分。
// 正式 2×2 必须由服务端随条件分配下发，并把条件写入 xa_probe_sessions；
// 在那之前，本开关只是预览工具，不得用于任何正式作答链接。
const scopeContentEnabled = preview && params.get("scope") === "1";
const verifierName = "本页的电脑检查工具";
const $ = (selector) => document.querySelector(selector);

const stimuli = {
  P01: {
    id: "P01",
    context: "一家设计工作室发布了一张海报。它还给出了海报上的文字、颜色、位置和电脑制作方法。",
    artifact: { label: "工作室公开的海报", asset: "./assets/poster-blue.svg", alt: "深蓝色的夏夜音乐会海报" },
    claim: "电脑只用这些材料，就能再做出一张完全一样的海报。",
    bundle: {
      type: "image", kind: "poster", published: "./assets/poster-blue.svg",
      input: { title: "夏夜音乐会", subtitle: "夏夜之声", date: "8 月 16 日 · 19:30", place: "河岸剧场", accent: "#3459e6", accent2: "#00a88f" },
      source: "发布者给出的文字、颜色和位置",
      generateLabel: "照着材料再做一张海报", generateDetail: "电脑照着这些材料做了一张新海报。",
      compareLabel: "比较两张海报", same: "两张海报完全一样", different: "两张海报不一样"
    }
  },
  S02: {
    id: "S02",
    context: "一家内容公司发布了一段短文。它还给出了短文要写的几个要点和电脑写作方法。",
    artifact: { label: "公司发布的短文", content: "调查认为，清楚的路标和纪念品商店最能改善参观体验，建议先改造入口和主展厅。" },
    claim: "电脑只用这些要点，就能再写出一段每个字都一样的短文。",
    bundle: {
      type: "text", kind: "summary", published: "调查认为，清楚的路标和纪念品商店最能改善参观体验，建议先改造入口和主展厅。",
      input: { finding: "调查认为，清楚的路标和安静休息区", effect: "最能改善参观体验", recommendation: "建议先改造入口和主展厅" },
      source: "发布者给出的几个要点",
      generateLabel: "照着要点再写一段短文", generateDetail: "电脑照着这些要点写了一段新短文。",
      compareLabel: "比较两段短文", same: "两段短文每个字都一样", different: "两段短文不一样"
    }
  },
  C05: {
    id: "C05",
    context: "一家图片平台发布了一张照片和一段说明。它还给出了照片里有什么，以及电脑写说明的方法。",
    artifact: { label: "平台公开的照片与说明", asset: "./assets/photo-cyclist.svg", alt: "路口的一名骑车人", content: "黄昏时，一名骑车人正在红灯旁等待，地点是城市路口。" },
    claim: "平台当初写这段说明时，用的就是现在给出的这些材料。",
    bundle: {
      type: "text", kind: "caption", published: "黄昏时，一名骑车人正在红灯旁等待，地点是城市路口。",
      input: { time: "黄昏时", subject: "一名骑车人", action: "红灯旁等待", setting: "城市路口" },
      source: "发布者给出的照片内容和写法",
      generateLabel: "照着材料再写一段说明", generateDetail: "电脑照着这些材料写了一段新说明。",
      compareLabel: "比较两段说明", same: "两段说明每个字都一样", different: "两段说明不一样"
    }
  },
  D08: {
    id: "D08",
    context: "一个数据团队的网站上有一张图表。团队还公开了图表里的数字和电脑画图的方法。",
    artifact: { label: "网站上的数据图表", asset: "./assets/chart-energy-altered.svg", alt: "四个季度能源使用量柱状图" },
    // uncovered × 现在时。现在时是刻意的时态反例（见 05_PAPER_FRAMEWORK/SCOPEPROOF_V6_REFRAME_ZH.md §1.1），
    // 用于阻断「问过去的事 ⇒ 不能证明」这一启发式，不得改成过去时。
    // v4 的「这个团队正在……画另一张图表」与刚才比较的公开图表不是同一对象，造成对象断裂。
    // v5 改为网站当前如何生成同一张公开图表。本次离线重做只检查材料能生成什么，
    // 没有观察网站当前的运行过程，因此 gold 仍为 cannot_determine；mismatch 格位保持不变。
    claim: "现在，这个网站正在用这些数字和方法，画出页面上的这张图表。",
    bundle: {
      type: "image", kind: "chart", published: "./assets/chart-energy-altered.svg",
      input: { title: "四个季度能源使用量", labels: ["第一季", "第二季", "第三季", "第四季"], values: [78, 62, 55, 43], accent: "#16856b" },
      source: "团队公开的数字和画图方法",
      generateLabel: "照着材料再画一张图表", generateDetail: "电脑照着这些材料画了一张新图表。",
      compareLabel: "比较两张图表", same: "两张图表完全一样", different: "两张图表不一样"
    }
  }
};

const staticReports = {
  P01: { generatedAt: "2026-08-08T10:01:14Z", reportId: "202608080001", replay: "./assets/replay-P01.svg", replayHash: "dad71f02dbd7f3e816ebfbe1e65fc388808f437b405817a26b3c17767e7b7596", publishedHash: "dad71f02dbd7f3e816ebfbe1e65fc388808f437b405817a26b3c17767e7b7596" },
  S02: { generatedAt: "2026-08-08T10:01:15Z", reportId: "202608080002", replay: "调查认为，清楚的路标和安静休息区最能改善参观体验，建议先改造入口和主展厅。", replayHash: "e5f74daed35be37bcef6ec7503217517ead48e585c3e0c4109f210914ded7775", publishedHash: "44fe4cbdf36beba9d9e1650fa7133fcbe4e9fad644b338d8ef8fdd244825b086" },
  C05: { generatedAt: "2026-08-08T10:01:16Z", reportId: "202608080003", replay: "黄昏时，一名骑车人正在红灯旁等待，地点是城市路口。", replayHash: "772fe2dfe5d12390a56b643c4436ac90363388fe6693f44f1c8c1d3cf3b763cd", publishedHash: "772fe2dfe5d12390a56b643c4436ac90363388fe6693f44f1c8c1d3cf3b763cd" },
  D08: { generatedAt: "2026-08-08T10:01:17Z", reportId: "202608080004", replay: "./assets/replay-D08.svg", replayHash: "13b2effdc2b92d7e93f7a9f42e3be4d6c5f3d9d034b84c38ad13c733d2193c5e", publishedHash: "ce6ea2e59f2e8372b040a4041fad1d5a2c04c780ed16f737c83882095bab6c1f" }
};

const state = {
  sessionId: null, token: null, platformUserId: null, evidenceForm: null, order: [], index: 0,
  openedAt: null, evidenceAt: null, confidenceTouched: false, detailsOpened: false,
  replayUrl: null
};

const encoder = new TextEncoder();

function randomToken(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
}

function renderPoster(input) {
  const title = escapeXml(input.title), subtitle = escapeXml(input.subtitle), date = escapeXml(input.date), place = escapeXml(input.place), accent = escapeXml(input.accent), accent2 = escapeXml(input.accent2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="820" viewBox="0 0 640 820">
<rect width="640" height="820" rx="28" fill="#101828"/>
<circle cx="522" cy="126" r="156" fill="${accent}" opacity=".9"/>
<circle cx="88" cy="738" r="192" fill="${accent2}" opacity=".82"/>
<path d="M0 500 C155 410 300 605 640 420 V820 H0Z" fill="#ffffff" opacity=".08"/>
<text x="54" y="82" fill="#dbe7ff" font-family="Arial,sans-serif" font-size="24" letter-spacing="5">${subtitle}</text>
<text x="54" y="330" fill="white" font-family="Arial,sans-serif" font-size="76" font-weight="700">${title}</text>
<line x1="56" y1="378" x2="442" y2="378" stroke="white" stroke-width="5"/>
<text x="58" y="450" fill="white" font-family="Arial,sans-serif" font-size="34">${date}</text>
<text x="58" y="502" fill="#dbe7ff" font-family="Arial,sans-serif" font-size="25">${place}</text>
<text x="58" y="755" fill="white" font-family="Arial,sans-serif" font-size="18">公开版本</text>
</svg>
`;
}

function formatSvgNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
}

function renderChart(input) {
  const width = 680, baseline = 380, chartHeight = 250, left = 86, gap = 20;
  const barWidth = Math.floor((width - left - 54 - gap * (input.values.length - 1)) / input.values.length);
  const bars = input.values.map((value, index) => {
    const x = left + index * (barWidth + gap), height = Math.round(chartHeight * value / 100), y = baseline - height, center = formatSvgNumber(x + barWidth / 2);
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="7" fill="${escapeXml(input.accent)}"/><text x="${center}" y="${y - 12}" text-anchor="middle" fill="#17211b" font-family="Arial,sans-serif" font-size="18">${value}</text><text x="${center}" y="${baseline + 32}" text-anchor="middle" fill="#627067" font-family="Arial,sans-serif" font-size="17">${escapeXml(input.labels[index])}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="470" viewBox="0 0 680 470">
<rect width="680" height="470" rx="24" fill="#fffef9"/>
<text x="42" y="55" fill="#17211b" font-family="Arial,sans-serif" font-size="28" font-weight="700">${escapeXml(input.title)}</text>
<line x1="70" y1="${baseline}" x2="640" y2="${baseline}" stroke="#9aa69e" stroke-width="2"/>
${bars}
<text x="638" y="445" text-anchor="end" fill="#7a877e" font-family="Arial,sans-serif" font-size="14">公开数据 · 固定方式绘制</text>
</svg>
`;
}

function renderOutput(bundle) {
  if (bundle.kind === "poster") return renderPoster(bundle.input);
  if (bundle.kind === "chart") return renderChart(bundle.input);
  if (bundle.kind === "summary") return `${bundle.input.finding}${bundle.input.effect}，${bundle.input.recommendation}。`;
  if (bundle.kind === "caption") return `${bundle.input.time}，${bundle.input.subject}正在${bundle.input.action}，地点是${bundle.input.setting}。`;
  throw new Error("暂时无法完成这项检查");
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function fetchBytes(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取公开产物");
  return new Uint8Array(await response.arrayBuffer());
}

function makeSteps(stimulus, matched) {
  return [
    { status: "pass", label: "第一步：打开材料", detail: `电脑打开了${stimulus.bundle.source}。` },
    { status: "pass", label: stimulus.bundle.generateLabel, detail: stimulus.bundle.generateDetail },
    { status: matched ? "pass" : "fail", label: stimulus.bundle.compareLabel, detail: `${matched ? stimulus.bundle.same : stimulus.bundle.different}。` }
  ];
}

function formatChineseTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(date);
}

async function evidenceSignature(stimulusId, matched, replayHash, publishedHash) {
  return sha256(encoder.encode(`scopeproof-xa-v61|${stimulusId}|${matched}|${replayHash}|${publishedHash}`));
}

async function runLiveEvidence(stimulus) {
  const started = performance.now();
  const replay = renderOutput(stimulus.bundle);
  const replayBytes = encoder.encode(replay);
  const publishedBytes = stimulus.bundle.type === "image" ? await fetchBytes(stimulus.bundle.published) : encoder.encode(stimulus.bundle.published);
  const [replayHash, publishedHash] = await Promise.all([sha256(replayBytes), sha256(publishedBytes)]);
  const matched = replayHash === publishedHash;
  const signature = await evidenceSignature(stimulus.id, matched, replayHash, publishedHash);
  if (state.replayUrl) URL.revokeObjectURL(state.replayUrl);
  state.replayUrl = stimulus.bundle.type === "image" ? URL.createObjectURL(new Blob([replay], { type: "image/svg+xml" })) : null;
  return {
    verifier_name: verifierName,
    generated_at: new Date().toISOString(),
    report_id: `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
    steps: makeSteps(stimulus, matched), matched,
    result: matched ? stimulus.bundle.same : stimulus.bundle.different,
    technical_detail: `电脑刚刚照着材料又做了一份，再和发布者给的作品比较。结果是：${matched ? "两份一样" : "两份不一样"}。`,
    evidence_signature: signature,
    comparison: stimulus.bundle.type === "image"
      ? { type: "image", replay: state.replayUrl, published: stimulus.bundle.published }
      : { type: "text", replay, published: stimulus.bundle.published }
  };
}

async function loadStaticEvidence(stimulus) {
  const frozen = staticReports[stimulus.id];
  const matched = frozen.replayHash === frozen.publishedHash;
  const signature = await evidenceSignature(stimulus.id, matched, frozen.replayHash, frozen.publishedHash);
  return {
    verifier_name: verifierName,
    generated_at: frozen.generatedAt,
    report_id: frozen.reportId,
    steps: makeSteps(stimulus, matched), matched,
    result: matched ? stimulus.bundle.same : stimulus.bundle.different,
    technical_detail: `电脑在你打开页面以前，已经照着材料又做了一份，并和发布者给的作品比较。结果是：${matched ? "两份一样" : "两份不一样"}。`,
    evidence_signature: signature,
    comparison: stimulus.bundle.type === "image"
      ? { type: "image", replay: frozen.replay, published: stimulus.bundle.published }
      : { type: "text", replay: frozen.replay, published: stimulus.bundle.published }
  };
}

async function rpc(name, args) {
  if (!supabase) throw new Error("云端数据服务尚未配置，请联系研究者。");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    console.error(error);
    const duplicate = /platform_user_id|duplicate key/i.test(error.message || "");
    throw new Error(duplicate ? "这个用户编号已经使用过。" : "保存失败，请检查网络后再试。如果仍然失败，请联系研究人员。");
  }
  return data;
}

function showOnly(selector) {
  ["#xa-platform-entry", "#xa-intro", "#xa-study", "#xa-poststudy", "#xa-completion"].forEach((id) => $(id).classList.toggle("hidden", id !== selector));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function currentStimulus() { return stimuli[state.order[state.index]]; }

function setResponseEnabled(enabled) {
  $("#xa-judgment-fieldset").disabled = !enabled;
  $("#xa-confidence-fieldset").disabled = !enabled;
  $("#xa-strength-fieldset").disabled = !enabled;
  $("#xa-submit").disabled = !enabled;
}

function parseStoredSession() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return value?.session_id && value?.token ? value : null;
  } catch { return null; }
}

function applySession(payload, token) {
  // 跨材料版本恢复防护。storageKey 已含版本号，旧版会话在本地取不到；这里再挡一次
  // 服务端返回的旧版会话，避免同一被试前两题看旧材料、后两题看新材料。
  // 这里必须要求字段存在并完全相等；若服务端漏返回版本，不能把“未知版本”当作当前版本放行。
  if (payload.consent_version !== CONSENT_VERSION) {
    localStorage.removeItem(storageKey);
    const error = new Error("这份答题记录不属于当前版本，无法继续。请联系研究人员。");
    error.code = "MATERIALS_VERSION_MISMATCH";
    throw error;
  }
  state.sessionId = payload.session_id;
  state.token = token;
  state.evidenceForm = payload.evidence_form;
  state.order = payload.stimulus_order;
  if (preview && requestedStimulus) state.order = [requestedStimulus, ...state.order.filter((id) => id !== requestedStimulus)];
  state.index = Number(payload.current_position || 0);
}

async function establishSession({ resume = false } = {}) {
  if (preview) {
    const order = ["P01", "S02", "C05", "D08"];
    state.platformUserId = "PREV01";
    applySession({
      session_id: `preview-${randomToken(8)}`,
      evidence_form: requestedForm || "X",
      consent_version: CONSENT_VERSION,
      stimulus_order: order,
      current_position: 0
    }, "preview");
    return { poststudy_complete: false };
  }
  if (resume) {
    const stored = parseStoredSession();
    if (!stored) throw new Error("没有可以继续的答题记录");
    const payload = await rpc("get_xa_session", { p_session_id: stored.session_id, p_token: stored.token });
    applySession(payload, stored.token);
    return payload;
  }
  const token = randomToken(32);
  const payload = await rpc("create_xa_session", {
    p_token: token,
    p_platform_user_id: state.platformUserId,
    p_consent_version: CONSENT_VERSION,
    p_user_agent: navigator.userAgent.slice(0, 400)
  });
  applySession(payload, token);
  localStorage.setItem(storageKey, JSON.stringify({
    session_id: state.sessionId,
    token,
    platform_user_id: state.platformUserId
  }));
  return payload;
}

async function continueStoredSession(platformUserId) {
  const stored = parseStoredSession();
  if (!stored) return false;

  try {
    const payload = await establishSession({ resume: true });
    if (payload.platform_user_id !== platformUserId) {
      $("#xa-platform-status").textContent = "这个编号与本机未完成答卷的编号不一致，请检查后重试。";
      return true;
    }

    state.platformUserId = platformUserId;
    localStorage.setItem(storageKey, JSON.stringify({
      session_id: state.sessionId,
      token: state.token,
      platform_user_id: platformUserId
    }));

    if (state.index < state.order.length) renderTrial();
    else if (!payload.poststudy_complete) showOnly("#xa-poststudy");
    else {
      const completed = await rpc("complete_xa_session", { p_session_id: state.sessionId, p_token: state.token });
      localStorage.removeItem(storageKey);
      $("#xa-completion-code").textContent = completed.completion_code;
      showOnly("#xa-completion");
    }
    return true;
  } catch (error) {
    localStorage.removeItem(storageKey);
    if (error.code === "MATERIALS_VERSION_MISMATCH") {
      $("#xa-platform-status").textContent = error.message;
      return true;
    }
    return false;
  }
}

function renderArtifact(stimulus) {
  $("#xa-artifact-label").textContent = stimulus.artifact.label;
  const hasImage = Boolean(stimulus.artifact.asset), hasText = Boolean(stimulus.artifact.content);
  $("#xa-artifact-image").classList.toggle("hidden", !hasImage);
  $("#xa-artifact-text").classList.toggle("hidden", !hasText);
  if (hasImage) { $("#xa-artifact-image").src = stimulus.artifact.asset; $("#xa-artifact-image").alt = stimulus.artifact.alt || stimulus.artifact.label; }
  if (hasText) $("#xa-artifact-text").textContent = stimulus.artifact.content;
}

function resetEvidence() {
  $("#xa-report").classList.add("hidden");
  $("#xa-transcript").replaceChildren();
  $("#xa-comparison").classList.remove("match", "mismatch");
  $("#xa-comparison-images").classList.add("hidden");
  $("#xa-comparison-texts").classList.add("hidden");
  $("#xa-details").open = false;
  $("#xa-waiting").classList.add("hidden");
}

function renderTrial() {
  if (state.index >= state.order.length) { showOnly("#xa-poststudy"); return; }
  const stimulus = currentStimulus();
  state.openedAt = performance.now(); state.evidenceAt = null; state.confidenceTouched = false; state.detailsOpened = false;
  $("#xa-progress").textContent = `第 ${state.index + 1} 题，共 ${state.order.length} 题`;
  $("#xa-context").textContent = stimulus.context; renderArtifact(stimulus); $("#xa-claim").textContent = stimulus.claim; resetEvidence();
  const live = state.evidenceForm === "X";
  $("#xa-evidence-heading").textContent = live ? "点一下，让电脑现在检查" : "点一下，看电脑以前做好的检查";
  $("#xa-mode-chip").textContent = live ? "现在做" : "以前做好";
  $("#xa-source-note").textContent = live
    ? "你点击后，电脑会马上照着上面的材料再做一份，然后和发布者给的作品比较。"
    : "电脑早已做完同样的检查。你点击后，只会看到保存的结果，不会再做一遍。";
  $("#xa-evidence-button").textContent = live ? "让电脑现在检查" : "看以前的检查结果";
  $("#xa-evidence-button").disabled = false;
  $("#xa-response-form").reset(); $("#xa-save-status").textContent = "";
  $("#xa-submit").textContent = state.index === state.order.length - 1 ? "去答最后几个问题" : "下一题";
  setResponseEnabled(false); showOnly("#xa-study");
}

function renderTranscript(steps) {
  const list = $("#xa-transcript"); list.replaceChildren();
  for (const step of steps) {
    const item = document.createElement("li"); if (step.status === "fail") item.classList.add("fail");
    const wrapper = document.createElement("div"), title = document.createElement("strong"), detail = document.createElement("span");
    title.textContent = step.label; detail.textContent = step.detail; wrapper.append(title, detail); item.append(wrapper); list.append(item);
  }
}

function renderEvidence(payload) {
  $("#xa-verifier").textContent = payload.verifier_name;
  $("#xa-generated-at").textContent = state.evidenceForm === "X" ? "刚刚" : "你打开本页以前";
  $("#xa-report-id").textContent = payload.report_id;
  renderTranscript(payload.steps);
  $("#xa-comparison").classList.toggle("match", payload.matched); $("#xa-comparison").classList.toggle("mismatch", !payload.matched);
  $("#xa-comparison-heading").textContent = payload.result;
  $("#xa-technical-detail").textContent = payload.technical_detail;
  if (payload.comparison.type === "image") {
    $("#xa-comparison-images").classList.remove("hidden"); $("#xa-replay-image").src = payload.comparison.replay; $("#xa-published-image").src = payload.comparison.published;
  } else {
    $("#xa-comparison-texts").classList.remove("hidden"); $("#xa-replay-text").textContent = payload.comparison.replay; $("#xa-published-text").textContent = payload.comparison.published;
  }
  $("#xa-report").classList.remove("hidden"); state.evidenceAt = performance.now(); setResponseEnabled(true);
}

async function loadEvidence() {
  $("#xa-evidence-button").disabled = true;
  const live = state.evidenceForm === "X";
  if (live) $("#xa-waiting").classList.remove("hidden");
  try {
    const payload = live ? await runLiveEvidence(currentStimulus()) : await loadStaticEvidence(currentStimulus());
    if (!preview) await rpc("mark_xa_evidence", { p_session_id: state.sessionId, p_token: state.token, p_stimulus_id: currentStimulus().id, p_report_id: payload.report_id, p_evidence_signature: payload.evidence_signature });
    $("#xa-waiting").classList.add("hidden"); renderEvidence(payload);
  } catch (error) {
    $("#xa-waiting").classList.add("hidden"); $("#xa-save-status").textContent = error.message; $("#xa-evidence-button").disabled = false;
  }
}

// scope content 默认不投放：整节从 DOM 移除，而非隐藏，避免经由 CSS 或辅助技术泄漏。
if (!scopeContentEnabled) document.querySelector('[data-treatment="scope-content"]')?.remove();

$("#xa-consent").addEventListener("change", (event) => { $("#xa-start").disabled = !event.target.checked; });
$("#xa-platform-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = $("#xa-platform-user-id").value.trim();
  if (!value || /\s/.test(value)) {
    $("#xa-platform-status").textContent = "请完整粘贴用户编号，编号中不能有空格。";
    return;
  }
  state.platformUserId = value;
  $("#xa-platform-status").textContent = "正在核对，请稍候……";
  const resumed = await continueStoredSession(value);
  if (!resumed) {
    $("#xa-platform-status").textContent = "";
    showOnly("#xa-intro");
  }
});
$("#xa-start").addEventListener("click", async () => {
  $("#xa-start").disabled = true;
  try { await establishSession(); renderTrial(); } catch (error) {
    $("#xa-intro-status").textContent = error.message;
    $("#xa-start").disabled = false;
  }
});
$("#xa-evidence-button").addEventListener("click", loadEvidence);
$("#xa-details").addEventListener("toggle", (event) => { if (event.target.open) state.detailsOpened = true; });
$("#xa-confidence-fieldset").addEventListener("change", () => { state.confidenceTouched = true; });

$("#xa-response-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.confidenceTouched) { $("#xa-save-status").textContent = "请选择你有多确定。"; return; }
  const form = new FormData(event.currentTarget); $("#xa-submit").disabled = true;
  const response = {
    p_session_id: state.sessionId, p_token: state.token, p_stimulus_id: currentStimulus().id,
    p_judgment: form.get("judgment"), p_confidence: Number(form.get("confidence")), p_evidence_strength: Number(form.get("evidence_strength")),
    p_inspect_ms: Math.round((state.evidenceAt || performance.now()) - state.openedAt), p_response_ms: Math.round(performance.now() - (state.evidenceAt || state.openedAt)), p_details_opened: state.detailsOpened
  };
  try {
    if (!preview) {
      const payload = await rpc("save_xa_response", response); state.index = Number(payload.current_position);
    } else state.index += 1;
    $("#xa-save-status").textContent = "已经记下你的答案。"; setTimeout(renderTrial, 180);
  } catch (error) { $("#xa-save-status").textContent = error.message; $("#xa-submit").disabled = false; }
});

$("#xa-poststudy-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget); $("#xa-poststudy-submit").disabled = true;
  try {
    if (!preview) {
      await rpc("save_xa_poststudy", {
        p_session_id: state.sessionId, p_token: state.token, p_source_identity: form.get("source_identity"), p_evidence_timing: form.get("evidence_timing"),
        p_operations_recall: form.get("operations_recall"), p_original_production_observed: form.get("original_production_observed"),
        p_source_confidence: Number(form.get("source_confidence")), p_explanation: form.get("explanation")
      });
      const completed = await rpc("complete_xa_session", { p_session_id: state.sessionId, p_token: state.token });
      localStorage.removeItem(storageKey); $("#xa-completion-code").textContent = completed.completion_code;
    } else $("#xa-completion-code").textContent = state.evidenceForm === "X" ? "000001" : "000002";
    showOnly("#xa-completion");
  } catch (error) { $("#xa-poststudy-status").textContent = error.message; $("#xa-poststudy-submit").disabled = false; }
});

async function resumeOrPreview() {
  if (skipIntro) { await establishSession(); renderTrial(); return; }
  if (preview) {
    state.platformUserId = "PREV01";
    showOnly("#xa-intro");
    return;
  }
  if (!preview && parseStoredSession()) {
    $("#xa-platform-status").textContent = "这台设备上有一份未完成的答卷。请填写上次使用的用户编号继续。";
    $("#xa-platform-form button[type='submit']").textContent = "核对编号并继续答题";
  }
  showOnly("#xa-platform-entry");
}

$("#xa-copy-completion").addEventListener("click", async () => {
  const code = $("#xa-completion-code").textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    $("#xa-copy-status").textContent = "完成码已复制。现在请返回回响数据平台提交。";
  } catch {
    $("#xa-copy-status").textContent = `无法自动复制，请手动记录：${code}`;
  }
});

resumeOrPreview().catch((error) => { $("#xa-intro-status").textContent = `加载失败：${error.message}`; });
