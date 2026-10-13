/* V2.34.4 Teacher-facing guidance; no change to serialized activity data. */
(() => {
  "use strict";
  const workspace = document.querySelector('.workspace-view[data-workspace-view="activities"]');
  const status = document.getElementById('activityReadiness');
  const title = document.getElementById('activityReadinessTitle');
  const message = document.getElementById('activityReadinessMessage');
  const go = document.getElementById('activityReadinessGo');
  if (!workspace || !status || !title || !message || !go) return;
  let currentIssue = null;
  let pending = false;
  let attentionTimer = null;

  const rules = {
    'choice-identify': ['.case-title', '.card-text'],
    'ranking': ['#rankingQuestion'],
    'text-exchange': [],
    'group-consensus': ['#groupConsensusQuestion'],
    'information-revision': [],
    'live-stance': ['#liveStanceQuestion', '#liveStanceLeftLabel', '#liveStanceRightLabel'],
    'layered-deliberation': ['#deliberationFixedQuestion', '.deliberation-layer-title', '.deliberation-layer-question', '.deliberation-layer-content']
  };
  function modeNow(activity) {
    if (activity.template === 'information-revision') return activity.informationRevisionFlow === 'progressive' ? 'progressive' : 'predict';
    if (activity.template === 'text-exchange') return activity.textExchangeFlow === 'questions' ? 'questions' : 'responses';
    if (activity.template === 'evidence-classification') return activity.classificationFlow === 'discussion' ? 'discussion' : 'single';
    return activity.template;
  }
  function visible(node) {
    return Boolean(node && !node.closest('.hidden,[hidden]'));
  }
  function first(selectors, base = workspace) {
    for (const selector of selectors) {
      const found = [...base.querySelectorAll(selector)].find(visible);
      if (found) return found;
    }
    return null;
  }
  function nearestField(control) {
    return control?.closest('label.field,.field,.card-builder,.case-card,.wave-editor-card,.mode-a-config-block') || control;
  }
  function tag(control, label = '必填', kind = 'required') {
    const wrapper = control?.closest('label.field');
    const head = wrapper?.querySelector(':scope > span');
    if (!head || head.querySelector('.guidance-field-key')) return;
    const span = document.createElement('span');
    span.className = `guidance-key guidance-key-${kind} guidance-field-key`;
    span.textContent = label;
    head.append(' ', span);
  }
  function markFields(activity) {
    workspace.querySelectorAll('.guidance-field-key').forEach(node => node.remove());
    const mode = modeNow(activity);
    let selectors = rules[activity.template] || [];
    if (activity.template === 'choice-identify') {
      selectors = ['.case-title'];
      if (activity.choiceMode !== 'open') selectors.push('.case-reveal-title');
    }
    if (activity.template === 'evidence-classification') selectors = mode === 'discussion'
      ? ['.open-classification-work-select'] : ['.mode-a-work-select'];
    if (mode === 'predict') selectors = ['#predictQuestion', '#predictRevealContent'];
    if (mode === 'progressive') selectors = ['.progressive-work-select'];
    if (mode === 'responses') selectors = ['#openTextQuestion'];
    if (mode === 'questions') selectors = ['#questionWallQuestion'];
    for (const selector of selectors) {
      workspace.querySelectorAll(selector).forEach(node => { if (visible(node)) tag(node); });
    }
    if (document.getElementById('confidenceEnabled')?.checked &&
        activity.template !== 'group-consensus' && mode !== 'questions') {
      ['#confidenceLowLabel','#confidenceHighLabel'].forEach(selector =>
        workspace.querySelectorAll(selector).forEach(node => {if (visible(node)) tag(node,'可自訂','recommend');}));
    }
    // Explicit requirements for option collections not wrapped in a form label.
    if (activity.template === 'choice-identify') {
      workspace.querySelectorAll('#caseEditor .card-builder-label').forEach(node => {
        if (!node.querySelector('.guidance-field-key')) {
          const chip=document.createElement('span');
          chip.className='guidance-key guidance-key-required guidance-field-key';
          chip.textContent='至少 1 項';
          node.append(' ',chip);
        }
      });
    }
    // Students can see these fields in activity payloads; teacher notes are excluded.
    const studentSelectors = ['.case-prompt','.case-intro','#rankingQuestion','#openTextQuestion',
      '#questionWallQuestion','#groupConsensusQuestion','#predictQuestion','#predictRevealContent',
      '#liveStanceQuestion','#deliberationFixedQuestion','.deliberation-layer-content',
      '.deliberation-layer-question','.case-reveal-title'];
    studentSelectors.forEach(selector => workspace.querySelectorAll(selector).forEach(node => {
      if (visible(node)) tag(node,'學生可見','student');
    }));
    // Existing labels already explain that teacher notes never leave the teacher side.
    workspace.querySelectorAll('.deliberation-layer-note').forEach(node => {
      if (visible(node)) tag(node,'教師專用','private');
    });
  }
  function locationFor(error, activity) {
    const mode = modeNow(activity);
    const n = error.match(/第\s*(\d+)\s*(?:關|個分類任務|層)/);
    if (n) {
      let group;
      if (error.includes('分類任務')) group = '.element-type-task-card';
      else if (error.includes('層')) group = '.deliberation-layer-card';
      else group = '#caseEditor .case-card';
      const card = workspace.querySelectorAll(group)[Math.max(0,Number(n[1])-1)];
      if (card) {
        if (error.includes('材料') || error.includes('情境名稱')) return first(['.mode-a-work-select','.case-title'],card) || card;
        if (error.includes('揭露標題')) return first(['.case-reveal-title'],card) || card;
        if (error.includes('標題')) return first(['.deliberation-layer-title'],card) || card;
        if (error.includes('新增資訊')) return first(['.deliberation-layer-content'],card) || card;
        if (error.includes('核心提問')) return first(['.deliberation-layer-question'],card) || card;
        if (error.includes('參考分類')) return first(['.mode-a-reference-type'],card) || card;
        if (error.includes('依據')) return first(['.mode-a-element-grid'],card) || card;
        if (error.includes('分類')) return first(['.mode-a-type-grid'],card) || card;
        if (error.includes('選項') || error.includes('字卡') || error.includes('可選項目') || error.includes('參考答案') || error.includes('特徵')) return first(['.card-editor-list','.card-builder'],card) || card;
        return card;
      }
    }
    if (/信心程度/.test(error)) return first([!document.getElementById('confidenceLowLabel')?.value.trim() ? '#confidenceLowLabel' : '#confidenceHighLabel','#confidenceEditorCard']);
    if (/理由/.test(error) && activity.template === 'layered-deliberation') return first(['#deliberationReasonChoicesEditor','#deliberationReasonChoicesSettings']);
    if (activity.template === 'layered-deliberation') {
      if (/選項/.test(error)) return first(['#deliberationOptionsEditor']);
      if (/題/.test(error)) return first(['#deliberationFixedQuestion']);
      return first(['#deliberationLayersEditor']);
    }
    if (mode === 'responses') return first(['#openTextQuestion']);
    if (mode === 'questions') return first(/回應/.test(error) ? ['#questionWallReplyMaxLength'] : /提問數/.test(error) ? ['#questionWallMaxPosts'] : ['#questionWallQuestion']);
    if (mode === 'predict') return first(/揭曉/.test(error) && /內容/.test(error) ? ['#predictRevealContent'] : /選項/.test(error) ? ['#predictOptionsEditor'] : ['#predictQuestion']);
    if (mode === 'progressive') return first(/材料/.test(error) ? ['.progressive-work-select'] : /資訊/.test(error) ? ['.progressive-clue-grid'] : ['.progressive-type-grid','#progressiveTaskEditor']);
    if (mode === 'single') return first(['.mode-a-work-select','#elementTypeTaskEditor']);
    if (mode === 'discussion') return first(/材料/.test(error) ? ['.open-classification-work-select'] : /依據/.test(error) ? ['.open-classification-element-grid'] : ['.open-classification-type-grid','#openClassificationTaskEditor']);
    if (activity.template === 'ranking') return first(/項目/.test(error) ? ['#rankingItemsEditor'] : ['#rankingQuestion']);
    if (activity.template === 'group-consensus') return first(/選項/.test(error) ? ['#groupConsensusOptionsEditor'] : /人數/.test(error) ? ['#groupConsensusGroupSize'] : ['#groupConsensusQuestion']);
    if (activity.template === 'live-stance') return first(/未決定/.test(error) ? ['#liveStanceUndecidedLabel'] : /左右/.test(error) ? ['#liveStanceLeftLabel'] : ['#liveStanceQuestion']);
    return first(['#caseEditor','.activity-content-intro']);
  }
  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function update() {
    if (typeof readEditor !== 'function' || typeof validateActivity !== 'function') return;
    try {
      const activity = readEditor();
      markFields(activity);
      const problem = validateActivity(activity);
      const noName = !document.getElementById('activityTitle')?.value.trim();
      currentIssue = problem ? locationFor(problem,activity) : noName ? document.getElementById('activityTitle') : null;
      if (problem) {
        status.dataset.state = 'attention';
        setText(title,'還有一項設定需要完成');
        setText(message,`${problem}。可先儲存草稿，完成後再預覽或開始上課。`);
      } else if (noName) {
        status.dataset.state = 'recommend';
        setText(title,'活動內容已通過檢查，建議補上名稱');
        setText(message,'未填名稱時會自動使用「未命名活動」，不影響草稿儲存。');
      } else {
        status.dataset.state = 'ready';
        setText(title,'活動內容已通過必要檢查');
        setText(message,'已符合目前活動模式的內容驗證；正式上課仍須確認 Session 連線。');
      }
      go.hidden = !(problem || noName);
      go.textContent = problem ? '前往修正 ↗' : noName ? '填寫活動名稱 ↗' : '';
    } catch (e) {
      // Never allow advisory UI to interrupt the activity editor.
      status.dataset.state = 'checking';
      setText(title,'尚無法檢查目前活動');
      setText(message,'仍可繼續編輯與儲存草稿。');
      currentIssue = null;go.hidden = true;
      console.warn('備課檢查暫時無法完成',e);
    }
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {pending=false;update();});
  }
  function focusIssue() {
    let target = currentIssue;
    if (!target?.isConnected) {update();target=currentIssue;}
    if (!target) return;
    let node = target;
    while ((node=node.parentElement)) if (node.tagName === 'DETAILS' && !node.open) node.open = true;
    const field = nearestField(target);
    window.clearTimeout(attentionTimer);
    workspace.querySelectorAll('.guidance-field-attention').forEach(n=>n.classList.remove('guidance-field-attention'));
    field.classList.add('guidance-field-attention');
    target.scrollIntoView({block:'center',behavior:'smooth'});
    if (typeof target.focus === 'function') {
      if (!target.matches('input,textarea,select,button,[tabindex]')) target.setAttribute('tabindex','-1');
      target.focus({preventScroll:true});
    }
    attentionTimer=window.setTimeout(()=>field.classList.remove('guidance-field-attention'),3000);
  }
  go.addEventListener('click',focusIssue);
  // Event delegation also handles dynamically-created task cards and changing modes.
  workspace.addEventListener('input',schedule);
  workspace.addEventListener('change',schedule);
  workspace.addEventListener('click',()=>setTimeout(schedule,0));
  // Choosing another saved activity replaces the active form after event handling.
  document.addEventListener('click',event=> {
    if (event.target.closest('[data-view="activities"],#activityList,#newActivityBtn,#duplicateBtn,#deleteBtn')) setTimeout(schedule,0);
  });
  window.ClassroomEditorGuidance={refresh:update,focusIssue,getState:()=>status.dataset.state};
  update();
})();
