/* Classroom Interactive V2.19.0 - Activity Module Registry
 * Centralizes activity metadata and context hooks so new activity types can be
 * registered without adding mode switch/if chains throughout the core files.
 */
(function initActivityModuleRegistry(global) {
  "use strict";

  const definitions = new Map();
  const contexts = new Map();
  const DEFAULT_MODE = "drag-reveal";

  function safeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function define(definition) {
    if (!definition || !definition.id) throw new Error("Activity module requires an id");
    const id = String(definition.id);
    const normalized = Object.freeze({
      id,
      label: definition.label || id,
      shortLabel: definition.shortLabel || definition.label || id,
      templateKicker: definition.templateKicker || "模板",
      templateTitle: definition.templateTitle || definition.label || id,
      editorKind: definition.editorKind || "standard",
      editorClass: definition.editorClass || "",
      editorSectionId: definition.editorSectionId || "",
      dataKey: definition.dataKey || "cases",
      collection: definition.collection !== false,
      requiresCloud: Boolean(definition.requiresCloud),
      allowInCourse: definition.allowInCourse !== false,
      realtimeStudent: Boolean(definition.realtimeStudent),
      teacherControlId: definition.teacherControlId || "",
      responseMode: definition.responseMode || id,
      initialRoundState: definition.initialRoundState || "",
      completeText: definition.completeText || "你已完成活動。",
      previewSummary: typeof definition.previewSummary === "function"
        ? definition.previewSummary
        : summary => `${Number(summary?.taskCount || 0)} 個任務`,
      libraryTaskCount: typeof definition.libraryTaskCount === "function"
        ? definition.libraryTaskCount
        : activity => safeCount(activity?.[definition.dataKey || "cases"]?.length),
      studentTaskCount: typeof definition.studentTaskCount === "function"
        ? definition.studentTaskCount
        : activity => Math.max(1, safeCount(activity?.[definition.dataKey || "cases"]?.length)),
      stageCount: typeof definition.stageCount === "function"
        ? definition.stageCount
        : () => 1,
      currentStudentTask: typeof definition.currentStudentTask === "function"
        ? definition.currentStudentTask
        : (activity, index) => activity?.[definition.dataKey || "cases"]?.[index],
      hasStudentContent: typeof definition.hasStudentContent === "function"
        ? definition.hasStudentContent
        : activity => Boolean(activity?.[definition.dataKey || "cases"]?.length)
    });
    definitions.set(id, normalized);
    return normalized;
  }

  function get(mode) {
    return definitions.get(String(mode || "")) || definitions.get(DEFAULT_MODE);
  }

  function has(mode) {
    return definitions.has(String(mode || ""));
  }

  function normalizeMode(mode) {
    return has(mode) ? String(mode) : DEFAULT_MODE;
  }

  function list() {
    return [...definitions.values()];
  }

  function modeLabel(mode) {
    return get(mode)?.label || "選擇與揭示";
  }

  function libraryTaskCount(activity) {
    return safeCount(get(activity?.template)?.libraryTaskCount(activity));
  }

  function studentTaskCount(activity) {
    return Math.max(1, safeCount(get(activity?.template)?.studentTaskCount(activity)) || 1);
  }

  function stageCount(activity) {
    return Math.max(1, safeCount(get(activity?.template)?.stageCount(activity)) || 1);
  }

  function currentStudentTask(activity, index = 0) {
    return get(activity?.template)?.currentStudentTask(activity, index);
  }

  function hasStudentContent(activity) {
    return Boolean(get(activity?.template)?.hasStudentContent(activity));
  }

  function previewSummary(summary) {
    return get(summary?.template)?.previewSummary(summary);
  }

  function contextMap(context) {
    const key = String(context || "core");
    if (!contexts.has(key)) contexts.set(key, new Map());
    return contexts.get(key);
  }

  function registerHooks(context, mode, hooks) {
    if (!has(mode)) throw new Error(`Unknown activity module: ${mode}`);
    const map = contextMap(context);
    const previous = map.get(mode) || {};
    map.set(mode, {...previous, ...(hooks || {})});
  }

  function hooks(context, mode) {
    return contextMap(context).get(normalizeMode(mode)) || {};
  }

  function invoke(context, mode, hookName, ...args) {
    const fn = hooks(context, mode)?.[hookName];
    return typeof fn === "function" ? fn(...args) : undefined;
  }

  function supports(context, mode, hookName) {
    return typeof hooks(context, mode)?.[hookName] === "function";
  }

  function teacherControlIds() {
    return list().map(item => item.teacherControlId).filter(Boolean);
  }

  // --- Built-in module metadata. Behavior hooks are registered by each context. ---
  define({
    id:"drag-reveal",
    label:"選擇與揭示",
    shortLabel:"選擇與揭示",
    templateKicker:"模板 01",
    templateTitle:"選擇與揭示",
    editorKind:"standard",
    dataKey:"cases",
    completeText:"你已經完成所有關卡。現在回頭看看：哪些資訊或依據最影響你的判斷？"
  });

  define({
    id:"open-tags",
    label:"特徵選擇",
    shortLabel:"特徵選擇",
    templateKicker:"模板 02",
    templateTitle:"特徵選擇",
    editorKind:"standard",
    dataKey:"cases",
    completeText:"你已經完成所有關卡。比較彼此的選擇與理由，看看同一份材料為什麼可能支持不同觀點。"
  });

  define({
    id:"element-type",
    label:"依據與分類｜基礎分類",
    shortLabel:"依據與分類",
    templateKicker:"模板 03",
    templateTitle:"依據與分類｜基礎分類",
    editorKind:"element-type",
    editorClass:"element-type-mode",
    editorSectionId:"elementTypeEditorSection",
    dataKey:"tasks",
    studentTaskCount:activity => activity?.tasks?.length || 1,
    currentStudentTask:(activity,index) => activity?.tasks?.[index],
    hasStudentContent:activity => Boolean(activity?.tasks?.length),
    completeText:"你完成了「先找依據，再進行分類」的練習。重要的不只是答案，而是能用材料內容說明自己的判斷。"
  });

  define({
    id:"progressive-reveal",
    label:"逐步揭露",
    shortLabel:"逐步揭露",
    templateKicker:"模板 04",
    templateTitle:"逐步揭露",
    editorKind:"progressive-reveal",
    editorClass:"progressive-reveal-mode",
    editorSectionId:"progressiveEditorSection",
    dataKey:"progressive",
    collection:false,
    realtimeStudent:true,
    teacherControlId:"progressiveSessionControl",
    libraryTaskCount:activity => activity?.progressive?.clueRefs?.length || activity?.progressive?.clues?.length || 0,
    studentTaskCount:() => 1,
    stageCount:activity => activity?.progressive?.clueRefs?.length || activity?.progressive?.clues?.length || 1,
    currentStudentTask:activity => activity?.progressive,
    hasStudentContent:activity => Boolean(activity?.progressive?.clues?.length >= 2),
    previewSummary:summary => `${Number(summary?.taskCount || 0)} 項資訊`,
    completeText:"你完成了逐步判斷。回頭看看自己的答案在哪一項資訊後改變，並用材料內容說明理由。"
  });

  define({
    id:"open-classification",
    label:"依據與分類｜討論後再判斷",
    shortLabel:"討論後再判斷",
    templateKicker:"模板 03",
    templateTitle:"依據與分類｜討論後再判斷",
    editorKind:"open-classification",
    editorClass:"open-classification-mode",
    editorSectionId:"openClassificationEditorSection",
    dataKey:"openClassification",
    collection:false,
    realtimeStudent:true,
    teacherControlId:"openClassificationSessionControl",
    libraryTaskCount:() => 1,
    studentTaskCount:() => 1,
    stageCount:activity => activity?.openClassification?.allowRejudge === false ? 1 : 2,
    currentStudentTask:activity => activity?.openClassification,
    hasStudentContent:activity => Boolean(activity?.openClassification?.elements?.length && activity?.openClassification?.types?.length),
    previewSummary:() => "初次＋重新判斷",
    completeText:"你完成了討論後再判斷。比較初次與最終判斷：答案可以改，也可以不改，重點是能用依據說明自己的選擇。"
  });

  define({
    id:"layered-deliberation",
    label:"逐層思辨",
    shortLabel:"逐層思辨",
    templateKicker:"模板 05",
    templateTitle:"逐層思辨",
    editorKind:"layered-deliberation",
    editorClass:"layered-deliberation-mode",
    editorSectionId:"deliberationEditorSection",
    dataKey:"deliberation",
    collection:false,
    requiresCloud:true,
    allowInCourse:false,
    realtimeStudent:true,
    initialRoundState:"open",
    teacherControlId:"deliberationSessionControl",
    libraryTaskCount:activity => activity?.deliberation?.layers?.length || 0,
    studentTaskCount:() => 1,
    stageCount:activity => activity?.deliberation?.layers?.length || 1,
    currentStudentTask:activity => activity?.deliberation,
    hasStudentContent:activity => Boolean(activity?.deliberation?.fixedQuestion),
    previewSummary:summary => `${Number(summary?.taskCount || 0)} 層情境 · 需雲端 Session`,
    completeText:"你完成了逐層思辨。這個活動不評分，也不要求你改變立場；重點是看見哪些新資訊、假設與價值影響了自己的判斷。"
  });


  define({
    id:"scale-spectrum",
    label:"量表／立場光譜",
    shortLabel:"量表／立場光譜",
    templateKicker:"模板 06",
    templateTitle:"量表／立場光譜",
    editorKind:"scale-spectrum",
    editorClass:"scale-spectrum-mode",
    editorSectionId:"scaleEditorSection",
    dataKey:"scale",
    collection:false,
    teacherControlId:"scaleSessionControl",
    libraryTaskCount:() => 1,
    studentTaskCount:() => 1,
    currentStudentTask:activity => activity?.scale,
    hasStudentContent:activity => Boolean(activity?.scale?.question),
    previewSummary:summary => `${Number(summary?.taskCount || 1)} 題量表`,
    completeText:"你已完成量表作答。比較全班分布時，也可以想想自己為什麼站在這個位置。"
  });

  define({
    id:"ranking",
    label:"排序／優先順序",
    shortLabel:"排序",
    templateKicker:"模板 07",
    templateTitle:"排序／優先順序",
    editorKind:"ranking",
    editorClass:"ranking-mode",
    editorSectionId:"rankingEditorSection",
    dataKey:"ranking",
    collection:false,
    teacherControlId:"rankingSessionControl",
    libraryTaskCount:() => 1,
    studentTaskCount:() => 1,
    currentStudentTask:activity => activity?.ranking,
    hasStudentContent:activity => Boolean(activity?.ranking?.question && activity?.ranking?.items?.length >= 2),
    previewSummary:summary => `${Number(summary?.taskCount || 1)} 題排序`,
    completeText:"你已完成排序。看看全班最常放在前面的項目，並比較彼此排序依據的差異。"
  });

  define({
    id:"open-text",
    label:"開放文字／文字牆",
    shortLabel:"開放文字",
    templateKicker:"模板 08",
    templateTitle:"開放文字／文字牆",
    editorKind:"open-text",
    editorClass:"open-text-mode",
    editorSectionId:"openTextEditorSection",
    dataKey:"openText",
    collection:false,
    teacherControlId:"openTextSessionControl",
    libraryTaskCount:() => 1,
    studentTaskCount:() => 1,
    currentStudentTask:activity => activity?.openText,
    hasStudentContent:activity => Boolean(activity?.openText?.question),
    previewSummary:() => "1 題開放文字",
    completeText:"你已提交想法。等待全班文字牆彙整後，可以看看有哪些相同、不同或值得追問的觀點。"
  });

  global.ClassroomActivityModules = Object.freeze({
    DEFAULT_MODE,
    define,
    get,
    has,
    list,
    normalizeMode,
    modeLabel,
    libraryTaskCount,
    studentTaskCount,
    stageCount,
    currentStudentTask,
    hasStudentContent,
    previewSummary,
    registerHooks,
    hooks,
    invoke,
    supports,
    teacherControlIds
  });
})(window);
