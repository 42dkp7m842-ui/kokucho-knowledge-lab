'use strict';
const DB_NAME='kokucho_knowledge_lab_v1', DB_VERSION=1;
const S={db:null,topics:[],questions:[],assets:[],reviews:[],settings:{goal:'',dailyGoal:15,minutes:25,lastBackup:''},page:'home',area:'all',query:'',detailId:null,questionId:null,pastYear:2026,revealed:false,reviewMode:'flash',practiceFilter:'all',session:null,answer:'',answerShown:false,examTimer:null,photoUrl:new Map(),lastExamSave:0,practiceTimer:null};
const $=sel=>document.querySelector(sel), $$=sel=>[...document.querySelectorAll(sel)];
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'id_'+Date.now()+'_'+Math.random().toString(36).slice(2);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDay=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const dateAdd=(days,from=new Date())=>{let d=new Date(from);d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return localDay(d)};
const jpDay=s=>s?`${Number(s.slice(5,7))}/${Number(s.slice(8,10))}`:'—';
const today=()=>localDay();
const inTime=()=>new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
const inDate=()=>new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'short'});
const debounce=(f,t=150)=>{let h;return (...a)=>{clearTimeout(h);h=setTimeout(()=>f(...a),t)}};
const getAreaColor=name=>(CURRICULUM.find(a=>a.name===name)||{color:'#7b9aaa'}).color;
const LAW_NOTICE='2027年度試験の適用法令・改正は未照合。教材・e-Gov法令で必ず確認してください。';
function message(m){const el=$('#toast');el.textContent=m;el.classList.add('show');clearTimeout(message.h);message.h=setTimeout(()=>el.classList.remove('show'),3400)}
function ask(msg){return window.confirm(msg)}
function dbOpen(){return new Promise((resolve,reject)=>{if(!indexedDB){reject(Error('このブラウザはIndexedDBに対応していません'));return}const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;for(const [name,key] of [['topics','id'],['questions','id'],['assets','id'],['reviews','id'],['settings','id']])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:key})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function all(store){return new Promise((res,rej)=>{let tx=S.db.transaction(store,'readonly'),r=tx.objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,item){return new Promise((res,rej)=>{let tx=S.db.transaction(store,'readwrite');tx.objectStore(store).put(item);tx.oncomplete=()=>res(item);tx.onerror=()=>rej(tx.error)})}
function del(store,id){return new Promise((res,rej)=>{let tx=S.db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function clearStore(store){return new Promise((res,rej)=>{let tx=S.db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function newSrs(active=false){return {enabled:active,streak:0,due:active?today():null,history:0,last:null}};
function areaTopics(){return CURRICULUM.reduce((acc,a)=>{acc.push(...a.topics.map(t=>({area:a.name,title:t})));return acc},[])}
async function seed(){if((await all('topics')).length)return;let index=0;for(const item of areaTopics()){const card=STARTER_CARDS.find(v=>v.title===item.title);await put('topics',{id:'base_'+(++index),area:item.area,title:item.title,law:card?.law||'',summary:card?.explanation||'',question:card?.question||`「${item.title}」の発動条件・主体・要件・効果・例外・手続きを説明せよ。`,answer:card?.answer||'',keywords:card?.keywords||[],notes:'',sourceUrl:card?LAW_URL:'',sourceLabel:card?'e-Gov 国税徴収法（基礎論点）':'',verification:card?'source-checked-older':'not-checked',origin:card?'original-starter':'curriculum-outline',srs:newSrs(!!card),createdAt:Date.now(),updatedAt:Date.now()})}for(const p of ORIGINAL_PRACTICE){let t=(await all('topics')).find(a=>a.title===p.topicTitle);await put('questions',{id:uid(),kind:'practice',area:p.area,title:p.title,question:p.question,answer:p.answer,keywords:p.keywords,topicId:t?.id||'',year:null,sourceUrl:LAW_URL,sourceLabel:'オリジナル演習（法令に基づく）',verification:'source-checked-older',attempts:[],createdAt:Date.now()})}}
async function load(){[S.topics,S.questions,S.assets,S.reviews]=await Promise.all(['topics','questions','assets','reviews'].map(all));let setting=(await all('settings')).find(x=>x.id==='main');if(setting)S.settings={...S.settings,...setting};else await saveSettings();}
async function saveSettings(){await put('settings',{id:'main',...S.settings})}
const dueTopics=()=>S.topics.filter(t=>t.srs?.enabled&&t.answer?.trim()&&(!t.srs.due||t.srs.due<=today())).sort((a,b)=>(a.srs.due||'').localeCompare(b.srs.due||''));
const activeTopics=()=>S.topics.filter(t=>t.answer?.trim()&&t.srs?.enabled);
const readyTopics=()=>S.topics.filter(t=>t.answer?.trim());
const dailyReviews=(days=7)=>{let start=dateAdd(-(days-1));return S.reviews.filter(r=>r.day>=start)};
const reviewedToday=()=>S.reviews.filter(r=>r.day===today()).length;
const countPending=()=>S.topics.filter(t=>!t.answer?.trim()).length;
const reviewRecord=async(topic,grade,kind='theory')=>{const r={id:uid(),itemId:topic.id,kind,grade,day:today(),timestamp:Date.now()};await put('reviews',r);S.reviews.push(r)};
function nextSrs(srs,grade){let s={...newSrs(),...srs};if(grade===0){s.streak=0;s.due=dateAdd(1)}else if(grade===1){s.streak=Math.max(0,s.streak-1);s.due=dateAdd(1)}else if(grade===2){s.streak+=1;s.due=dateAdd([1,3,7,14,30,60,90,120][Math.min(s.streak-1,7)])}else{s.streak+=1;s.due=dateAdd([3,7,14,30,60,90,120,180][Math.min(s.streak-1,7)])}s.history=(s.history||0)+1;s.last=today();s.enabled=true;return s}
function updateNav(){const due=dueTopics().length;$('#navDue').textContent=due;$('#topDue').textContent=due;$('#todayLabel').textContent=inDate();$$('[data-page]').forEach(n=>n.classList.toggle('active',n.dataset.page===S.page));$('#crumb').textContent=({home:'学習ダッシュボード',review:'今日の復習',theory:'理論ライブラリ',practice:'論点別演習',past:'過去問・模擬試験',materials:'画像教材',analytics:'学習分析',data:'データ・設定'})[S.page]||'国税徴収法 Knowledge Lab'}
function page(name){S.page=name;S.detailId=null;S.questionId=null;S.revealed=false;S.session=null;S.answerShown=false;render();window.scrollTo({top:0,behavior:'instant'})}
function intro(label,title,sub,action=''){return `<div class="intro"><div><p class="eyebrow">${esc(label)}</p><h1>${esc(title)}</h1><p class="subtitle">${esc(sub)}</p></div>${action}</div>`}
function chip(text,cls=''){return `<span class="chip ${cls}">${esc(text)}</span>`}
function maskKeywords(answer,keywords){let result=String(answer||'');for(const k of [...(keywords||[])].sort((a,b)=>b.length-a.length)){if(!k)continue;result=result.split(k).join('（　　　）')}return result}
function dueLabel(t){if(!t.answer?.trim())return chip('未作成');if(!t.srs?.enabled)return chip('復習OFF');if(!t.srs?.history)return chip('初回学習','blue');if(t.srs.due<=today())return chip('復習期限','yellow');return chip(`次回 ${jpDay(t.srs.due)}`,'verified')}
function sourceFlag(t){return t.verification==='user-checked'?chip('教材照合済','verified'):t.verification==='source-checked-older'?chip('旧年度の出典あり','blue'):chip('要照合','yellow')}
function areaTiles(){return `<div class="area-grid">${CURRICULUM.map(a=>{let topics=S.topics.filter(t=>t.area===a.name),n=topics.filter(t=>t.answer?.trim()).length;return `<button class="area-card" data-action="filterArea" data-area="${esc(a.name)}"><span class="area-bubble" style="background:${a.color}">${esc(a.short.slice(0,2))}</span><span class="area-info"><b>${esc(a.name)}</b><small>${n} / ${topics.length} 理論が登録済み</small></span><span class="chev">›</span></button>`}).join('')}</div>`}
function home(){let goal=S.settings.goal;let days=goal?Math.max(0,Math.ceil((new Date(goal+'T12:00:00')-new Date())/864e5)):null;let total=S.topics.length,ready=readyTopics().length,progress=total?Math.round(100*ready/total):0;let streak=S.reviews.filter(r=>r.grade>=2).length;let next=dueTopics().slice(0,4);let last=S.settings.lastBackup;return `${intro('YOUR STUDY HUB','合格への道筋を、今日の一問から。','理解 → 自力再現 → 記述演習 → 過去問。忘れる前に、もう一度。',`<button class="btn btn-line btn-sm" data-page="data">⚙ 目標を設定</button>`)}
<div class="grid-stats"><div class="panel stat good"><div class="label">今日の復習</div><div class="value">${dueTopics().length}<span class="suffix"> 理論</span></div><div class="hint">期限が来たカード</div></div><div class="panel stat"><div class="label">登録済み理論</div><div class="value">${ready}<span class="suffix"> / ${total}</span></div><div class="hint">回答が登録されている論点</div></div><div class="panel stat"><div class="label">今日の学習</div><div class="value">${reviewedToday()}<span class="suffix"> 回</span></div><div class="hint">1日の目標 ${S.settings.dailyGoal}回</div></div><div class="panel stat"><div class="label">試験まで</div><div class="value">${days==null?'—':days}<span class="suffix"> ${days==null?'目標未設定':'日'}</span></div><div class="hint">${goal?esc(goal)+'（個人設定）':'2027年8月予定・正式日未入力'}</div></div></div>
<div class="feature-grid"><div class="hero"><p class="eyebrow">DAILY MISSION</p><h2>${dueTopics().length?'今日の復習を終わらせよう':'今日の学習を始めよう'}</h2><p>間違えた論点を翌日に、定着した論点は3日・7日・14日…と間隔を広げます。自分で思い出す練習が最優先。</p><button class="btn btn-lg" data-action="startReview">${dueTopics().length?`今日の ${dueTopics().length} 問を復習 →`:'登録済みカードを練習 →'}</button><div class="hero-metrics"><span><b>${reviewedToday()}</b> 本日の回答</span><span><b>${dailyReviews().length}</b> 直近7日の回答</span></div></div>
<div class="panel panel-pad"><div class="section-title">学習カバレッジ <small>${progress}%</small></div><p class="muted" style="font-size:12px">${ready} / ${total} 理論に回答を登録</p><div class="progress-wrap"><div class="progress-fill" style="width:${progress}%"></div></div><p class="tiny">※登録率は暗記達成率ではありません。</p><div class="ruleline"></div><div class="section-title" style="font-size:13px">次に復習する論点</div>${next.length?next.map(t=>`<div class="audit-item"><span>${esc(t.title)}</span><button data-action="openTopic" data-id="${t.id}" class="link-btn">開く ›</button></div>`).join(''):'<p class="muted" style="font-size:12px">期限内のカードはありません。</p>'}<div class="mt12"><button class="link-btn" data-page="analytics">復習予定を見る →</button></div></div></div>
<div class="spaced mb20"><h2 class="section-title mb0">試験範囲マップ <small>10分野・${total}論点の学習用チェックリスト</small></h2><button class="link-btn" data-page="theory">一覧へ →</button></div>${areaTiles()}
<div class="callout ${!last||last<dateAdd(-7)?'warning':''}"><b>${!last||last<dateAdd(-7)?'バックアップを忘れずに':'バックアップ記録あり'}：</b>${last?`前回 ${esc(last)}。`:'まだバックアップしていません。'} Safari・ホーム画面アプリ・別端末は同じデータとは限りません。<button class="link-btn" data-page="data">データを保存する →</button></div>`}
function theory(){if(S.detailId)return topicDetail(S.detailId);let list=S.topics.filter(t=>(S.area==='all'||t.area===S.area)&&(!S.query||[t.title,t.area,t.law,t.question,t.summary].some(v=>String(v||'').toLowerCase().includes(S.query.toLowerCase()))));return `${intro('THEORY LIBRARY','理論をつなげて、覚える。','学習範囲の一覧。未入力の論点は教材画像を追加して暗記カードに育てます。',`<button class="btn btn-primary btn-sm" data-action="newTopic">＋ 理論追加</button>`)}<div class="toolbar"><div class="filters"><input id="theorySearch" class="input search" placeholder="論点・条文・キーワードで検索" value="${esc(S.query)}"><select class="select" id="areaFilter"><option value="all">すべての分野</option>${CURRICULUM.map(a=>`<option value="${esc(a.name)}" ${S.area===a.name?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div><span class="tiny">${list.length} 件表示 / 未作成 ${countPending()} 件</span></div><div class="topics-list">${list.map(t=>`<button class="topic-card" data-action="openTopic" data-id="${t.id}"><span class="bullet ${t.srs?.enabled?(t.srs.due<=today()?'due':'ready'):''}"></span><span class="topic-meta"><b>${esc(t.title)}</b><small>${esc(t.area)} ${t.law?' · '+esc(t.law):''} ${S.assets.filter(a=>a.itemId===t.id).length?' · 📷 教材あり':''}</small></span><span class="right">${dueLabel(t)} <span style="color:#9eacb6">›</span></span></button>`).join('')||'<div class="empty">該当する論点がありません</div>'}</div>`}
function photoUrl(a){if(!S.photoUrl.has(a.id))S.photoUrl.set(a.id,URL.createObjectURL(a.blob));return S.photoUrl.get(a.id)}
function photoHTML(itemId){let assets=S.assets.filter(a=>a.itemId===itemId);return assets.length?`<div class="photo-gallery">${assets.map(a=>`<div class="photo-thumb"><img data-action="zoomPhoto" data-id="${a.id}" src="${photoUrl(a)}" alt="${esc(a.name||'教材画像')}"><button class="photo-remove" title="画像を削除" data-action="removePhoto" data-id="${a.id}">×</button></div>`).join('')}</div>`:'<p class="muted" style="font-size:12px">まだ画像がありません。iPhoneで撮影・写真から追加できます。</p>'}
function topicDetail(id){let t=S.topics.find(x=>x.id===id);if(!t)return '<div class="empty">論点が見つかりません</div>';const related=S.questions.filter(q=>q.topicId===id);return `<div class="detail-head"><button class="back-link" data-action="backTheory">← 理論一覧</button>${chip(t.area)}</div><div class="spaced mb20"><div><h1 class="detail-title">${esc(t.title)}</h1><div class="flex">${sourceFlag(t)} ${dueLabel(t)} ${t.law?chip(t.law,'blue'):''}</div></div><button class="btn btn-primary btn-sm" data-action="editTopic" data-id="${id}">編集する</button></div><div class="detail-layout"><div class="detail-cols"><section class="panel panel-pad"><div class="section-title">理解のポイント</div><p class="readable">${esc(t.summary||'要点はまだ登録されていません。教材画像を登録し、ChatGPTで整理した内容を追加してください。')}</p><div class="ruleline"></div><div class="section-title">暗記・説明できる？</div><div class="question-box">${esc(t.question||t.title+'について説明せよ。')}</div>${t.answer?`<div class="mt12"><button class="btn btn-secondary btn-sm" data-action="toggleDetailAnswer">${S.revealed?'解答を隠す':'解答を表示'}</button>${S.revealed?`<button class="btn btn-line btn-sm" data-action="toggleCloze">${S.clozeMode?'全文表示':'穴埋めにする'}</button>`:''}</div>${S.revealed?`<div class="answer-box">${esc(S.clozeMode?maskKeywords(t.answer,t.keywords):t.answer)}</div>`:''}`:'<p class="warning-inline">解答未登録。教材と照合して解答を追加すると復習を開始できます。</p>'}${t.keywords?.length?`<div class="mt20"><b style="font-size:12px">採点キーワード</b><div class="keyword-list">${t.keywords.map(k=>`<span class="kw">${esc(k)}</span>`).join('')}</div></div>`:''}${t.notes?`<div class="ruleline"></div><b style="font-size:12px">補足メモ</b><p class="readable">${esc(t.notes)}</p>`:''}</section>
<section class="panel panel-pad"><div class="section-title">関連演習 <small>${related.length}問</small></div>${related.map(q=>`<div class="audit-item"><span>${esc(q.title)}</span><button class="link-btn" data-action="openQuestion" data-id="${q.id}">解く →</button></div>`).join('')||'<p class="muted" style="font-size:12px">まだ関連問題がありません。</p>'}<div class="mt12"><button class="btn btn-line btn-sm" data-action="newPracticeFromTopic" data-id="${t.id}">＋ この論点の演習を作成</button></div></section>
<section class="panel panel-pad"><div class="section-title">元の理論テキスト画像</div>${photoHTML(t.id)}<div class="mt12"><label class="upload-zone"><input type="file" accept="image/*" multiple data-upload-for="${t.id}"><b>＋ 写真を追加・撮影する</b><small>複数画像可／端末内に保存／オンラインOCRは別操作</small></label></div>${S.assets.some(a=>a.itemId===id)?`<button class="btn btn-line btn-sm mt12" data-action="ocrTopic" data-id="${id}">画像から文字起こし（オンライン・任意）</button>`:''}</section></div>
<aside class="detail-side"><div class="panel panel-pad"><div class="section-title">記憶の状態</div><div class="detail-kv"><span>復習回数</span><strong>${t.srs?.history||0} 回</strong></div><div class="detail-kv"><span>連続定着</span><strong>${t.srs?.streak||0} ステップ</strong></div><div class="detail-kv"><span>次回復習</span><strong>${t.srs?.due?esc(t.srs.due):'未設定'}</strong></div><button class="btn btn-primary" style="width:100%" data-action="singleReview" data-id="${t.id}" ${!t.answer?.trim()?'disabled':''}>この理論を暗記テスト</button><div class="mt12"><button class="btn btn-line btn-sm" style="width:100%" data-action="toggleSchedule" data-id="${t.id}">${t.srs?.enabled?'復習スケジュールを一時停止':'復習を有効にする'}</button></div></div><div class="panel panel-pad mt12"><div class="section-title">出典・年度確認</div><div class="warning-inline">${LAW_NOTICE}</div><div class="detail-kv"><span>教材区分</span><strong>${t.origin==='original-starter'?'アプリ内独自要約':t.origin==='curriculum-outline'?'論点一覧':'ユーザー取込'}</strong></div>${safeHref(t.sourceUrl)?`<a class="pill-link" target="_blank" rel="noopener noreferrer" href="${safeHref(t.sourceUrl)}">登録された出典を開く ↗</a>`:`<span class="tiny">出典未登録</span>`}</div></aside></div>`}
function reviewPage(){
 if(S.session) return reviewSession();
 const due=dueTopics(),ready=readyTopics(),weak=ready.filter(t=>(t.srs?.streak||0)<2);
 const nextDays=Array.from({length:8},(_,i)=>({day:dateAdd(i),n:S.topics.filter(t=>t.srs?.enabled&&t.answer?.trim()&&t.srs.due===dateAdd(i)).length}));
 return `${intro('SPACED REPETITION','今日の復習','問題を見て先に思い出し、答えを確認してから記憶の状態を自己評価します。')}
 <div class="grid-stats"><div class="panel stat good"><div class="label">今日期限のカード</div><div class="value">${due.length}</div><div class="hint">遅れているカードも含む</div></div><div class="panel stat"><div class="label">暗記できるカード</div><div class="value">${ready.length}</div><div class="hint">解答登録済み</div></div><div class="panel stat"><div class="label">苦手・学習初期</div><div class="value">${weak.length}</div><div class="hint">連続定着2回未満</div></div><div class="panel stat"><div class="label">今日の回答</div><div class="value">${reviewedToday()}</div><div class="hint">一日目標 ${S.settings.dailyGoal}回</div></div></div>
 <div class="layout-two"><section class="panel panel-pad"><h2 class="section-title">今すぐ学習</h2><div class="action-stack"><button class="btn btn-primary" data-action="startReview">今日期限のカードを復習 ${due.length}問 →</button><button class="btn btn-line" data-action="startWeak" ${!weak.length?'disabled':''}>苦手カードを集中特訓 →</button><button class="btn btn-line" data-action="startAll" ${!ready.length?'disabled':''}>登録済み理論からランダム練習 →</button></div><p class="tiny mt12">忘れた→翌日、曖昧→翌日、覚えた→1・3・7・14・30日…、簡単→3日から。学習履歴によって次回の日付を更新します。</p></section>
 <section class="panel panel-pad"><h2 class="section-title">復習予定 <small>今日から8日間</small></h2><div class="bars">${nextDays.map(o=>`<div class="barline"><span>${o.day===today()?'今日':jpDay(o.day)}</span><div class="bartrack"><div style="width:${Math.min(100,o.n/Math.max(1,...nextDays.map(v=>v.n))*100)}%"></div></div><b>${o.n}問</b></div>`).join('')}</div><p class="tiny mt12">未登録の理論は予定に入りません。期限切れは「今日期限」に含みます。</p></section></div>
 <section class="panel panel-pad mt20"><h2 class="section-title">今日やるべき理論</h2>${due.length?due.slice(0,15).map(t=>`<div class="audit-item"><span>${esc(t.title)} <small class="muted">(${esc(t.area)})</small></span><button class="link-btn" data-action="singleReview" data-id="${t.id}">復習 →</button></div>`).join(''):'<div class="empty">今日期限のカードはありません。新しい理論を登録してみましょう。</div>'}</section>`;
}
function reviewSession(){
 let ss=S.session, t=S.topics.find(x=>x.id===ss.ids[ss.index]);
 if(!t) return `<div class="review-finish"><div class="bigicon">✓</div><h2>${ss.count}問の復習を完了しました</h2><p class="muted">今日の記憶を翌日以降につなげましょう。</p><button class="btn btn-primary" data-action="closeSession">復習トップに戻る</button></div>`;
 const pct=Math.floor(ss.index*100/ss.ids.length);
 return `${intro('ACTIVE RECALL','思い出してから、答えを見る','まず自分の言葉で口頭または紙に書いてください。')}
 <div class="card-review"><div class="flex mb20"><button class="btn btn-sm ${S.reviewMode==='flash'?'btn-primary':'btn-line'}" data-action="setReviewMode" data-mode="flash">通常カード</button><button class="btn btn-sm ${S.reviewMode==='cloze'?'btn-primary':'btn-line'}" data-action="setReviewMode" data-mode="cloze">重要語句を穴埋め</button></div><div class="spaced"><span class="tiny">${ss.index+1} / ${ss.ids.length}問</span><button class="link-btn" data-action="closeSession">終了する</button></div><div class="review-progress"><div style="width:${pct}%"></div></div><div class="review-stage"><div class="review-top"><span>${chip(t.area)}</span>${chip(t.law||'理論問題','blue')}</div>
 <div class="review-body"><p class="eyebrow">${esc(t.title)} · ${S.reviewMode==='cloze'?'穴埋めで重要語句を再現':'理論の全体を説明'}</p><h2 class="${S.reviewMode==='cloze'?'cloze-text':''}">${esc(S.reviewMode==='cloze'&&t.keywords?.length?maskKeywords(t.answer,t.keywords):t.question||t.title+'の要件と効果を説明せよ。')}</h2><span class="hint">${S.revealed?'採点キーワード・解答と照らし合わせましょう':'答えを見ずに思い出してから「解答を表示」'}</span></div>
 ${S.revealed?`<div class="review-answer"><h4>確認用の解答</h4><p class="readable">${esc(t.answer)}</p><div class="keyword-list">${(t.keywords||[]).map(k=>`<span class="kw">${esc(k)}</span>`).join('')}</div><p class="tiny">暗記用の独自要約です。実際の条文要件は教材と照合してください。</p></div><div class="review-actions">${[['0','忘れた','明日'],['1','曖昧','明日'],['2','覚えた','間隔を拡大'],['3','簡単','さらに拡大']].map(([g,l,sub],i)=>`<button class="grade-btn ${i===0?'again':i===3?'easy':''}" data-action="grade" data-grade="${g}"><b>${l}</b><small>${sub}</small></button>`).join('')}</div>`:`<div class="review-actions" style="grid-template-columns:1fr"><button class="btn btn-primary" data-action="revealReview">解答を表示する</button></div>`}
 </div></div>`;
}
function practice(){
 if(S.questionId)return questionDetail(S.questionId);
 let qs=S.questions.filter(q=>q.kind==='practice');
 return `${intro('PRACTICE','論点別演習','覚えた理論を、実際に書ける答案へ。AI生成問題を追加する場合も出題区分を明示します。',`<button class="btn btn-primary btn-sm" data-action="newQuestion" data-kind="practice">＋ 演習を追加</button>`)}
 <div class="panel panel-pad"><div class="spaced"><h2 class="section-title">オリジナル演習 <small>${qs.length}問</small></h2>${chip('模範解答・公式採点ではありません','yellow')}</div>
 ${qs.map(q=>`<div class="audit-item"><span><b>${esc(q.title)}</b><br><small class="muted">${esc(q.area||'その他')} · ${q.attempts?.length||0}回解答</small></span><button class="btn btn-line btn-sm" data-action="openQuestion" data-id="${q.id}">演習する →</button></div>`).join('')||'<div class="empty">演習がありません。右上から追加できます。</div>'}</div>`;
}
function questionDetail(id){
 let q=S.questions.find(x=>x.id===id);if(!q)return '<div class="empty">問題が見つかりません</div>';
 let t=S.topics.find(x=>x.id===q.topicId), text=S.answer||'', hits=(q.keywords||[]).map(k=>({k,yes:normalize(text).includes(normalize(k))})), n=hits.filter(v=>v.yes).length;
 return `<div class="detail-head"><button class="back-link" data-action="backQuestions">← ${q.kind==='past'?'過去問':'演習'}一覧</button>${chip(q.kind==='past'?`${q.year||'年不明'}年の過去問（入力済み）`:'オリジナル演習','blue')}</div>
 ${intro('WRITE YOUR ANSWER',q.title,q.area||'論点別演習',`<button class="btn btn-line btn-sm" data-action="editQuestion" data-id="${q.id}">問題を編集</button>`)}
 <div class="layout-two"><section class="panel panel-pad"><div class="section-title">問題文</div><p class="readable question-box">${esc(q.question||'問題文は未登録です。')}</p>
 <div class="practice-timer"><span>20分の記述トレーニング</span>${S.practiceTimer?.questionId===q.id?`<strong class="timer" id="practiceCountdown"></strong><button class="btn btn-line btn-sm" data-action="stopPracticeTimer">タイマー終了</button>`:`<button class="btn btn-line btn-sm" data-action="startPracticeTimer" data-id="${q.id}">20分計測を開始</button>`}</div>
 <label class="label-field mt20">自分の解答を入力<textarea id="answerText" class="textarea answer-editor" placeholder="まず参考解答を見ずに、要件・効果・例外を記述してください">${esc(text)}</textarea></label>
 <div class="flex"><button class="btn btn-primary" data-action="showQuestionAnswer">解答と照合する</button><button class="btn btn-line" data-action="clearAnswer">解答を消す</button></div>
 <div class="ruleline"></div><h3 class="section-title">問題・教材の画像</h3>${photoHTML(q.id)}<label class="upload-zone mt12" style="display:block"><input type="file" accept="image/*" multiple data-upload-for="${q.id}"><b>＋ この問題の写真を追加する</b><small>問題や自分の答案の写真を保存できます</small></label>${q.ocrText?`<p class="tiny mt12">文字起こし（未検証）：${esc(q.ocrText)}</p>`:''}
 ${S.answerShown?`<div class="answer-box"><b>照合用の参考解答</b><p>${esc(q.answer||'解答は未登録です')}</p></div><div class="mt20"><h3 class="section-title">キーワード確認 <small>${n}/${hits.length}</small></h3><div class="essay-keywords">${hits.map(x=>`<span class="checkkw ${x.yes?'hit':''}">${x.yes?'✓':'○'} ${esc(x.k)}</span>`).join('')||'<span class="tiny">採点要素は未登録です。</span>'}</div><p class="tiny">単純な文字列一致による参考チェックです。類義語、否定、論理関係や答案の正しさを判定しません。</p><div class="mt12 flex"><button class="btn btn-primary btn-sm" data-action="saveAttempt" data-grade="3">理解できた</button><button class="btn btn-line btn-sm" data-action="saveAttempt" data-grade="2">一部不足</button><button class="btn btn-line btn-sm" data-action="saveAttempt" data-grade="0">復習が必要</button></div></div>`:''}
 </section><aside class="panel panel-pad"><div class="section-title">問題の情報</div><div class="detail-kv"><span>関連理論</span><strong>${esc(t?.title||'未関連付け')}</strong></div>${t?`<button class="btn btn-line btn-sm" data-action="openTopic" data-id="${t.id}">関連理論を見る →</button>`:''}<div class="ruleline"></div><div class="detail-kv"><span>演習回数</span><strong>${q.attempts?.length||0}回</strong></div><div class="detail-kv"><span>教材の種類</span><strong>${q.kind==='past'?'過去問・ユーザー登録':'独自演習'}</strong></div><p class="tiny">${q.kind==='past'?'実際の問題文・出題年度が正しいか、ご自身で公式PDFを確認してください。':'初期問題は学習用に独自に作成したもので、本試験問題ではありません。'}</p>${safeHref(q.sourceUrl)?`<a class="pill-link" href="${safeHref(q.sourceUrl)}" target="_blank" rel="noopener noreferrer">出典を開く ↗</a>`:''}</aside></div>`;
}
function past(){
 const year=PAST_YEARS.find(v=>v.year===S.pastYear)||PAST_YEARS[0], q=S.questions.filter(x=>x.kind==='past'&&Number(x.year)===S.pastYear);
 if(S.questionId)return questionDetail(S.questionId);
 return `${intro('PAST PAPERS','過去問・本試験演習','公式問題を年度別に確認し、書いた答案と関連理論を記録します。',`<button class="btn btn-primary btn-sm" data-action="newQuestion" data-kind="past">＋ 過去問を登録</button>`)}
 <div class="panel panel-pad"><h2 class="section-title">公式の過去問を開く</h2><div class="filters">${PAST_YEARS.map(p=>`<button class="btn ${p.year===S.pastYear?'btn-primary':'btn-line'} btn-sm" data-action="selectYear" data-year="${p.year}">${p.year}</button>`).join('')}</div><div class="ruleline"></div><h3>${esc(year.label)}</h3><p class="muted">国税庁公式ページでは国税徴収法の問題PDFと答案用紙を開けます。出題ポイントは正答例の全文ではありません。</p><div class="flex"><a class="btn btn-primary btn-sm" href="${safeHref(year.page)}" target="_blank" rel="noopener noreferrer">国税庁の問題・答案用紙 ↗</a><a class="btn btn-line btn-sm" href="${safeHref(year.point||OFFICIAL_PORTAL)}" target="_blank" rel="noopener noreferrer">出題のポイント ↗</a><button class="btn btn-line btn-sm" data-action="copyQuestionPrompt">画像→過去問JSONの指示文をコピー</button></div></div>
 <div class="layout-two mt20"><section class="panel panel-pad"><h2 class="section-title">${S.pastYear}年 登録済みの問題 <small>${q.length}問</small></h2>${q.length?q.map(x=>`<div class="audit-item"><span>${esc(x.title)}<br><span class="tiny">${esc(x.area||'分野未設定')} · ${x.attempts?.length||0}回解答</span></span><button class="link-btn" data-action="openQuestion" data-id="${x.id}">解く →</button></div>`).join(''):'<p class="muted">この年度の問題文はまだ登録されていません。公式PDFを参照し、問題と採点要素を追加できます。</p>'}<button class="btn btn-line btn-sm mt12" data-action="newQuestion" data-kind="past">＋ この年度の問題を登録</button></section>
 <section class="panel panel-pad"><h2 class="section-title">120分 本試験タイマー</h2><p>問題PDFを別タブで表示して、本試験形式の記述演習を行います。終了時に答案と学習時間を記録できます。</p>${S.examTimer?`<p class="timer active" id="examCountdown"></p><label class="label-field">答案メモ<textarea id="examAnswer" class="textarea answer-editor" placeholder="記述した答案の要点を記録">${esc(S.examTimer.answer||'')}</textarea></label><button class="btn btn-primary" data-action="finishExam">演習を終了して記録</button>`:`<button class="btn btn-primary" data-action="startExam">120分演習を開始</button>`}<p class="tiny mt12">過去問本文は無断転載せず、公式ページへのリンクを使用しています。</p></section></div>`;
}
function materials(){
 const unassigned=S.assets.filter(a=>!a.itemId), topicsWith=S.assets.filter(a=>a.itemId);
 return `${intro('IMPORT & MATERIALS','学習データを追加する','ChatGPTで作成した理論・演習JSONをそのまま取り込みます。画像の保存は任意です。')}
 <section class="panel panel-pad mb20"><h2 class="section-title">① ChatGPTの生成JSONを一括登録</h2>
 <p class="muted">理論テキストをChatGPTに添付 → 専用プロンプトでJSONを作成 → 下に貼り付け。理論・記述演習を同時登録できます。</p>
 <div class="flex"><button class="btn btn-line btn-sm" data-action="copyPrompt">① 作成用プロンプトをコピー</button></div>
 <label class="label-field mt12">② ChatGPTの回答（JSON）を貼り付ける<textarea id="topicJson" class="textarea" rows="8" placeholder='{"topics":[{"area":"差押え","title":"論点名","summary":"趣旨と要点","question":"確認問題","answer":"自分の言葉で書いた結論","keywords":["要件"]}],"questions":[]}'></textarea></label>
 <label class="label-field mt12">または生成済みのJSONファイルを選ぶ<input class="input" id="topicJsonFile" type="file" accept=".json,application/json,text/plain"></label>
 <div class="flex mt12"><button class="btn btn-line btn-sm" data-action="previewTopics">③ 内容と重複を確認</button><button class="btn btn-primary btn-sm" data-action="importTopics">④ 理論・問題を登録</button></div>
 <p class="tiny mt12">同名の理論は更新され、復習履歴は維持されます。登録データには「要照合」が付きます。インポート後にJSONバックアップを保存してください。</p></section>
 <div class="layout-two"><section class="panel panel-pad"><h2 class="section-title">画像を取り込む</h2><label class="label-field">関連する論点・問題<select class="select" id="uploadTopic"><option value="">未分類として保存</option>${S.topics.map(t=>`<option value="${t.id}">理論 / ${esc(t.title)}</option>`).join('')}${S.questions.map(q=>`<option value="${q.id}">問題 / ${esc(q.title)}</option>`).join('')}</select></label><label class="upload-zone" style="display:block"><input id="globalUpload" type="file" accept="image/*" multiple><b>＋ 写真を選ぶ・カメラで撮影</b><small>複数画像を一度に追加できます。画像は圧縮してこの端末内に保存します。</small></label><div class="warning-inline">教材を読み込んでも画像から条文を自動登録するわけではありません。「文字起こし」または「ChatGPT用プロンプト」を使って確認しながら入力します。</div><button class="btn btn-line btn-sm" data-action="copyPrompt">ChatGPT用プロンプトをコピー</button></section>
 <section class="panel panel-pad"><h2 class="section-title">画像の保存状況</h2><div class="grid-stats" style="grid-template-columns:repeat(2,1fr)"><div class="stat"><div class="label">保存画像</div><div class="value">${S.assets.length}</div></div><div class="stat"><div class="label">未分類</div><div class="value">${unassigned.length}</div></div></div><p class="muted">画像の保存先はブラウザのIndexedDBです。Safariのデータ消去や他の端末には引き継がれません。画像入りJSONバックアップを必ず保存してください。</p><button class="btn btn-line btn-sm" data-page="data">バックアップへ →</button></section></div>
 <div class="panel panel-pad mt20"><h2 class="section-title">登録済み画像 <small>${S.assets.length}枚</small></h2>${S.assets.length?`<div class="material-grid">${S.assets.slice().reverse().map(a=>`<div class="material-item"><img data-action="zoomPhoto" data-id="${a.id}" src="${photoUrl(a)}" alt="${esc(a.name)}"><div class="material-info"><b>${esc(a.name||'教材画像')}</b><small>${esc(S.topics.find(t=>t.id===a.itemId)?.title||S.questions.find(q=>q.id===a.itemId)?.title||'未分類')} · ${new Date(a.createdAt).toLocaleDateString('ja-JP')}</small><div class="flex"><button class="link-btn" data-action="assignPhoto" data-id="${a.id}">論点を変更</button><button class="link-btn" data-action="ocrPhoto" data-id="${a.id}">文字起こし</button><button class="link-btn danger-text" data-action="removePhoto" data-id="${a.id}">削除</button></div></div></div>`).join('')}</div>`:'<div class="empty">まだ画像がありません。理論テキストの写真を追加してください。</div>'}</div>`;
}
function analytics(){
 const all=S.topics.filter(t=>t.answer?.trim()), due=dueTopics(), rev=S.reviews, last7=Array.from({length:7},(_,i)=>dateAdd(i-6));let mature=all.filter(t=>(t.srs?.streak||0)>=4).length;
 return `${intro('STUDY INSIGHTS','学習分析・復習予定','登録率と暗記定着を区別し、間違えた論点に時間を集中させます。')}
 <div class="grid-stats"><div class="panel stat"><div class="label">学習用チェックリスト</div><div class="value">${S.topics.length}</div><div class="hint">試験範囲の完全保証ではありません</div></div><div class="panel stat"><div class="label">解答登録済み</div><div class="value">${all.length}</div><div class="hint">暗記完了とは別</div></div><div class="panel stat"><div class="label">定着ステップ4以上</div><div class="value">${mature}</div><div class="hint">連続して自己評価できた論点</div></div><div class="panel stat good"><div class="label">現在の復習待ち</div><div class="value">${due.length}</div></div></div>
 <div class="layout-two"><section class="panel panel-pad"><h2 class="section-title">分野ごとの登録状況</h2><div class="bars">${CURRICULUM.map(a=>{let x=S.topics.filter(t=>t.area===a.name),n=x.filter(t=>t.answer?.trim()).length;return `<div class="barline"><span>${esc(a.short)}</span><div class="bartrack"><div style="width:${x.length?Math.round(n*100/x.length):0}%"></div></div><b>${n}/${x.length}</b></div>`}).join('')}</div><p class="tiny mt12">カバーした理論数であって合格可能性・習熟率ではありません。</p></section>
 <section class="panel panel-pad"><h2 class="section-title">直近7日間の復習回数</h2><div class="bars">${last7.map(d=>{let n=rev.filter(r=>r.day===d).length;return `<div class="barline"><span>${jpDay(d)}</span><div class="bartrack"><div style="width:${Math.round(n*100/Math.max(1,...last7.map(day=>rev.filter(r=>r.day===day).length)))}%"></div></div><b>${n}</b></div>`}).join('')}</div><div class="ruleline"></div><p class="muted">最近の復習 ${rev.length}件 / 記述演習 ${S.questions.reduce((n,q)=>n+(q.attempts?.length||0),0)}件</p></section></div>
 <section class="panel panel-pad mt20"><h2 class="section-title">復習が必要な理論</h2>${due.length?due.slice(0,20).map(t=>`<div class="audit-item"><span>${esc(t.title)} ${dueLabel(t)}</span><button class="link-btn" data-action="singleReview" data-id="${t.id}">今すぐ復習</button></div>`).join(''):'<p class="muted">期限切れはありません。</p>'}</section>`;
}
function dataPage(){return `${intro('DATA & SETTINGS','設定とバックアップ','復習記録や画像を失わないよう、定期的に完全バックアップを作成してください。')}
 <div class="settings-grid"><section class="panel panel-pad"><h2 class="section-title">学習設定</h2><form id="settingsForm"><label class="label-field">目標試験日（正式日程判明後に入力）<input name="goal" type="date" class="input" value="${esc(S.settings.goal||'')}"></label><label class="label-field">1日の復習目標（回）<input name="dailyGoal" class="input" type="number" min="1" max="200" value="${S.settings.dailyGoal||15}"></label><button class="btn btn-primary btn-sm" type="submit">設定を保存</button></form><div class="ruleline"></div><p class="tiny">2027年度の適用法令や本試験日程は国税庁の公式発表で確認してください。</p><a class="pill-link" href="${OFFICIAL_PORTAL}" target="_blank" rel="noopener noreferrer">国税庁・税理士試験 ↗</a><div class="mt12"><a class="pill-link" href="https://www.nta.go.jp/about/organization/ntc/kohon/tyousyu/pdf/all.pdf" target="_blank" rel="noopener noreferrer">税務大学校「国税徴収法 基礎編」令和7年度版（無料PDF）↗</a><p class="tiny">旧年度版です。2027年本試験の適用法令とは相違する可能性があります。</p></div></section>
 <section class="panel panel-pad"><h2 class="section-title">データを守る</h2><div class="backup-alert">このアプリはアカウント・クラウド同期を持ちません。Safariとホーム画面アプリで別データになり得ます。画像も含めてバックアップし、同じ画面から復元してください。</div><button class="btn btn-primary" data-action="exportBackup">⬇ 画像も含む全データを保存</button><p class="tiny">前回の出力：${esc(S.settings.lastBackup||'なし')}。端末に保存したことを保証する表示ではありません。</p><div class="ruleline"></div><label class="label-field">バックアップから復元（現在データを置換）<input id="restoreInput" class="input" type="file" accept=".json,application/json"></label><p class="tiny">復元前にもバックアップを取ってください。</p></section></div>
 <div class="settings-grid mt20"><section class="panel panel-pad"><h2 class="section-title">ChatGPTの論点JSONを追加</h2><p class="muted">写真をChatGPTで整理した topics / questions 形式のJSONを取り込めます。同名の既存論点は更新されます。</p><textarea id="topicJson" class="textarea" rows="7" placeholder='{"topics":[{"area":"差押え","title":"差押えの解除","summary":"...","question":"...","answer":"...","keywords":["..."]}],"questions":[]}'></textarea><button class="btn btn-primary btn-sm mt12" data-action="importTopics">論点JSONを取り込む</button><button class="btn btn-line btn-sm mt12" data-action="copyPrompt">作成用プロンプトをコピー</button></section>
 <section class="panel panel-pad"><h2 class="section-title">使い方と安全性</h2><div class="steps"><div>理論写真を追加して論点へ関連付ける。</div><div>AIで理解・要約したら教材と照合し、答えと重要語句を登録する。</div><div>「今日の復習」で思い出し、忘れた論点を翌日復習する。</div><div>論点別演習で記述し、過去問を公式サイトで解く。</div><div>学習のたびにJSONバックアップを保存する。</div></div><p class="warning-inline">法令・条数・数値はAIの出力だけで確定しないでください。年度の異なる問題は当時の適用法令も確認してください。</p></section></div>
 <div class="panel panel-pad mt20"><div class="spaced"><h2 class="section-title">データ初期化</h2><button class="btn btn-danger btn-sm" data-action="resetAll">すべて消去</button></div><p class="tiny">理論・演習・画像・学習履歴・設定が削除されます。取り消し不可。</p></div>`}
function render(){
 updateNav();const fn={home,review:reviewPage,theory,practice,past,materials,analytics,data:dataPage}[S.page]||home;
 try{$('#view').innerHTML=fn()}catch(e){console.error(e);$('#view').innerHTML=`<div class="empty">画面を表示できませんでした。${esc(e.message)}</div>`}
 if(S.examTimer||S.practiceTimer)updateTimer();
}
const safeHref=s=>{try{let u=new URL(s);return /^https?:$/.test(u.protocol)?esc(u.href):''}catch{return ''}};
function modal(content){$('#modalBody').innerHTML=content;$('#modalLayer').classList.remove('hidden');document.body.style.overflow='hidden'}
function closeModal(){$('#modalLayer').classList.add('hidden');$('#modalBody').innerHTML='';document.body.style.overflow=''}
function modalHeader(title){return `<div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-action="closeModal" aria-label="閉じる">×</button></div>`}
function topicEditor(id){
 const t=S.topics.find(x=>x.id===id)||{title:'',area:CURRICULUM[0].name,law:'',summary:'',question:'',answer:'',keywords:[],notes:'',rawText:'',sourceLabel:'',sourceUrl:'',verification:'not-checked'};
 modal(`${modalHeader(id?'理論を編集':'新しい理論を追加')}<form id="topicForm" data-id="${id||''}">
 <div class="form-columns"><label class="label-field">理論名 *<input class="input" name="title" required value="${esc(t.title)}"></label><label class="label-field">分野<select name="area" class="select">${[...new Set([...CURRICULUM.map(a=>a.name),...S.topics.map(x=>x.area)])].map(a=>`<option value="${esc(a)}" ${t.area===a?'selected':''}>${esc(a)}</option>`).join('')}</select></label></div>
 <div class="form-columns"><label class="label-field">条文番号<input class="input" name="law" placeholder="例：第79条" value="${esc(t.law||'')}"></label><label class="label-field">出典名<input class="input" name="sourceLabel" placeholder="教材ページ・版など" value="${esc(t.sourceLabel||'')}"></label></div>
 <label class="label-field">出典URL（任意）<input class="input" name="sourceUrl" type="url" placeholder="https://..." value="${esc(t.sourceUrl||'')}"></label>
 <label class="label-field">理解のポイント<textarea class="textarea" name="summary" placeholder="なぜその制度があるか、具体例など">${esc(t.summary||'')}</textarea></label>
 <label class="label-field">暗記の問い<textarea class="textarea" name="question" placeholder="発動条件・要件・効果・例外を説明せよ">${esc(t.question||'')}</textarea></label>
 <label class="label-field">暗記する解答<textarea class="textarea" name="answer" rows="5" placeholder="自分で照合した短い解答">${esc(t.answer||'')}</textarea></label>
 <label class="label-field">重要キーワード（読点または改行区切り）<input class="input" name="keywords" value="${esc((t.keywords||[]).join('、'))}"></label>
 <label class="label-field">教材の文字起こし（未検証の原文メモ。直接採点に使用しません）<textarea class="textarea" rows="4" name="rawText">${esc(t.rawText||'')}</textarea></label>
 <label class="label-field">復習用メモ<textarea class="textarea" name="notes">${esc(t.notes||'')}</textarea></label>
 <label class="label-field">照合状態<select name="verification" class="select"><option value="not-checked" ${t.verification==='not-checked'?'selected':''}>未確認・確認が必要</option><option value="user-checked" ${t.verification==='user-checked'?'selected':''}>本人が教材と照合済み</option><option value="source-checked-older" ${t.verification==='source-checked-older'?'selected':''}>旧年度の出典あり（2027年要確認）</option></select></label>
 <div class="modal-actions">${id&&String(id).startsWith('custom_')?`<button type="button" class="btn btn-danger btn-sm" data-action="deleteTopic" data-id="${id}">削除</button>`:''}<button type="button" class="btn btn-line" data-action="closeModal">キャンセル</button><button type="submit" class="btn btn-primary">保存して学習する</button></div></form>`);
}
function questionEditor(id,kind){
 const q=S.questions.find(x=>x.id===id)||{kind:kind||'practice',year:S.pastYear,title:'',question:'',answer:'',keywords:[],area:CURRICULUM[0].name,topicId:'',sourceUrl:''};
 modal(`${modalHeader(id?'問題の編集':'問題を追加')}<form id="questionForm" data-id="${id||''}"><div class="form-columns"><label class="label-field">問題の種類<select name="kind" class="select"><option value="practice" ${q.kind==='practice'?'selected':''}>独自演習（AI作成含む）</option><option value="past" ${q.kind==='past'?'selected':''}>過去の本試験問題（本人入力）</option></select></label><label class="label-field">出題年（過去問のみ）<select name="year" class="select">${PAST_YEARS.map(y=>`<option value="${y.year}" ${Number(q.year)===y.year?'selected':''}>${y.year}</option>`).join('')}</select></label></div>
 <label class="label-field">問題タイトル *<input class="input" name="title" required value="${esc(q.title||'')}"></label><label class="label-field">関連する理論<select class="select" name="topicId"><option value="">関連付けない</option>${S.topics.map(t=>`<option value="${t.id}" ${t.id===q.topicId?'selected':''}>${esc(t.title)}</option>`).join('')}</select></label>
 <label class="label-field">問題文<textarea class="textarea" rows="5" name="question" required>${esc(q.question||'')}</textarea></label><label class="label-field">確認用の解答・採点要素<textarea class="textarea" rows="5" name="answer">${esc(q.answer||'')}</textarea></label><label class="label-field">重要キーワード（読点区切り）<input class="input" name="keywords" value="${esc((q.keywords||[]).join('、'))}"></label><label class="label-field">出典URL<input class="input" name="sourceUrl" type="url" value="${esc(q.sourceUrl||'')}"></label><div class="modal-actions"><button type="button" class="btn btn-line" data-action="closeModal">キャンセル</button><button type="submit" class="btn btn-primary">問題を保存</button></div></form>`);
}
function normalize(s){return String(s||'').normalize('NFKC').replace(/[\s\u3000、。・!！?？,，.．「」（）()]/g,'').toLowerCase()}
function parseKeywords(v){return [...new Set(String(v||'').split(/[、,，\n]/).map(x=>x.trim()).filter(Boolean))]}
function startReview(ids){
 let active=ids.filter(id=>S.topics.some(t=>t.id===id&&t.answer?.trim()));
 if(!active.length){message('まず理論に解答を登録してください');page('theory');return}
 S.page='review';S.session={ids:active,index:0,count:0};S.revealed=false;render();window.scrollTo(0,0)
}
async function rateReview(g){
 const ss=S.session;if(!ss)return;let t=S.topics.find(x=>x.id===ss.ids[ss.index]);if(!t)return;
 t.srs=nextSrs(t.srs,g);t.updatedAt=Date.now();await put('topics',t);await reviewRecord(t,g);ss.index++;ss.count++;S.revealed=false;render();
 if(ss.index>=ss.ids.length) message(`${ss.count}問の復習を記録しました`)
}
function reviewQuestion(id){S.page='practice';S.questionId=id;S.answer='';S.answerShown=false;render()}
async function saveAttempt(g){let q=S.questions.find(x=>x.id===S.questionId);if(!q)return;let a={at:Date.now(),day:today(),text:S.answer,grade:g,matched:(q.keywords||[]).filter(k=>normalize(S.answer).includes(normalize(k))),minutes:S.practiceTimer?.questionId===q.id?Math.max(1,Math.min(20,Math.ceil((Date.now()-S.practiceTimer.start)/60000))):null};
 q.attempts=[...(q.attempts||[]),a];S.practiceTimer=null;await put('questions',q);if(g<=2&&q.topicId){let t=S.topics.find(x=>x.id===q.topicId);if(t&&t.answer?.trim()){t.srs={...newSrs(true),...t.srs,enabled:true,due:today()};await put('topics',t)}}
 let id=q.id;message(g===3?'演習を記録しました':'復習リストに反映しました');S.questionId=null;S.answer='';S.answerShown=false;render();}
function updateTimer(){
 if(S.examTimer){const el=$('#examCountdown');if(el){const remain=Math.max(0,7200000-(Date.now()-S.examTimer.start));const h=Math.floor(remain/3600000),m=Math.floor(remain%3600000/60000),sec=Math.floor(remain%60000/1000);el.textContent=`残り ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}${remain===0?'（時間終了）':''}`;}}
 if(S.practiceTimer){const el=$('#practiceCountdown');if(el){const remain=Math.max(0,1200000-(Date.now()-S.practiceTimer.start));const m=Math.floor(remain/60000),sec=Math.floor(remain%60000/1000);el.textContent=`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}${remain===0?'（終了）':''}`;}}
}

function copyPrompt(){return `あなたは税理士試験・国税徴収法専門講師です。添付した理論教材の写真だけを根拠に、理解と暗記に使えるJSONを作成してください。写真にない制度・論点は追加しないでください。判読不能な文字、条数、年度は推測せず「要確認」と書いてください。教材の内容とAIの補足を区別し、原文の長い転載は避け、自分の言葉で短く整理してください。

出力はJSONのみ。コードブロックや前置きは不要。複数論点ならtopicsを複数件にしてください。理論と関連するオリジナル練習問題もquestionsに追加してください。
{
 "topics":[
  {"area":"差押え","title":"論点名","law":"条文番号または要確認","summary":"制度の目的と要点・具体例","question":"理論を自力再現する問い","answer":"結論→発動条件→主体→要件→効果→限度→例外→手続を短く整理","keywords":["キーワード1","キーワード2"],"notes":"混同しやすい論点、要照合事項","sourceLabel":"教材名・年度・掲載ページ","verification":"not-checked"}
 ],
 "questions":[
  {"kind":"practice","title":"演習問題名","area":"差押え","topicTitle":"関連する理論の論点名","question":"実際の答案作成につながるオリジナルの事例問題","answer":"短い模範的な解答例","keywords":["採点要素1","採点要素2"],"sourceLabel":"AI作成・要照合"}
 ]
}
写真に演習問題を作るだけの根拠がない場合はquestionsを空配列にしてください。過去問の本文を確認していない場合、kindにはpastを使わないでください。2027年度の適用法令は別途確認すること。`}
async function imageCompression(file){
 if(file.size>18000000)throw Error('画像が大きすぎます（18MB以下にしてください）');
 const tryCanvas=async()=>{let bmp=await createImageBitmap(file),max=1700,ratio=Math.min(1,max/Math.max(bmp.width,bmp.height));let c=document.createElement('canvas');c.width=Math.round(bmp.width*ratio);c.height=Math.round(bmp.height*ratio);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close?.();return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('変換失敗')),'image/jpeg',.82))};
 try{return await tryCanvas()}catch(e){if(file.size<6000000&&/^image\//.test(file.type))return file;throw Error('画像を変換できません。JPEG/PNGで保存し直してください')}
}
async function uploadImages(files,itemId){
 let count=0;for(const file of [...files]){if(!file.type.startsWith('image/')){message(`画像ではありません: ${file.name}`);continue}try{let blob=await imageCompression(file);let a={id:uid(),itemId:itemId||'',name:file.name||'画像',blob,createdAt:Date.now()};await put('assets',a);S.assets.push(a);count++}catch(e){message(`${file.name}: ${e.message}`)}}
 render();message(`${count}枚の教材画像を保存しました。バックアップを推奨します`);
}
function blobDataURL(blob){return new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
function dataURLBlob(uri){let [meta,data]=String(uri).split(',',2);if(!/^data:image\/[\w+.-]+;base64$/.test(meta))throw Error('画像の形式が不正です');let bin=atob(data),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:meta.slice(5).split(';')[0]})}
async function exportBackup(){
 message('画像を含むバックアップを作成しています…');let assets=[];for(const a of S.assets)assets.push({...a,blob:await blobDataURL(a.blob)});
 const backup={format:'kokucho-lab-backup',version:1,exportedAt:new Date().toISOString(),topics:S.topics,questions:S.questions,assets,reviews:S.reviews,settings:S.settings};
 const str=JSON.stringify(backup);let blob=new Blob([str],{type:'application/json'}),f=`国税徴収法_Lab_backup_${today()}.json`;
 let url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=f;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 S.settings.lastBackup=today();await saveSettings();render();message('全データのバックアップを出力しました。ファイルアプリ等に保存できたか確認してください');
}
async function restoreBackup(file){
 if(file.size>160*1024*1024)throw Error('バックアップは160MB以下にしてください');const data=JSON.parse(await file.text());if(data.format!=='kokucho-lab-backup'||data.version!==1||!Array.isArray(data.topics)||!Array.isArray(data.questions)||!Array.isArray(data.assets)||!Array.isArray(data.reviews))throw Error('対応していないバックアップです');
 // 破損した画像が混ざっている場合、既存データを消す前に検出する。
 const checkedAssets=data.assets.filter(a=>a?.id&&typeof a.blob==='string').map(a=>({...a,blob:dataURLBlob(a.blob)}));
 if(checkedAssets.length!==data.assets.length)throw Error('画像データが不完全なため、復元を中止しました');
 if(!ask(`今の全データを削除し、バックアップ（理論${data.topics.length}件・画像${data.assets.length}枚）で置き換えますか？`))return;
 for(const name of ['topics','questions','assets','reviews'])await clearStore(name);
 for(const t of data.topics)if(t?.id)await put('topics',t);
 for(const q of data.questions)if(q?.id)await put('questions',q);
 for(const a of checkedAssets)await put('assets',a);
 for(const r of data.reviews)if(r?.id)await put('reviews',r);
 S.settings={...S.settings,...(data.settings||{}),lastBackup:today()};await saveSettings();S.photoUrl.forEach(url=>URL.revokeObjectURL(url));S.photoUrl.clear();await load();page('home');message('全データを復元しました');
}
function parseStudyJSON(input){
 let text=String(input||'').trim();
 const fenced=text.match(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i);
 if(fenced)text=fenced[1].trim();
 if(!text)throw Error('ChatGPTが作成したJSONを貼り付けてください');
 let data;try{data=JSON.parse(text)}catch{throw Error('JSONとして読み取れません。ChatGPTに「JSONのみで再出力」と依頼してください')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('topics / questionsを含むJSONオブジェクトを指定してください');
 if(data.topics!==undefined&&!Array.isArray(data.topics))throw Error('topicsには配列を指定してください');
 if(data.questions!==undefined&&!Array.isArray(data.questions))throw Error('questionsには配列を指定してください');
 return data;
}
async function importTopics(json){
 const data=parseStudyJSON(json),topics=Array.isArray(data.topics)?data.topics:[],questions=Array.isArray(data.questions)?data.questions:[];
 if(!topics.length&&!questions.length)throw Error('topicsまたはquestionsの配列がありません');
 if(topics.length+questions.length>250)throw Error('一度に登録できるのは250件までです');
 let added=0,updated=0;
 for(const raw of topics){let title=String(raw.title||'').trim().slice(0,180);if(!title)continue;
 let area=String(raw.area||'未分類').trim().slice(0,80), old=S.topics.find(t=>normalize(t.title)===normalize(title));
 let t=old||{id:'custom_'+uid(),createdAt:Date.now(),srs:newSrs(false)};
 let summary=String(raw.summary||'').trim(),answer=String(raw.answer||raw.modelAnswer||'').trim(),question=String(raw.question||'').trim();
 t={...t,title,area,law:String(raw.law||t.law||'').slice(0,120),summary:summary||t.summary||'',question:question||t.question||`${title}の要件・効果・例外を説明せよ。`,answer:answer||t.answer||'',notes:String(raw.notes||raw.why||t.notes||''),rawText:String(raw.rawText||t.rawText||''),keywords:Array.isArray(raw.keywords)?raw.keywords.map(String).slice(0,30):Array.isArray(raw.tags)?raw.tags.map(String):t.keywords||[],sourceLabel:String(raw.sourceLabel||t.sourceLabel||''),sourceUrl:String(raw.sourceUrl||t.sourceUrl||''),verification:'not-checked',origin:'user-import',updatedAt:Date.now()};
 if(!old&&t.answer)t.srs=newSrs(true);if(old){updated++}else{added++;S.topics.push(t)}await put('topics',t);
 }
 for(const raw of questions){let title=String(raw.title||'').trim().slice(0,180);if(!title)continue;let kind=raw.kind==='past'?'past':'practice',year=kind==='past'?Number(raw.year)||null:null;
 let old=S.questions.find(q=>q.title===title&&q.kind===kind&&(kind!=='past'||q.year===year));let topic=S.topics.find(t=>t.id===raw.topicId||t.title===raw.topicTitle);
 let q=old||{id:uid(),createdAt:Date.now(),attempts:[]};Object.assign(q,{kind,year,title,area:String(raw.area||topic?.area||'その他'),topicId:topic?.id||'',question:String(raw.question||''),answer:String(raw.answer||''),keywords:Array.isArray(raw.keywords)?raw.keywords.map(String).slice(0,30):[],sourceUrl:String(raw.sourceUrl||((kind==='past'&&PAST_YEARS.find(x=>x.year===year)?.page)||'')),sourceLabel:String(raw.sourceLabel||'ユーザー登録・要照合'),verification:'not-checked'});
 if(old)updated++;else{added++;S.questions.push(q)}await put('questions',q)
 }
 S.area='all';S.query='';page('theory');message(`${added}件追加・${updated}件更新。内容と出題年は教材で照合してください`);
}
async function onForm(e){
 let f=e.target;if(!['topicForm','questionForm','settingsForm'].includes(f.id))return;e.preventDefault();
 try{
  if(f.id==='settingsForm'){S.settings.goal=f.elements.goal.value;S.settings.dailyGoal=Math.max(1,Math.min(200,Number(f.elements.dailyGoal.value)||15));await saveSettings();message('設定を保存しました');render();return}
  if(f.id==='topicForm'){let old=S.topics.find(t=>t.id===f.dataset.id);let t=old||{id:'custom_'+uid(),srs:newSrs(false),createdAt:Date.now(),origin:'user-created'};Object.assign(t,{title:f.elements.title.value.trim(),area:f.elements.area.value,law:f.elements.law.value.trim(),sourceLabel:f.elements.sourceLabel.value.trim(),sourceUrl:f.elements.sourceUrl.value.trim(),summary:f.elements.summary.value.trim(),question:f.elements.question.value.trim(),answer:f.elements.answer.value.trim(),keywords:parseKeywords(f.elements.keywords.value),rawText:f.elements.rawText.value.trim(),notes:f.elements.notes.value.trim(),verification:f.elements.verification.value,updatedAt:Date.now()});if(!t.title)throw Error('理論名を入力してください');if(t.answer&&!t.srs?.enabled&&(!t.srs?.history))t.srs=newSrs(true);await put('topics',t);if(!old)S.topics.push(t);closeModal();S.page='theory';S.detailId=t.id;S.revealed=false;render();message('理論を保存しました');return}
  if(f.id==='questionForm'){let old=S.questions.find(q=>q.id===f.dataset.id);let q=old||{id:uid(),attempts:[],createdAt:Date.now()};Object.assign(q,{kind:f.elements.kind.value,year:Number(f.elements.year.value),title:f.elements.title.value.trim(),topicId:f.elements.topicId.value,question:f.elements.question.value.trim(),answer:f.elements.answer.value.trim(),keywords:parseKeywords(f.elements.keywords.value),sourceUrl:f.elements.sourceUrl.value.trim(),area:S.topics.find(t=>t.id===f.elements.topicId.value)?.area||'その他',verification:'user-unverified'});if(!q.title||!q.question)throw Error('タイトルと問題文が必要です');await put('questions',q);if(!old)S.questions.push(q);closeModal();S.page=q.kind==='past'?'past':'practice';S.questionId=q.id;S.answer='';S.answerShown=false;render();message('問題を登録しました');return}
 }catch(err){message(err.message);console.error(err)}
}
async function ocrAsset(id){
 let a=S.assets.find(x=>x.id===id);if(!a)return;
 modal(`${modalHeader('画像の文字起こし（任意）')}<p class="warning-inline">日本語OCRは誤読します。文字起こし結果をそのまま理論・条文や正答として登録しないでください。インターネット接続が必要です。</p><p class="muted" id="ocrStatus">文字起こしの準備中…</p><textarea id="ocrResult" class="textarea" rows="12" placeholder="抽出した文字を確認・修正してください"></textarea><div class="modal-actions"><button class="btn btn-line" data-action="closeModal">閉じる</button><button class="btn btn-primary" data-action="saveOcr" data-id="${id}">修正した文字を論点メモに保存</button></div>`);
 try{
  if(!window.Tesseract){let src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';await new Promise((res,rej)=>{let script=document.createElement('script');script.src=src;script.onload=res;script.onerror=()=>rej(Error('オンラインOCRを読み込めませんでした'));document.head.append(script)})}
  if(!$('#ocrStatus'))return;$('#ocrStatus').textContent='日本語モデルを取得して文字を認識中…';let result=await window.Tesseract.recognize(a.blob,'jpn');if($('#ocrResult')){$('#ocrResult').value=result.data.text||'';$('#ocrStatus').textContent='結果を原本画像と照らし合わせて修正してください。'}
 }catch(e){if($('#ocrStatus'))$('#ocrStatus').textContent='OCRに失敗しました: '+e.message+'。ChatGPTへの画像添付か手入力を使用してください。'}
}
async function handleClick(e){
 let target=e.target.closest('[data-action],[data-page]');if(!target||target.tagName==='INPUT')return;
 let action=target.dataset.action,id=target.dataset.id;
 try{
 if(target.dataset.page){page(target.dataset.page);return}
 switch(action){
 case 'startReview':startReview((dueTopics().length?dueTopics():readyTopics()).map(t=>t.id));break;
 case 'startWeak':startReview(readyTopics().filter(t=>(t.srs?.streak||0)<2).map(t=>t.id));break;
 case 'startAll':startReview(readyTopics().slice().sort(()=>Math.random()-.5).map(t=>t.id));break;
 case 'singleReview':startReview([id]);break;
 case 'setReviewMode':S.reviewMode=target.dataset.mode==='cloze'?'cloze':'flash';S.revealed=false;render();break;
 case 'revealReview':S.revealed=true;render();break;
 case 'grade':await rateReview(Number(target.dataset.grade));break;
 case 'closeSession':S.session=null;S.revealed=false;render();break;
 case 'filterArea':S.area=target.dataset.area;S.page='theory';S.detailId=null;render();break;
 case 'backTheory':S.detailId=null;S.revealed=false;render();break;
 case 'openTopic':S.page='theory';S.detailId=id;S.revealed=false;render();break;
 case 'newTopic':topicEditor(null);break;
 case 'editTopic':topicEditor(id);break;
 case 'toggleDetailAnswer':S.revealed=!S.revealed;S.clozeMode=false;render();break;
 case 'toggleCloze':S.clozeMode=!S.clozeMode;render();break;
 case 'toggleSchedule':{let t=S.topics.find(x=>x.id===id);if(!t)return;t.srs={...newSrs(),...t.srs,enabled:!t.srs?.enabled,due:!t.srs?.enabled?(t.srs?.due||today()):t.srs?.due};await put('topics',t);render();message(t.srs.enabled?'復習スケジュールを有効化':'復習を停止');break}
 case 'deleteTopic':if(ask('この理論を削除しますか？関連する教材画像は未分類に戻ります。')){await del('topics',id);S.topics=S.topics.filter(t=>t.id!==id);for(const a of S.assets.filter(a=>a.itemId===id)){a.itemId='';await put('assets',a)}closeModal();S.detailId=null;render()}break;
 case 'newPracticeFromTopic':{questionEditor(null,'practice');let f=$('#questionForm');f.elements.topicId.value=id;break}
 case 'openQuestion':S.page=S.questions.find(q=>q.id===id)?.kind==='past'?'past':'practice';S.questionId=id;S.answer='';S.answerShown=false;render();break;
 case 'backQuestions':S.questionId=null;S.answer='';S.answerShown=false;render();break;
 case 'newQuestion':questionEditor(null,target.dataset.kind);break;
 case 'editQuestion':questionEditor(id);break;
 case 'showQuestionAnswer':S.answer=$('#answerText')?.value||'';S.answerShown=true;render();break;
 case 'clearAnswer':S.answer='';S.answerShown=false;render();break;
 case 'saveAttempt':S.answer=$('#answerText')?.value||S.answer;await saveAttempt(Number(target.dataset.grade));break;
 case 'selectYear':S.pastYear=Number(target.dataset.year);render();break;
 case 'startPracticeTimer':S.practiceTimer={start:Date.now(),questionId:id};render();break;
 case 'stopPracticeTimer':S.practiceTimer=null;render();break;
 case 'startExam':S.examTimer={start:Date.now(),answer:'',year:S.pastYear};render();break;
 case 'finishExam':{let x=S.examTimer;if(!x)break;let mins=Math.min(120,Math.ceil((Date.now()-x.start)/60000));let memo=$('#examAnswer')?.value||x.answer;let record={id:uid(),day:today(),timestamp:Date.now(),kind:'mock',year:x.year,minutes:mins,note:memo,grade:0};await put('reviews',record);S.reviews.push(record);S.examTimer=null;render();message(`${mins}分の本試験演習を記録しました`);break}
 case 'zoomPhoto':{let a=S.assets.find(x=>x.id===id);if(!a)break;let el=document.createElement('div');el.className='lightbox';el.id='lightbox';el.innerHTML=`<img src="${photoUrl(a)}" alt="教材画像"><button data-action="closeLightbox">閉じる ×</button>`;document.body.appendChild(el);break}
 case 'closeLightbox':$('#lightbox')?.remove();break;
 case 'removePhoto':if(ask('この画像を削除しますか？')){await del('assets',id);S.assets=S.assets.filter(a=>a.id!==id);if(S.photoUrl.has(id)){URL.revokeObjectURL(S.photoUrl.get(id));S.photoUrl.delete(id)}render();message('画像を削除しました')}break;
 case 'assignPhoto':{let a=S.assets.find(x=>x.id===id);if(!a)break;modal(`${modalHeader('画像を紐付ける')}<label class="label-field">関連する論点<select id="assignTopic" class="select"><option value="">未分類</option>${S.topics.map(t=>`<option value="${t.id}" ${t.id===a.itemId?'selected':''}>理論 / ${esc(t.title)}</option>`).join('')}${S.questions.map(q=>`<option value="${q.id}" ${q.id===a.itemId?'selected':''}>問題 / ${esc(q.title)}</option>`).join('')}</select></label><button class="btn btn-primary" data-action="saveAssign" data-id="${a.id}">保存する</button>`);break}
 case 'saveAssign':{let a=S.assets.find(x=>x.id===id);if(a){a.itemId=$('#assignTopic').value;await put('assets',a)}closeModal();render();break}
 case 'ocrTopic':{let a=S.assets.find(x=>x.itemId===id);if(a)await ocrAsset(a.id);break}
 case 'ocrPhoto':await ocrAsset(id);break;
 case 'saveOcr':{let a=S.assets.find(x=>x.id===id),content=$('#ocrResult')?.value||'',t=S.topics.find(x=>x.id===a?.itemId);if(!content.trim()){message('文字がありません');break}if(!t){let q=S.questions.find(x=>x.id===a?.itemId);if(!q){message('先に画像を理論または問題に関連付けてください');break}q.ocrText=(q.ocrText?`${q.ocrText}\n\n`:'')+content;await put('questions',q);closeModal();S.page=q.kind==='past'?'past':'practice';S.questionId=q.id;render();message('文字起こしを問題の未検証メモに保存しました');break}t.rawText=(t.rawText?`${t.rawText}\n\n`:'')+content;t.updatedAt=Date.now();await put('topics',t);closeModal();page('theory');S.detailId=t.id;render();message('文字起こしを未検証メモに保存しました');break}
 case 'copyQuestionPrompt':{let txt=copyQuestionPrompt();try{await navigator.clipboard.writeText(txt);message('過去問JSON用プロンプトをコピーしました')}catch{modal(`${modalHeader('過去問用プロンプト')}<textarea class="textarea" rows="12" readonly>${esc(txt)}</textarea>`)}break}
 case 'copyPrompt':{let txt=copyPrompt();try{await navigator.clipboard.writeText(txt);message('ChatGPT用プロンプトをコピーしました')}catch{modal(`${modalHeader('プロンプトをコピー')}<textarea class="textarea" rows="12" readonly>${esc(txt)}</textarea>`)}break}
 case 'exportBackup':await exportBackup();break;
 case 'previewTopics':{
  const data=parseStudyJSON($('#topicJson')?.value),topics=data.topics||[],questions=data.questions||[];
  if(!topics.length&&!questions.length)throw Error('topics または questions が空です');
  const existing=topics.filter(t=>S.topics.some(v=>normalize(v.title)===normalize(String(t.title||'')))).length;
  const invalid=topics.filter(t=>!String(t.title||'').trim()).length+questions.filter(q=>!String(q.title||'').trim()).length;
  modal(`${modalHeader('取込内容を事前確認')}<p><b>理論 ${topics.length}件</b>（既存と同名 ${existing}件）、<b>演習・過去問 ${questions.length}件</b></p>
  ${invalid?`<p class="warning-inline">タイトルがない項目 ${invalid}件は登録されません。</p>`:''}
  <p class="muted">理論の例：${esc(topics.slice(0,8).map(t=>t.title||'タイトル未入力').join('、')||'なし')}</p>
  <p class="warning-inline">過去問をAIが作成した場合は本試験問題と誤表示しないでください。出典・年度・条文を教材で確認してください。</p>
  <button class="btn btn-primary" data-action="confirmJsonImport">内容を確認して登録する</button>`);
  break
 }
 case 'confirmJsonImport':{const json=$('#topicJson')?.value;closeModal();await importTopics(json);break}
 case 'importTopics':await importTopics($('#topicJson').value);break;
 case 'resetAll':if(ask('本当にすべての学習データ・画像を削除しますか？（元に戻せません）')&&ask('最終確認：バックアップを保存済みですか？')){for(const name of ['topics','questions','assets','reviews','settings'])await clearStore(name);S.settings={goal:'',dailyGoal:15,minutes:25,lastBackup:''};S.photoUrl.forEach(u=>URL.revokeObjectURL(u));S.photoUrl.clear();await seed();await load();page('home');message('データを初期化しました')}break;
 case 'closeModal':closeModal();break;
 }
 }catch(err){console.error(err);message(`操作を完了できませんでした: ${err.message}`)}
}
async function handleChange(e){
 let el=e.target;
 try{if(el.matches('[data-upload-for]')){await uploadImages(el.files,el.dataset.uploadFor);el.value=''}
 else if(el.id==='globalUpload'){await uploadImages(el.files,$('#uploadTopic')?.value||'');el.value=''}
 else if(el.id==='topicJsonFile'){let file=el.files?.[0];if(file){if(file.size>2500000)throw Error('JSONファイルは2.5MB以下にしてください');const elText=$('#topicJson');if(elText){elText.value=await file.text();message('JSONファイルを読み込みました。確認して登録してください')}}el.value=''}
 else if(el.id==='restoreInput'){if(el.files[0])await restoreBackup(el.files[0]);el.value=''}
 else if(el.id==='areaFilter'){S.area=el.value;render()}}
 catch(err){console.error(err);message(err.message)}
}
function handleInput(e){
 if(e.target.id==='answerText')S.answer=e.target.value;
 if(e.target.id==='examAnswer'&&S.examTimer)S.examTimer.answer=e.target.value;
 if(e.target.id==='theorySearch'){S.query=e.target.value;let pos=e.target.selectionStart;render();let el=$('#theorySearch');el?.focus();el?.setSelectionRange(pos,pos)}
}
async function init(){
 try{S.db=await dbOpen();await seed();await load();$('#quickReview').addEventListener('click',()=>startReview((dueTopics().length?dueTopics():readyTopics()).map(t=>t.id)));
  document.addEventListener('click',handleClick);document.addEventListener('change',handleChange);document.addEventListener('input',handleInput);document.addEventListener('submit',onForm);
  $('#mobileMenu').addEventListener('click',()=>{modal(`${modalHeader('メニュー')}<div class="action-stack">${[['home','ダッシュボード'],['review','今日の復習'],['theory','理論ライブラリ'],['practice','論点別演習'],['past','過去問'],['materials','画像教材'],['analytics','学習分析'],['data','データ・設定']].map(([p,l])=>`<button class="btn btn-line" data-action="modalNav" data-target="${p}">${l}</button>`).join('')}</div>`)})
  document.addEventListener('click',e=>{let b=e.target.closest('[data-action="modalNav"]');if(b){closeModal();page(b.dataset.target)}});
  $('#modalLayer').addEventListener('click',e=>{if(e.target.id==='modalLayer')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#lightbox')?.remove();if(!$('#modalLayer').classList.contains('hidden'))closeModal()}});
  setInterval(updateTimer,1000);render();
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('service worker:',e));
 }catch(e){console.error(e);$('#view').innerHTML=`<div class="panel panel-pad"><h2>データ保存を開始できませんでした</h2><p>${esc(e.message)}</p><p>Safariのプライベートモードやファイルを直接開いた場合は保存できないことがあります。HTTPSで公開して通常モードで開いてください。</p></div>`}
}
init();