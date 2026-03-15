/**
 * Portal UI strings. Lang: localStorage agni_lang. Missing keys fall back to en.
 */
const EN = {
  nav_home: 'Home', nav_learn: 'Learn', nav_hub: 'Teacher Hub', nav_collab: 'Collaborative Sessions',
  nav_groups: 'Groups', nav_students: 'Students', nav_author: 'Author', nav_browse: 'Browse',
  nav_leaderboard: 'Leaderboard', nav_parent: 'Parent', nav_governance: 'Governance', nav_admin: 'Admin', nav_settings: 'Settings',
  logo: 'AGNI Portal', skip: 'Skip to content', menu_toggle: 'Toggle menu',
  home_title: 'AGNI Portal', home_tagline: 'Open Lesson Standard — offline, sensor-rich education',
  home_footer_before: 'Configure hub URL in ', home_footer_after: ' to connect to a live hub.',
  card_hub: 'Teacher Hub', card_hub_desc: 'Class overview, heterogeneity, recommendations, and overrides.',
  card_groups: 'Student Groups', card_groups_desc: 'Create groups and assign students from the roster.',
  card_author: 'Lesson Author', card_author_desc: 'Create or edit lessons: set metadata, steps, and save as YAML.',
  card_parent: 'Parent Dashboard', card_parent_desc: 'Link to your child with an invite code and view progress.',
  card_leaderboard: 'Leaderboard', card_leaderboard_desc: 'Top lessons and creators.',
  card_governance: 'Governance', card_governance_desc: 'Policy, approved catalog, import and export.',
  card_admin: 'Admin', card_admin_desc: 'First-run onboarding or hub setup.',
  common_back: '← Back', common_back_home: '← Back to Home', common_save: 'Save', common_retry: 'Retry', common_loading: 'Loading…',
  common_test: 'Test', common_search: 'Search', common_edit: 'Edit', common_cancel: 'Cancel',
  settings_title: 'Settings', settings_hub_url: 'Hub URL', settings_hub_url_help: 'Village Hub base URL (e.g. http://localhost:8082).',
  settings_hub_key: 'Hub key (device / parent)', settings_hub_key_help: 'Same value as hub device key (header X-Hub-Key). See docs/CONFIGURATION.md — not your creator password. Used for Learn, Parent, and lesson sync on tablets.',
  settings_hub_key_save: 'Save hub key', settings_hub_key_test: 'Test hub key', settings_hub_key_ok: 'Hub key accepted.', settings_hub_key_fail: 'Hub key rejected or network error.',
  settings_lang: 'Language preference', settings_lang_help: 'Portal UI. Lesson text uses each lesson meta.language.',
  author_title: 'Lesson Author', author_login_needed: 'You must be logged in to author lessons.', author_log_in: 'Log In or Register',
  author_create_wizard: 'Create with wizard', author_create_blank: 'Create New Lesson (blank)', author_edit_existing: 'Edit existing',
  author_filter_list: 'Filter list', author_account: 'Account / Log out', browse_title: 'Browse', browse_login: 'Please log in to browse.',
  browse_hub: 'Set Hub URL in Settings to browse.', groups_title: 'Student Groups', groups_subtitle: 'Create groups and assign students.',
  learn_title: 'Learn', learn_help: 'Enter student pseudoId (Hub key required).', learn_pseudo: 'Pseudo ID', learn_load: 'Load lessons',
  learn_empty: 'No ordered lessons (new student or empty path).', learn_fail_auth: '401: wrong Hub key. 403: check key in Settings.',
  students_title: 'Students', students_help: 'Roster from hub (admin only).', students_none: 'No students yet.', students_admin: 'Need admin hub role. Use Groups if you are a teacher.',
  students_learn: 'Learn →', parent_title: 'Parent dashboard', parent_help: 'Child pseudoId + Hub key after school links you.',
  collab_title: 'Collaborative Sessions', collab_help: 'When two students match on a lesson, a session appears. Deny cancels it.',
  collab_none: 'No sessions.', collab_polling: 'Checking again in 30s…', collab_status_seek: 'Waiting for peer', collab_status_matched: 'Active — supervise if needed',
  gov_title: 'Governance', gov_help: 'Unforkable list blocks forking regardless of license. Catalog IDs are lesson identifiers.',
  gov_saved: 'Saved.', gov_removed: 'Removed.', lb_title: 'Leaderboard', lb_help: 'Ranked lessons and creators (logged-in).',
  lb_updated: 'Updated', author_sticky_validate: 'Validate', author_sticky_preview: 'Preview', author_sticky_save: 'Save', author_jump_step: 'Jump to step',
  author_subtitle: 'Create or edit lessons.', author_select_hint: 'Select a lesson or enter slug to edit.',
  author_filter_placeholder: 'Type to filter…', author_or: 'or', author_loading_lessons: 'Loading lessons…',
  author_select_lesson: '-- Select lesson --', author_could_not_load_list: 'Could not load list',
  author_load_list_error: 'Could not load lesson list.', author_retry_load: 'Retry load',
  parent_hint: 'Invite codes are created by your school (admin). After the device is linked, view progress here with the child\u2019s pseudoId and Hub key.',
  parent_warn_hub: 'Open Settings and set the Hub URL.', parent_warn_key: 'Open Settings and set the Hub key (same as the family tablet).',
  parent_child_label: 'Child pseudoId', parent_placeholder: 'linked-child-id', parent_load: 'Load progress',
  parent_failed: 'Failed',
  stub_coming_soon: 'Coming soon',
  stub_hub_title: 'Teacher Hub', stub_hub_desc: 'Class overview, heterogeneity, and recommendations.',
  stub_hub_detail: 'Connect the portal to your hub in Settings, then use Groups and Author for day-to-day tasks.',
  stub_hub_cta_groups: 'Student groups', stub_hub_secondary_settings: 'Hub settings',
  stub_admin_title: 'Admin', stub_admin_desc: 'First-run hub onboarding.',
  stub_admin_detail: 'See docs/CONFIGURATION.md for env vars and bootstrap.',
  stub_admin_cta_settings: 'Portal settings', stub_admin_secondary_gov: 'Governance',
  stub_admin_hub_title: 'Admin Hub', stub_admin_hub_desc: 'Hub configuration and health.',
  stub_admin_hub_detail: 'Run the Village Hub process with a valid environment; use Settings here to point the portal at it.',
  stub_admin_hub_cta_url: 'Set hub URL', stub_admin_hub_secondary_home: 'Home'
};

const ES = Object.assign({}, EN, {
  nav_home: 'Inicio', nav_learn: 'Aprender', nav_hub: 'Profesores', nav_collab: 'Sesiones colaborativas',
  nav_groups: 'Grupos', nav_students: 'Estudiantes', nav_author: 'Autor', nav_browse: 'Explorar',
  nav_leaderboard: 'Clasificación', nav_parent: 'Padres', nav_governance: 'Gobernanza', nav_settings: 'Ajustes',
  logo: 'Portal AGNI', skip: 'Ir al contenido', menu_toggle: 'Menú',
  home_title: 'Portal AGNI', home_tagline: 'Open Lesson Standard — educación con sensores',
  home_footer_before: 'URL del hub en ', home_footer_after: ' para conectar.',
  settings_title: 'Ajustes', settings_hub_key: 'Clave del hub', settings_hub_key_help: 'Clave del dispositivo (X-Hub-Key). Ver CONFIGURATION.md.',
  common_back: '← Volver', common_save: 'Guardar', common_retry: 'Reintentar', common_loading: 'Cargando…', common_cancel: 'Cancelar',
  author_title: 'Autor de lecciones', author_login_needed: 'Inicia sesión para editar.', author_log_in: 'Entrar o registrarse',
  author_subtitle: 'Crear o editar lecciones.', author_edit_existing: 'Editar existente', author_or: 'o',
  parent_title: 'Panel padres/madres', parent_load: 'Cargar progreso', stub_coming_soon: 'Próximamente'
});

const SW = Object.assign({}, EN, {
  nav_home: 'Nyumbani', nav_learn: 'Jifunze', nav_hub: 'Walimu', nav_collab: 'Vikao',
  nav_groups: 'Makundi', nav_students: 'Wanafunzi', nav_author: 'Mwandishi', nav_browse: 'Vinjari',
  nav_leaderboard: 'Ranki', nav_parent: 'Mzazi', nav_governance: 'Utawala', nav_settings: 'Mipangilio',
  logo: 'Portal AGNI', home_title: 'Portal AGNI', home_footer_before: 'URL ya hub katika ', home_footer_after: '.',
  settings_title: 'Mipangilio', common_back: '← Rudi', common_save: 'Hifadhi', common_retry: 'Jaribu tena',
  author_title: 'Mwandishi wa somo', author_login_needed: 'Ingia ili uhariri.', author_subtitle: 'Unda au hariri masomo.',
  parent_title: 'Dashibodi ya mzazi', parent_load: 'Pakia maendeleo', stub_coming_soon: 'Inakuja hivi karibuni'
});

const FR = Object.assign({}, EN, {
  nav_home: 'Accueil', nav_learn: 'Apprendre', nav_hub: 'Enseignants', nav_collab: 'Sessions collaboratives',
  nav_groups: 'Groupes', nav_students: 'Élèves', nav_author: 'Auteur', nav_browse: 'Parcourir',
  nav_leaderboard: 'Classement', nav_parent: 'Parents', nav_governance: 'Gouvernance', nav_settings: 'Réglages',
  logo: 'Portail AGNI', home_title: 'Portail AGNI', home_footer_before: 'URL du hub dans ', home_footer_after: '.',
  settings_title: 'Réglages', common_back: '← Retour', common_save: 'Enregistrer', common_retry: 'Réessayer',
  author_title: 'Auteur de leçons', author_login_needed: 'Connexion requise.', author_subtitle: 'Créer ou modifier des leçons.',
  parent_title: 'Espace parents', parent_load: 'Charger la progression', stub_coming_soon: 'Bientôt'
});

const STRINGS = { en: EN, es: ES, sw: SW, fr: FR };

export function getPortalLang() {
  try {
    const k = localStorage.getItem('agni_lang') || 'en';
    return STRINGS[k] ? k : 'en';
  } catch (e) { return 'en'; }
}

export function t(key) {
  const lang = getPortalLang();
  const table = STRINGS[lang] || STRINGS.en;
  if (table[key] != null) return table[key];
  return STRINGS.en[key] != null ? STRINGS.en[key] : key;
}

export function applyNavI18n() {
  const navMap = [
    ['[data-nav="home"]', 'nav_home'], ['[data-nav="learn"]', 'nav_learn'], ['[data-nav="hub"]', 'nav_hub'],
    ['[data-nav="hub/collab"]', 'nav_collab'], ['[data-nav="groups"]', 'nav_groups'], ['[data-nav="students"]', 'nav_students'],
    ['[data-nav="author"]', 'nav_author'], ['[data-nav="author/browse"]', 'nav_browse'], ['[data-nav="leaderboard"]', 'nav_leaderboard'],
    ['[data-nav="parent"]', 'nav_parent'], ['[data-nav="governance"]', 'nav_governance'], ['[data-nav="admin"]', 'nav_admin'],
    ['[data-nav="settings"]', 'nav_settings']
  ];
  navMap.forEach(([sel, k]) => {
    const el = document.querySelector('#main-nav a' + sel);
    if (el) el.textContent = t(k);
  });
  const logo = document.querySelector('.logo');
  if (logo) logo.textContent = t('logo');
  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = t('skip');
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (menuBtn) menuBtn.setAttribute('aria-label', t('menu_toggle'));
}

export function announcePortal(msg) {
  const el = document.getElementById('portal-aria-live');
  if (!el) return;
  el.textContent = '';
  setTimeout(function () { el.textContent = msg; }, 50);
}
