/* V2.7.5 compatibility loader.
   New index.html loads teacher-core.js, activity-editor.js and session-teacher.js directly.
   This file only protects older cached HTML that still requests teacher.js. */
(() => {
  if (window.ClassroomTeacherModulesLoading || window.ClassroomCourseAPI) return;
  window.ClassroomTeacherModulesLoading = true;
  const files = ["teacher-core.js","activity-editor.js","session-teacher.js","release-center.js"];
  const load = index => {
    if (index >= files.length) {
      window.ClassroomTeacherModulesLoading = false;
      return;
    }
    const script = document.createElement("script");
    script.src = files[index];
    script.onload = () => load(index + 1);
    script.onerror = () => {
      window.ClassroomTeacherModulesLoading = false;
      console.error(`Unable to load ${files[index]}`);
    };
    document.head.appendChild(script);
  };
  load(0);
})();
