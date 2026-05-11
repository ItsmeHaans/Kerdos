// ============================
// CONSTANTS & CONFIG
// ============================
const API_BASE = 'http://127.0.0.1:8000/predict';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

const RATING_THRESHOLDS = [
  { label:'EXCELLENT', cls:'excellent', min:50 },
  { label:'GOOD',      cls:'good',      min:42 },
  { label:'MEDIOCRE',  cls:'mediocre',  min:35 },
  { label:'BAD',       cls:'bad',       min:30 },
  { label:'AVOID',     cls:'avoid',     min:0  },
];

const RATING_SCORE = { EXCELLENT:5, GOOD:4, MEDIOCRE:3, BAD:2, AVOID:1 };
const SCORE_RATING = [
  { min:4.5, label:'EXCELLENT', cls:'excellent' },
  { min:3.5, label:'GOOD',      cls:'good'      },
  { min:2.5, label:'MEDIOCRE',  cls:'mediocre'  },
  { min:1.5, label:'BAD',       cls:'bad'       },
  { min:0,   label:'AVOID',     cls:'avoid'     },
];

const LABELS = { fundamental:'FUNDAMENTAL', technical:'TECHNICAL', sentimental:'SENTIMENTAL', kerdos:'KERDOS AI' };

// ============================
// STOCK DATA (static meta)
// ============================
const STOCKS = {
  AAPL: {
    name:'AAPL', change:'+2.3%', positive:true,
    logo:'assets/svg/apple.svg',
    desc:'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.',
  },
  AMZN: {
    name:'AMZN', change:'-2.3%', positive:false,
    logo:'assets/svg/amazon.svg',
    desc:'Amazon.com Inc. engages in retail sale of consumer products, subscriptions, and web services worldwide.',
  },
  BBCA: {
    name:'BBCA', change:'+2.3%', positive:true,
    logo:'assets/svg/bca.svg',
    desc:"Bank Central Asia Tbk (BBCA) is Indonesia's largest private bank, offering retail, corporate, and digital banking.",
  }
};

// ============================
// SESSION (cookies-based)
// ============================
const SESSION_KEY = 'kerdos_session';

function loadSession() {
  try {
    const raw = document.cookie.split(';').find(c=>c.trim().startsWith(SESSION_KEY+'='));
    if (!raw) return {};
    return JSON.parse(decodeURIComponent(raw.trim().slice(SESSION_KEY.length+1)));
  } catch { return {}; }
}

function saveSession(data) {
  const val = encodeURIComponent(JSON.stringify(data));
  document.cookie = `${SESSION_KEY}=${val};path=/;max-age=86400`;
}

function clearSession() {
  document.cookie = `${SESSION_KEY}=;path=/;max-age=0`;
}

let session = loadSession(); // { fundamental:{signal,rating,cls}, technical:{...}, sentimental:{...} }

// ============================
// STATE
// ============================
let currentStock    = 'AAPL';
let currentAnalysis = null;
let isAnimating     = false;
let overlayEl       = null;

// DOM refs
const grid        = document.getElementById('iconGrid');
const island      = document.getElementById('dynamicIsland');
const iDefault    = document.getElementById('islandDefault');
const iLabel      = document.getElementById('islandLabel');
const iAnalyzing  = document.getElementById('islandAnalyzing');
const iRating     = document.getElementById('islandRating');
const iValue      = document.getElementById('islandValue');
const ALL_STATES  = [iDefault, iLabel, iAnalyzing, iRating, iValue];

function cssVar(n) { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)); }

// ============================
// RATING HELPERS
// ============================
function getRating(confidence) {
  for (const t of RATING_THRESHOLDS) {
    if (confidence >= t.min) return { label: t.label, cls: t.cls };
  }
  return { label:'AVOID', cls:'avoid' };
}

function avgRating(ratings) {
  // ratings: array of label strings
  const avg = ratings.reduce((s, r) => s + (RATING_SCORE[r] || 3), 0) / ratings.length;
  for (const t of SCORE_RATING) {
    if (avg >= t.min) return { label: t.label, cls: t.cls };
  }
  return { label:'AVOID', cls:'avoid' };
}

// ============================
// SESSION → CELL COLORS
// ============================
function applySessionColors() {
  const types = ['fundamental','technical','sentimental'];
  types.forEach(t => {
    const cell = document.getElementById('cell-'+t);
    const res  = session[t];
    cell.classList.remove('done-buy','done-sell','done-hold');
    if (res) {
      const sig = res.signal?.toUpperCase();
      if (sig === 'BUY' || sig === 'BULLISH')  cell.classList.add('done-buy');
      else if (sig === 'SELL' || sig === 'BEARISH') cell.classList.add('done-sell');
      else cell.classList.add('done-hold');
    }
  });

  // Kerdos: active only if all 3 done
  const kerdosCell = document.getElementById('cell-kerdos');
  const allDone = types.every(t => session[t]);
  kerdosCell.classList.toggle('kerdos-locked', !allDone);
}

// ============================
// SWITCH STOCK
// ============================
function switchStock(ticker) {
  if (ticker === currentStock) return;
  currentStock = ticker;
  if (currentAnalysis) _hardClose();

  const s = STOCKS[ticker];
  document.getElementById('tickerName').textContent = s.name;
  const ch = document.getElementById('tickerChange');
  ch.textContent = s.change;
  ch.className = 'ticker-change ' + (s.positive ? 'positive' : 'negative');
  document.getElementById('companyLogo').src = s.logo;
  document.getElementById('stockDesc').textContent = s.desc;
  document.querySelectorAll('.logo-item').forEach(el =>
    el.classList.toggle('active', el.dataset.stock === ticker)
  );
  islandTransition(() => setIslandState('default'));
}

// ============================
// SELECT ANALYSIS
// ============================
function selectAnalysis(e, type) {
  if (overlayEl) return;

  // Block kerdos if not all 3 done
  if (type === 'kerdos') {
    const types = ['fundamental','technical','sentimental'];
    if (!types.every(t => session[t])) return;
  }

  e.stopPropagation();
  currentAnalysis = type;

  const cellSz = cssVar('--cell-size');
  const gap    = cssVar('--gap');
  const total  = cellSz * 2 + gap;

  const origins = {
    fundamental: { top:0,          left:0         },
    technical:   { top:0,          left:cellSz+gap },
    sentimental: { top:cellSz+gap, left:0         },
    kerdos:      { top:cellSz+gap, left:cellSz+gap }
  };
  const o = origins[type];

  const ov = document.createElement('div');
  ov.className = 'expand-overlay';
  Object.assign(ov.style, { top:o.top+'px', left:o.left+'px', width:cellSz+'px', height:cellSz+'px' });

  ov.innerHTML = type === 'kerdos' ? buildKerdosPanel() : buildAnalysisPanel(type);

  grid.appendChild(ov);
  overlayEl = ov;

  ['fundamental','technical','sentimental','kerdos'].filter(t=>t!==type).forEach(t=>{
    document.getElementById('cell-'+t).classList.add('scattered');
  });

  ov.getBoundingClientRect();
  requestAnimationFrame(() => {
    Object.assign(ov.style, { top:'0px', left:'0px', width:total+'px', height:total+'px', borderRadius:'28px' });
    setTimeout(() => {
      document.getElementById('ovForm')?.classList.add('visible');
      document.getElementById('ovKerdosForm')?.classList.add('visible');
    }, 420);
  });

  islandTransition(() => {
    document.getElementById('islandLabelText').textContent = LABELS[type];
    setIslandState('label');
  });
}

// ============================
// FORM BUILDERS
// ============================
function buildAnalysisPanel(type) {
  const formHtml = buildFormFields(type);
  return `
    <div class="ov-panel" id="ovForm">
      <button class="btn-back" onclick="closeAnalysis(event)">← Back</button>
      <div class="ov-title">${LABELS[type]}</div>
      <div class="form-rows" id="formFields">
        ${formHtml}
      </div>
      <button class="btn-analyze" id="btnAnalyze" onclick="startAnalyze(event)">START ANALYZE</button>
    </div>
    <div class="ov-panel" id="ovLoading">
      <div class="loading-wrap">
        <div class="ov-title" style="font-size:1rem">ANALYZING...</div>
        <div class="loading-bar-track"><div class="loading-bar-fill" id="loadBar"></div></div>
        <div class="loading-dots">
          <div class="ld"></div><div class="ld"></div><div class="ld"></div>
        </div>
      </div>
    </div>
    <div class="ov-panel" id="ovResult">
      <button class="btn-back" onclick="closeAnalysis(event)">← Back</button>
      <div class="ov-title">${LABELS[type]}</div>
      <div class="result-wrap">
        <div class="result-glow" id="ovResultGlow"></div>
        <img class="result-icon" id="ovResultIcon" src="" alt=""/>
        <div class="result-tag" id="ovRatingTag">—</div>
        <div class="result-value" id="ovValueTag">—</div>
        <div class="result-prob-bars" id="ovProbBars"></div>
        <div class="result-sub"  id="ovSubTag"></div>
      </div>
    </div>
    <div class="ov-panel" id="ovError">
      <button class="btn-back" onclick="closeAnalysis(event)">← Back</button>
      <div class="ov-title">${LABELS[type]}</div>
      <div class="error-wrap">
        <div class="error-icon">⚠</div>
        <div class="error-msg" id="ovErrorMsg">Connection failed. Please try again.</div>
      </div>
    </div>
  `;
}

function buildFormFields(type) {
  if (type === 'fundamental') {
    return `
      <div class="input-row"><label>P/E Ratio</label><input type="number" id="f_pe_ratio" placeholder="e.g. 28.5" step="0.01"/></div>
      <div class="input-row"><label>P/B Ratio</label><input type="number" id="f_pb_ratio" placeholder="e.g. 3.2" step="0.01"/></div>
      <div class="input-row"><label>EPS</label><input type="number" id="f_eps" placeholder="e.g. 6.11" step="0.01"/></div>
      <div class="input-row"><label>Revenue Growth</label><input type="number" id="f_rev_growth" placeholder="e.g. 0.08" step="0.001"/></div>
      <div class="input-row"><label>Market Cap (B)</label><input type="number" id="f_market_cap" placeholder="e.g. 2800" step="1"/></div>
      <div class="input-row"><label>ROE</label><input type="number" id="f_roe" placeholder="e.g. 0.15" step="0.001"/></div>
    `;
  }
  if (type === 'technical') {
    return `
      <div class="input-row"><label>Day High</label><input type="number" id="t_day_high" placeholder="e.g. 195.50" step="0.01"/></div>
      <div class="input-row"><label>Day Low</label><input type="number" id="t_day_low" placeholder="e.g. 190.20" step="0.01"/></div>
      <div class="input-row"><label>Current Price</label><input type="number" id="t_current_price" placeholder="e.g. 193.00" step="0.01"/></div>
      <div class="input-row"><label>Volume</label><input type="number" id="t_volume" placeholder="e.g. 80000000" step="1"/></div>
      <div class="input-row">
        <label>Day of Week</label>
        <select id="t_day_of_week">
          <option value="0">Monday</option>
          <option value="1">Tuesday</option>
          <option value="2">Wednesday</option>
          <option value="3">Thursday</option>
          <option value="4">Friday</option>
        </select>
      </div>
    `;
  }
  if (type === 'sentimental') {
    return `
      <div class="input-row input-row--full">
        <label>Market News / Text</label>
        <textarea id="s_text" placeholder="e.g. Apple reported record earnings this quarter, beating analyst expectations..." rows="5"></textarea>
      </div>
    `;
  }
  return '';
}

function buildKerdosPanel() {
  const modules = [
    { type:'technical',   label:'TECHNICAL',   icon:'assets/svg/chart.svg', desc:'Price action & momentum' },
    { type:'fundamental', label:'FUNDAMENTAL', icon:'assets/svg/fund.svg',  desc:'Valuation & financials'  },
    { type:'sentimental', label:'SENTIMENTAL', icon:'assets/svg/face.svg',  desc:'Market mood & news'      },
  ];

  const cardsHtml = modules.map(m => {
    const res = session[m.type];
    const sCls = res ? ((res.signal === 'BUY' || res.signal === 'BULLISH') ? 'kc-buy' : (res.signal === 'SELL' || res.signal === 'BEARISH') ? 'kc-sell' : 'kc-hold') : '';
    const statusHtml = res
      ? `<div class="kc-signal ${sCls}">${res.signal}</div><div class="kc-rating">${res.rating} \xb7 ${res.confidence.toFixed(1)}%</div>`
      : `<div class="kc-signal kc-pending">\u2014</div>`;
    return `
      <div class="kerdos-card ${sCls}" id="lane-${m.type}">
        <div class="kc-top">
          <img src="${m.icon}" class="kc-icon" alt="${m.label}"/>
          <div class="kc-info">
            <div class="kc-label">${m.label}</div>
            <div class="kc-desc">${m.desc}</div>
          </div>
        </div>
        <div class="kc-bottom">
          ${statusHtml}
          <div class="lane-bar-track kc-bar-track"><div class="lane-bar-fill" id="bar-${m.type}"></div></div>
          <div class="lane-status" id="status-${m.type}">${res ? res.signal + ' \xb7 ' + res.rating : 'READY'}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="ov-panel" id="ovKerdosForm">
      <button class="btn-back" onclick="closeAnalysis(event)">\u2190 Back</button>
      <div class="ov-title">KERDOS AI</div>
      <div class="kerdos-subtitle">COMPOSITE ANALYSIS ENGINE</div>
      <div class="kerdos-cards">${cardsHtml}</div>
      <button class="btn-analyze" id="btnAnalyze" onclick="startKerdos(event)">START ANALYZE</button>
    </div>
    <div class="ov-panel" id="ovKerdosLoading">
      <div class="loading-wrap">
        <div class="ov-title" style="font-size:1rem">PROCESSING...</div>
        <div class="loading-dots">
          <div class="ld"></div><div class="ld"></div><div class="ld"></div>
        </div>
      </div>
    </div>
    <div class="ov-panel" id="ovResult">
      <button class="btn-back" onclick="closeAnalysis(event, true)">← Back</button>
      <div class="ov-title">KERDOS AI</div>
      <div class="result-wrap">
        <div class="result-glow" id="ovResultGlow"></div>
        <img class="result-icon" id="ovResultIcon" src="" alt=""/>
        <div class="result-tag" id="ovRatingTag">—</div>
        <div class="result-value" id="ovValueTag">—</div>
        <div class="result-prob-bars" id="ovProbBars"></div>
        <div class="result-sub"  id="ovSubTag"></div>
      </div>
    </div>
    <div class="ov-panel" id="ovError">
      <button class="btn-back" onclick="closeAnalysis(event)">← Back</button>
      <div class="ov-title">KERDOS AI</div>
      <div class="error-wrap">
        <div class="error-icon">⚠</div>
        <div class="error-msg" id="ovErrorMsg">Connection failed. Please try again.</div>
      </div>
    </div>
  `;
}

// ============================
// START ANALYZE (single)
// ============================
async function startAnalyze(e) {
  e.stopPropagation();

  const type = currentAnalysis;
  let body;

  try {
    body = collectFormData(type);
  } catch(err) {
    showFormError(err.message);
    return;
  }

  // 1. Form → Loading (hide form first, then show loading)
  document.getElementById('ovForm').classList.remove('visible');
  islandTransition(() => setIslandState('analyzing'));

  await delay(220); // wait for fade out
  resetBar();
  document.getElementById('ovLoading').classList.add('visible');

  // 2. Fetch API
  let apiResult;
  try {
    const resp = await fetch(`${API_BASE}/${type === 'sentimental' ? 'sentiment' : type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    apiResult = await resp.json();
  } catch(err) {
    document.getElementById('ovLoading').classList.remove('visible');
    await delay(220);
    document.getElementById('ovErrorMsg').textContent = `Error: ${err.message}`;
    document.getElementById('ovError').classList.add('visible');
    islandTransition(() => setIslandState('default'));
    return;
  }

  // Enforce minimum loading time so bar animation completes (1.8s total)
  await delay(1600);

  // 3. Save to session
  const signal     = apiResult.signal || apiResult.label;
  const confidence = apiResult.confidence;
  const rating     = getRating(confidence);
  const probs      = apiResult.probabilities || {};

  session[type] = { signal, confidence, rating: rating.label, cls: rating.cls };
  saveSession(session);
  applySessionColors();

  // 4. Populate result panel BEFORE showing it
  const rTag = document.getElementById('ovRatingTag');
  const vTag = document.getElementById('ovValueTag');
  const sTag = document.getElementById('ovSubTag');

  rTag.textContent = rating.label;
  rTag.className   = 'result-tag ' + rating.cls;

  const sigUpper = signal?.toUpperCase();
  // For sentiment: BULLISH=buy(green), BEARISH=sell(red), NEUTRAL=hold(yellow)
  const sigClass = (sigUpper === 'BUY' || sigUpper === 'BULLISH') ? 'buy'
                 : (sigUpper === 'SELL' || sigUpper === 'BEARISH') ? 'sell' : 'hold';
  // SVG icon based on direction
  const sigIcon = sigClass === 'buy' ? 'assets/svg/buy.svg'
                : sigClass === 'sell' ? 'assets/svg/sell.svg'
                : 'assets/svg/hold.svg';
  vTag.textContent = `${sigUpper}  •  ${confidence.toFixed(1)}%`;
  vTag.className   = 'result-value ' + sigClass;

  // Set vector icon
  const iconEl = document.getElementById('ovResultIcon');
  if (iconEl) { iconEl.src = sigIcon; iconEl.className = 'result-icon ' + sigClass; }

  // Glow color based on signal
  const glowEl = document.getElementById('ovResultGlow');
  if (glowEl) {
    glowEl.className = 'result-glow ' + sigClass;
  }

  // Probability bars
  const probBarsEl = document.getElementById('ovProbBars');
  if (probBarsEl && Object.keys(probs).length) {
    probBarsEl.innerHTML = Object.entries(probs).map(([k,v]) => {
      const barCls = k === 'BUY' || k === 'BULLISH' ? 'prob-buy'
                   : k === 'SELL' || k === 'BEARISH' ? 'prob-sell'
                   : 'prob-hold';
      const labelCls = k === 'BULLISH' ? 'prob-buy' : k === 'BEARISH' ? 'prob-sell' : k === 'NEUTRAL' ? 'prob-hold' : barCls;
      return `
        <div class="prob-row">
          <span class="prob-label ${labelCls}">${k}</span>
          <div class="prob-track"><div class="prob-fill ${barCls}" style="width:${v}%"></div></div>
          <span class="prob-val">${v.toFixed(1)}%</span>
        </div>
      `;
    }).join('');
  }

  // Sub info
  const clusterInfo = apiResult.cluster_label || '';
  sTag.innerHTML = `
    ${clusterInfo ? `<span class="sub-cluster">${clusterInfo}</span>` : ''}
    <span class="sub-model">${apiResult.model_used || ''}</span>
  `;

  // 5. Loading → Result
  document.getElementById('ovLoading').classList.remove('visible');
  await delay(220);
  document.getElementById('ovResult').classList.add('visible');

  // 6. Island: rating → value
  islandTransition(() => {
    const el = document.getElementById('islandRatingText');
    el.textContent = rating.label;
    el.className   = 'island-rating-text ' + rating.cls;
    setIslandState('rating');

    setTimeout(() => {
      islandTransition(() => {
        const vm = document.getElementById('valueMain');
        vm.textContent = sigUpper;
        vm.className   = 'value-main ' + sigClass;
        document.getElementById('valueSub').textContent = '';
        setIslandState('value');
      });
    }, 2000);
  });
}

// ============================
// START KERDOS
// ============================
async function startKerdos(e) {
  e.stopPropagation();

  // Swap to loading swimlanes view (just animate the swimlanes, keep form visible momentarily)
  const formEl = document.getElementById('ovKerdosForm');
  const btn    = document.getElementById('btnAnalyze');
  btn.disabled = true;
  btn.textContent = 'PROCESSING...';

  islandTransition(() => setIslandState('analyzing'));

  const laneTypes = ['technical','fundamental','sentimental'];
  const endpoints = { technical:'technical', fundamental:'fundamental', sentimental:'sentiment' };

  // Animate lanes one by one using saved session data
  for (let i = 0; i < laneTypes.length; i++) {
    const t = laneTypes[i];
    const barEl    = document.getElementById('bar-'+t);
    const statusEl = document.getElementById('status-'+t);

    // Animate bar
    barEl.style.transition = 'none';
    barEl.style.width = '0%';
    barEl.getBoundingClientRect();
    barEl.style.transition = 'width 0.9s cubic-bezier(0.4,0,0.2,1)';
    barEl.style.width = '100%';

    statusEl.textContent = 'LOADING...';
    statusEl.className = 'lane-status loading';

    await delay(950);

    const res = session[t];
    if (res) {
      statusEl.textContent = `${res.signal}  •  ${res.rating}`;
      statusEl.className = 'lane-status done ' + res.cls;
    } else {
      statusEl.textContent = 'NO DATA';
      statusEl.className = 'lane-status';
    }

    await delay(400);
  }

  await delay(600);

  // Compute Kerdos result
  const fundRes = session['fundamental'];
  const techRes = session['technical'];
  const sentRes = session['sentimental'];

  if (!fundRes || !techRes || !sentRes) {
    swapPanel('ovKerdosForm','ovError');
    document.getElementById('ovErrorMsg').textContent = 'Missing analysis data. Please run all 3 analyses first.';
    islandTransition(() => setIslandState('default'));
    return;
  }

  // Average rating
  const overallRating = avgRating([fundRes.rating, techRes.rating, sentRes.rating]);

  // Good/Bad from fundamental
  const fundSignal = fundRes.signal?.toUpperCase();
  const goodBad    = fundSignal === 'BUY' ? 'GOOD STOCK' : fundSignal === 'SELL' ? 'BAD STOCK' : 'NEUTRAL STOCK';

  // Buy/Sell from technical
  const techSignal = techRes.signal?.toUpperCase();
  const buySell    = techSignal === 'BUY' ? 'BUY' : techSignal === 'SELL' ? 'SELL' : 'HOLD';

  // Now/Later from sentiment alignment with technical
  const sentSignal = sentRes.signal?.toUpperCase(); // BULLISH / BEARISH / NEUTRAL
  let nowLater = 'LATER';
  if (buySell === 'HOLD') {
    nowLater = 'AND SEE';
  } else if (sentSignal === 'NEUTRAL') {
    nowLater = 'NOW';
  } else if (buySell === 'BUY' && sentSignal === 'BULLISH') {
    nowLater = 'NOW';
  } else if (buySell === 'SELL' && sentSignal === 'BEARISH') {
    nowLater = 'NOW';
  }

  const resultLine  = `${buySell} ${nowLater}`;
  const resultClass = buySell === 'BUY' ? 'buy' : buySell === 'SELL' ? 'sell' : 'hold';

  // Populate result BEFORE showing
  const rTag = document.getElementById('ovRatingTag');
  const vTag = document.getElementById('ovValueTag');
  const sTag = document.getElementById('ovSubTag');

  rTag.textContent = overallRating.label;
  rTag.className   = 'result-tag ' + overallRating.cls;
  vTag.textContent = resultLine;
  vTag.className   = 'result-value ' + resultClass;

  // Rich sub: breakdown per analysis
  const fundConf = fundRes.confidence?.toFixed(1);
  const techConf = techRes.confidence?.toFixed(1);
  const sentConf = sentRes.confidence?.toFixed(1);
  // Color helper
  function sigCls(sig) {
    const s = sig?.toUpperCase();
    return (s === 'BUY' || s === 'BULLISH') ? 'prob-buy' : (s === 'SELL' || s === 'BEARISH') ? 'prob-sell' : 'prob-hold';
  }

  // Glow + icon
  const kGlowEl = document.getElementById('ovResultGlow');
  if (kGlowEl) kGlowEl.className = 'result-glow ' + resultClass;
  const kIconEl = document.getElementById('ovResultIcon');
  if (kIconEl) {
    kIconEl.src = resultClass === 'buy' ? 'assets/svg/buy.svg' : resultClass === 'sell' ? 'assets/svg/sell.svg' : 'assets/svg/hold.svg';
    kIconEl.className = 'result-icon ' + resultClass;
  }

  // Prob bars for kerdos (half-width cap so no overflow)
  const kProbBars = document.getElementById('ovProbBars');
  if (kProbBars) {
    kProbBars.innerHTML = [
      { label:'FUND', sig: fundRes.signal, conf: parseFloat(fundConf) },
      { label:'TECH', sig: techRes.signal, conf: parseFloat(techConf) },
      { label:'SENT', sig: sentRes.signal, conf: parseFloat(sentConf) },
    ].map(r => `
      <div class="prob-row kerdos-prob-row">
        <span class="prob-label ${sigCls(r.sig)}">${r.sig}</span>
        <div class="prob-track"><div class="prob-fill ${sigCls(r.sig)}" style="width:${Math.min(r.conf,100)}%"></div></div>
        <span class="prob-val">${r.conf.toFixed(1)}%</span>
        <span class="prob-label-name">${r.label}</span>
      </div>
    `).join('');
  }

  sTag.innerHTML = `
    <span class="sub-cluster">${goodBad}</span>
    <span class="sub-model">KERDOS AI COMPOSITE SIGNAL</span>
  `;

  // Show result
  document.getElementById('ovKerdosForm').classList.remove('visible');
  await delay(220);
  document.getElementById('ovResult').classList.add('visible');

  // Island flow — single line: "BAD STOCK • HOLD LATER"
  const islandOneLiner = `${goodBad}  •  ${resultLine}`;

  islandTransition(() => {
    const el = document.getElementById('islandRatingText');
    el.textContent = overallRating.label;
    el.className   = 'island-rating-text ' + overallRating.cls;
    setIslandState('rating');

    setTimeout(() => {
      islandTransition(() => {
        const vm = document.getElementById('valueMain');
        vm.textContent = islandOneLiner;
        vm.className   = 'value-main ' + resultClass;
        document.getElementById('valueSub').textContent = '';
        setIslandState('value');
      });
    }, 2000);
  });

  // Clear session after Kerdos completes
  clearSession();
  session = {};
}

// ============================
// HELPERS
// ============================
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function swapPanel(hideId, showId) {
  document.getElementById(hideId)?.classList.remove('visible');
  setTimeout(() => document.getElementById(showId)?.classList.add('visible'), 200);
}

function resetBar() {
  const bar = document.getElementById('loadBar');
  if (!bar) return;
  bar.style.animation = 'none';
  bar.getBoundingClientRect();
  bar.style.animation = '';
}

function showFormError(msg) {
  const btn = document.getElementById('btnAnalyze');
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = msg;
  btn.style.background = 'var(--red)';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
  }, 2500);
}

function collectFormData(type) {
  if (type === 'fundamental') {
    const vals = {
      pe_ratio:       parseFloat(document.getElementById('f_pe_ratio')?.value),
      pb_ratio:       parseFloat(document.getElementById('f_pb_ratio')?.value),
      eps:            parseFloat(document.getElementById('f_eps')?.value),
      revenue_growth: parseFloat(document.getElementById('f_rev_growth')?.value),
      market_cap:     parseFloat(document.getElementById('f_market_cap')?.value),
      roe:            parseFloat(document.getElementById('f_roe')?.value),
    };
    if (Object.values(vals).some(v => isNaN(v))) throw new Error('Fill all fields');
    return vals;
  }
  if (type === 'technical') {
    const vals = {
      day_high:      parseFloat(document.getElementById('t_day_high')?.value),
      day_low:       parseFloat(document.getElementById('t_day_low')?.value),
      current_price: parseFloat(document.getElementById('t_current_price')?.value),
      volume:        parseFloat(document.getElementById('t_volume')?.value),
      day_of_week:   parseInt(document.getElementById('t_day_of_week')?.value),
    };
    if (isNaN(vals.day_high)||isNaN(vals.day_low)||isNaN(vals.current_price)||isNaN(vals.volume))
      throw new Error('Fill all fields');
    return vals;
  }
  if (type === 'sentimental') {
    const text = document.getElementById('s_text')?.value?.trim();
    if (!text) throw new Error('Enter text');
    return { text };
  }
  throw new Error('Unknown type');
}

// ============================
// CLOSE ANALYSIS
// ============================
function closeAnalysis(e, isKerdos = false) {
  if (e) e.stopPropagation();
  if (!overlayEl) return;

  if (isKerdos) {
    applySessionColors(); // reapply in case kerdos cleared
  }

  _hardClose();
  islandTransition(() => setIslandState('default'));
}

function _hardClose() {
  if (!overlayEl) return;
  const type = currentAnalysis;
  currentAnalysis = null;

  const cellSz = cssVar('--cell-size');
  const gap    = cssVar('--gap');
  const origins = {
    fundamental: { top:0, left:0 },
    technical:   { top:0, left:cellSz+gap },
    sentimental: { top:cellSz+gap, left:0 },
    kerdos:      { top:cellSz+gap, left:cellSz+gap }
  };
  const o = origins[type] || {top:0,left:0};

  overlayEl.querySelectorAll('.ov-panel').forEach(p => p.classList.remove('visible'));
  ['fundamental','technical','sentimental','kerdos'].forEach(t => {
    document.getElementById('cell-'+t).classList.remove('scattered');
  });

  setTimeout(() => {
    if (!overlayEl) return;
    Object.assign(overlayEl.style, { top:o.top+'px', left:o.left+'px', width:cellSz+'px', height:cellSz+'px', borderRadius:'22px' });
    setTimeout(() => {
      if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      applySessionColors();
    }, 560);
  }, 140);
}

// ============================
// ISLAND HELPERS
// ============================
function islandTransition(fn) {
  if (isAnimating) return;
  isAnimating = true;
  ALL_STATES.forEach(el => el.classList.add('hidden'));
  island.className = 'dynamic-island state-default';
  setTimeout(() => { fn(); isAnimating = false; }, 280);
}

function setIslandState(state) {
  const stateMap = { default:'state-default', label:'state-label', analyzing:'state-analyzing', rating:'state-rating', value:'state-value' };
  const elMap    = { default:iDefault, label:iLabel, analyzing:iAnalyzing, rating:iRating, value:iValue };
  island.className = 'dynamic-island ' + stateMap[state];
  setTimeout(() => elMap[state]?.classList.remove('hidden'), 280);
}
// ============================
// LIVE AAPL PRICE
// ============================
async function fetchAAPLChange() {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=2d');
    const data = await res.json();
    const quotes = data.chart.result[0].indicators.quote[0].close;
    const prev = quotes[quotes.length - 2];
    const curr = quotes[quotes.length - 1];
    const pct = ((curr - prev) / prev) * 100;

    const el = document.getElementById('tickerChange');
    const positive = pct >= 0;
    el.textContent = (positive ? '+' : '') + pct.toFixed(2) + '%';
    el.className = 'ticker-change ' + (positive ? 'positive' : 'negative');
  } catch(e) {
    console.warn('AAPL fetch failed:', e);
  }
}

fetchAAPLChange();
setInterval(fetchAAPLChange, 60000); // refresh every 60s
// ============================
// INIT
// ============================
document.addEventListener('DOMContentLoaded', () => {
  session = loadSession();
  applySessionColors();
  setIslandState('default');
});