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
const storageKey = "scopeproof_xa_cloud_session_v1";
const verifierName = "ScopeProof 独立核验程序";
const $ = (selector) => document.querySelector(selector);

const stimuli = {
  P01: {
    id: "P01",
    context: "一家设计工作室交付了一张活动海报，并公开了一份证据包。包内含结构化设计参数和确定性绘图程序，任何人都可以发起一次独立检查。",
    artifact: { label: "工作室公开的海报", asset: "./assets/poster-blue.svg", alt: "深蓝色的夏夜音乐会海报" },
    claim: "仅用证据包里列出的公开材料，在本次检查中可以生成与发布版逐像素相同的海报。",
    bundle: {
      type: "image", kind: "poster", published: "./assets/poster-blue.svg",
      input: { title: "夏夜音乐会", subtitle: "SUMMER SOUND", date: "8 月 16 日 · 19:30", place: "河岸剧场", accent: "#3459e6", accent2: "#00a88f" },
      source: "结构化设计参数、绘图程序和公开设置",
      generateLabel: "执行确定性绘图程序", generateDetail: "核验程序根据结构化参数生成了一张新的 SVG 海报。",
      compareLabel: "完整比较新生成版与发布版", same: "新生成版与发布版逐字节相同", different: "新生成版与发布版并不相同"
    }
  },
  S02: {
    id: "S02",
    context: "一家内容公司发布了一段文章摘要，并公开了一份证据包。包内含结构化要点和固定模板程序，任何人都可以发起一次独立检查。",
    artifact: { label: "公司公开的文章摘要", content: "调查发现清晰导视和纪念品商店；最能改善参观体验；建议先改造入口与主展厅。" },
    claim: "仅用证据包里列出的公开材料，在本次检查中可以生成与发布版逐字相同的摘要。",
    bundle: {
      type: "text", kind: "summary", published: "调查发现清晰导视和纪念品商店；最能改善参观体验；建议先改造入口与主展厅。",
      input: { finding: "调查发现清晰导视和安静休息区", effect: "最能改善参观体验", recommendation: "建议先改造入口与主展厅" },
      source: "结构化文章要点、模板程序和公开设置",
      generateLabel: "执行确定性摘要程序", generateDetail: "核验程序根据结构化要点生成了一段新的摘要。",
      compareLabel: "完整比较新生成摘要与发布版", same: "新生成摘要与发布版逐字相同", different: "新生成摘要与发布版并不相同"
    }
  },
  C05: {
    id: "C05",
    context: "一家图片平台公开了一张照片及其说明，并提供了一份证据包。包内含结构化识别结果和固定模板程序，任何人都可以发起一次独立检查。",
    artifact: { label: "平台公开的照片与说明", asset: "./assets/photo-cyclist.svg", alt: "路口的一名骑车人", content: "黄昏时，一名骑车人正在红灯旁等待，地点是城市路口。" },
    claim: "平台当初制作这段后来公开的图片说明时，实际使用的就是证据包里这套材料。",
    bundle: {
      type: "text", kind: "caption", published: "黄昏时，一名骑车人正在红灯旁等待，地点是城市路口。",
      input: { time: "黄昏时", subject: "一名骑车人", action: "红灯旁等待", setting: "城市路口" },
      source: "结构化识别结果、模板程序和公开设置",
      generateLabel: "执行确定性说明程序", generateDetail: "核验程序根据结构化识别结果生成了一段新的说明。",
      compareLabel: "完整比较新生成说明与发布版", same: "新生成说明与发布版逐字相同", different: "新生成说明与发布版并不相同"
    }
  },
  D08: {
    id: "D08",
    context: "一个数据团队发布了一张分析图表，并公开了一份证据包。包内含结构化数据和确定性绘图程序，任何人都可以发起一次独立检查。",
    artifact: { label: "团队公开的数据图表", asset: "./assets/chart-energy-altered.svg", alt: "四个季度能源使用量柱状图" },
    claim: "这份证据包此刻也正在另一台电脑上运行。",
    bundle: {
      type: "image", kind: "chart", published: "./assets/chart-energy-altered.svg",
      input: { title: "四个季度能源使用量", labels: ["第一季", "第二季", "第三季", "第四季"], values: [78, 62, 55, 43], accent: "#16856b" },
      source: "结构化数据、绘图程序和公开设置",
      generateLabel: "执行确定性绘图程序", generateDetail: "核验程序根据公开数据生成了一张新的 SVG 图表。",
      compareLabel: "完整比较新生成图表与发布版", same: "新生成图表与发布版逐字节相同", different: "新生成图表与发布版并不相同"
    }
  }
};

const staticReports = {
  P01: { generatedAt: "2026-08-08T10:01:14Z", reportId: "XA-A-P01-8F31", replay: "./assets/replay-P01.svg", replayHash: "7819343ea79a63d619e76f83789559e899e745117f6013acf9352ebb3e847ef4", publishedHash: "7819343ea79a63d619e76f83789559e899e745117f6013acf9352ebb3e847ef4" },
  S02: { generatedAt: "2026-08-08T10:01:15Z", reportId: "XA-A-S02-19C4", replay: "调查发现清晰导视和安静休息区；最能改善参观体验；建议先改造入口与主展厅。", replayHash: "6354c0a018a437b2fbd83c57f7380c87a37c32aaa174dfedc9159df7777643c7", publishedHash: "2d9bca9db51aad695e41db8d5c0fdfbb1cdb9bcf27cb6b8948f13c1b0e2d667e" },
  C05: { generatedAt: "2026-08-08T10:01:16Z", reportId: "XA-A-C05-71AD", replay: "黄昏时，一名骑车人正在红灯旁等待，地点是城市路口。", replayHash: "772fe2dfe5d12390a56b643c4436ac90363388fe6693f44f1c8c1d3cf3b763cd", publishedHash: "772fe2dfe5d12390a56b643c4436ac90363388fe6693f44f1c8c1d3cf3b763cd" },
  D08: { generatedAt: "2026-08-08T10:01:17Z", reportId: "XA-A-D08-42B8", replay: "./assets/replay-D08.svg", replayHash: "bdcb15893436b60e10d310e61c08c19492fb239ebf8ec4566eabf62e05469749", publishedHash: "97ba565210ddc5e48df79b9c9b7fa54b6db09d36d327fbbec88d7106469de9cf" }
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
<text x="58" y="755" fill="white" font-family="Arial,sans-serif" font-size="18">DETERMINISTIC EDITION</text>
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
<text x="638" y="445" text-anchor="end" fill="#7a877e" font-family="Arial,sans-serif" font-size="14">公开数据 · 确定性绘制</text>
</svg>
`;
}

function renderOutput(bundle) {
  if (bundle.kind === "poster") return renderPoster(bundle.input);
  if (bundle.kind === "chart") return renderChart(bundle.input);
  if (bundle.kind === "summary") return `${bundle.input.finding}；${bundle.input.effect}；${bundle.input.recommendation}。`;
  if (bundle.kind === "caption") return `${bundle.input.time}，${bundle.input.subject}正在${bundle.input.action}，地点是${bundle.input.setting}。`;
  throw new Error("不支持的核验程序");
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
    { status: "pass", label: "读取证据包中的公开材料", detail: `${stimulus.bundle.source}已载入。` },
    { status: "pass", label: stimulus.bundle.generateLabel, detail: stimulus.bundle.generateDetail },
    { status: matched ? "pass" : "fail", label: stimulus.bundle.compareLabel, detail: `${matched ? stimulus.bundle.same : stimulus.bundle.different}。` }
  ];
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
    report_id: `XA-X-${stimulus.id}-${randomToken(2).toUpperCase()}`,
    steps: makeSteps(stimulus, matched), matched,
    result: matched ? stimulus.bundle.same : stimulus.bundle.different,
    technical_detail: `本次浏览器内执行耗时 ${Math.max(1, Math.round((performance.now() - started) * 1000))} μs · 生成结果 SHA-256 ${replayHash.slice(0, 16)} · 发布结果 SHA-256 ${publishedHash.slice(0, 16)}`,
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
    technical_detail: `先前真实执行 · 生成结果 SHA-256 ${frozen.replayHash.slice(0, 16)} · 发布结果 SHA-256 ${frozen.publishedHash.slice(0, 16)}`,
    evidence_signature: signature,
    comparison: stimulus.bundle.type === "image"
      ? { type: "image", replay: frozen.replay, published: stimulus.bundle.published }
      : { type: "text", replay: frozen.replay, published: stimulus.bundle.published }
  };
}

async function rpc(name, args) {
  if (!supabase) throw new Error("云端数据服务尚未配置，请联系研究者。");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "云端保存失败");
  return data;
}

function showOnly(selector) {
  ["#xa-platform-entry", "#xa-intro", "#xa-study", "#xa-poststudy", "#xa-completion"].forEach((id) => $(id).classList.toggle("hidden", id !== selector));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function currentStimulus() { return stimuli[state.order[state.index]]; }

function setResponseEnabled(enabled) {
  $("#xa-judgment-fieldset").disabled = !enabled;
  $("#xa-strength-fieldset").disabled = !enabled;
  $("#xa-confidence").disabled = !enabled;
  $("#xa-submit").disabled = !enabled;
}

function parseStoredSession() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return value?.session_id && value?.token ? value : null;
  } catch { return null; }
}

function applySession(payload, token) {
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
    applySession({ session_id: `preview-${randomToken(8)}`, evidence_form: requestedForm || "X", stimulus_order: order, current_position: 0 }, "preview");
    return { poststudy_complete: false };
  }
  if (resume) {
    const stored = parseStoredSession();
    if (!stored) throw new Error("没有可恢复的会话");
    const payload = await rpc("get_xa_session", { p_session_id: stored.session_id, p_token: stored.token });
    applySession(payload, stored.token);
    return payload;
  }
  const token = randomToken(32);
  const payload = await rpc("create_xa_session", {
    p_token: token,
    p_platform_user_id: state.platformUserId,
    p_consent_version: "scopeproof-xa-zh-v3-huixiang",
    p_user_agent: navigator.userAgent.slice(0, 400)
  });
  applySession(payload, token);
  localStorage.setItem(storageKey, JSON.stringify({ session_id: state.sessionId, token }));
  return payload;
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
  $("#xa-progress").textContent = `第 ${state.index + 1} / ${state.order.length} 项`;
  $("#xa-context").textContent = stimulus.context; renderArtifact(stimulus); $("#xa-claim").textContent = stimulus.claim; resetEvidence();
  const live = state.evidenceForm === "X";
  $("#xa-evidence-heading").textContent = live ? "现在运行独立核验" : "查看独立核验报告";
  $("#xa-mode-chip").textContent = live ? "当前会话真实执行" : "先前真实执行的报告";
  $("#xa-source-note").textContent = live
    ? "点击后，ScopeProof 独立核验程序会在当前页面真实读取公开材料、重新生成并完整比较结果。"
    : "这份报告由同一个 ScopeProof 独立核验程序在你进入页面以前真实执行并保存；当前页面只展示报告，不重新运行。";
  $("#xa-evidence-button").textContent = live ? "现在运行独立核验" : "查看已生成的核验报告";
  $("#xa-evidence-button").disabled = false;
  $("#xa-response-form").reset(); $("#xa-confidence").value = 50; $("#xa-confidence-output").value = "请拖动"; $("#xa-save-status").textContent = "";
  $("#xa-submit").textContent = state.index === state.order.length - 1 ? "保存并回答理解问题" : "保存并继续";
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
  $("#xa-verifier").textContent = payload.verifier_name; $("#xa-generated-at").textContent = payload.generated_at; $("#xa-report-id").textContent = payload.report_id;
  renderTranscript(payload.steps);
  $("#xa-comparison").classList.toggle("match", payload.matched); $("#xa-comparison").classList.toggle("mismatch", !payload.matched);
  $("#xa-comparison-heading").textContent = payload.result;
  $("#xa-technical-detail").textContent = `${payload.technical_detail} · 证据签名 ${payload.evidence_signature.slice(0, 16)}`;
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

$("#xa-consent").addEventListener("change", (event) => { $("#xa-start").disabled = !event.target.checked; });
$("#xa-platform-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = $("#xa-platform-user-id").value.trim();
  if (!value || /\s/.test(value)) {
    $("#xa-platform-status").textContent = "请完整粘贴用户 ID；ID 中不能包含空格。";
    return;
  }
  state.platformUserId = value;
  $("#xa-platform-status").textContent = "";
  showOnly("#xa-intro");
});
$("#xa-start").addEventListener("click", async () => {
  $("#xa-start").disabled = true;
  try { await establishSession(); renderTrial(); } catch (error) {
    $("#xa-intro-status").textContent = /platform_user_id|duplicate key/i.test(error.message)
      ? "此用户 ID 已经开始或完成过本任务；如需恢复，请使用原来的浏览器，或联系研究者。"
      : error.message;
    $("#xa-start").disabled = false;
  }
});
$("#xa-evidence-button").addEventListener("click", loadEvidence);
$("#xa-details").addEventListener("toggle", (event) => { if (event.target.open) state.detailsOpened = true; });
$("#xa-confidence").addEventListener("input", (event) => { state.confidenceTouched = true; $("#xa-confidence-output").value = event.target.value; });

$("#xa-response-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.confidenceTouched) { $("#xa-save-status").textContent = "请先拖动判断把握度滑块。"; return; }
  const form = new FormData(event.currentTarget); $("#xa-submit").disabled = true;
  const response = {
    p_session_id: state.sessionId, p_token: state.token, p_stimulus_id: currentStimulus().id,
    p_judgment: form.get("judgment"), p_confidence: Number($("#xa-confidence").value), p_evidence_strength: Number(form.get("evidence_strength")),
    p_inspect_ms: Math.round((state.evidenceAt || performance.now()) - state.openedAt), p_response_ms: Math.round(performance.now() - (state.evidenceAt || state.openedAt)), p_details_opened: state.detailsOpened
  };
  try {
    if (!preview) {
      const payload = await rpc("save_xa_response", response); state.index = Number(payload.current_position);
    } else state.index += 1;
    $("#xa-save-status").textContent = "回答已保存。"; setTimeout(renderTrial, 180);
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
    } else $("#xa-completion-code").textContent = `PREV-${state.evidenceForm}`;
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
    try {
      const payload = await establishSession({ resume: true });
      if (state.index < state.order.length) renderTrial(); else if (!payload.poststudy_complete) showOnly("#xa-poststudy");
      else {
        const completed = await rpc("complete_xa_session", { p_session_id: state.sessionId, p_token: state.token });
        localStorage.removeItem(storageKey); $("#xa-completion-code").textContent = completed.completion_code; showOnly("#xa-completion");
      }
    } catch { localStorage.removeItem(storageKey); showOnly("#xa-platform-entry"); }
    return;
  }
  showOnly("#xa-platform-entry");
}

$("#xa-copy-completion").addEventListener("click", async () => {
  const code = $("#xa-completion-code").textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    $("#xa-copy-status").textContent = "完成码已复制。现在请返回回眸数据平台提交。";
  } catch {
    $("#xa-copy-status").textContent = `无法自动复制，请手动记录：${code}`;
  }
});

resumeOrPreview().catch((error) => { $("#xa-intro-status").textContent = `加载失败：${error.message}`; });
