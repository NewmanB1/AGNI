/**
 * Portal UI strings (nav, common). Lang from localStorage agni_lang.
 */
const STRINGS = {
  en: {
    nav_home: 'Home', nav_learn: 'Learn', nav_hub: 'Teacher Hub', nav_collab: 'Collaborative Sessions',
    nav_groups: 'Groups', nav_students: 'Students', nav_author: 'Author', nav_browse: 'Browse',
    nav_leaderboard: 'Leaderboard', nav_parent: 'Parent', nav_governance: 'Governance', nav_admin: 'Admin', nav_settings: 'Settings',
    logo: 'AGNI Portal', skip: 'Skip to content', menu_toggle: 'Toggle menu',
    home_title: 'AGNI Portal', home_tagline: 'Open Lesson Standard — offline, sensor-rich education',
    home_footer_before: 'Configure hub URL in ',
    home_footer_after: ' to connect to a live hub.',
    card_hub: 'Teacher Hub', card_hub_desc: 'Class overview, heterogeneity, recommendations, and overrides.',
    card_groups: 'Student Groups', card_groups_desc: 'Create groups and assign students from the roster.',
    card_author: 'Lesson Author', card_author_desc: 'Create or edit lessons: set metadata, steps, and save as YAML.',
    card_parent: 'Parent Dashboard', card_parent_desc: 'Link to your child with an invite code and view their progress.',
    card_leaderboard: 'Leaderboard', card_leaderboard_desc: 'Top lessons and creators: governance approved, most forked, high impact, effective learning.',
    card_governance: 'Governance', card_governance_desc: 'Policy, approved catalog, import and export.',
    card_admin: 'Admin', card_admin_desc: 'First-run onboarding or hub setup.'
  },
  es: {
    nav_home: 'Inicio', nav_learn: 'Aprender', nav_hub: 'Profesores', nav_collab: 'Sesiones colaborativas',
    nav_groups: 'Grupos', nav_students: 'Estudiantes', nav_author: 'Autor', nav_browse: 'Explorar',
    nav_leaderboard: 'Clasificación', nav_parent: 'Padres', nav_governance: 'Gobernanza', nav_admin: 'Admin', nav_settings: 'Ajustes',
    logo: 'Portal AGNI', skip: 'Ir al contenido', menu_toggle: 'Menú',
    home_title: 'Portal AGNI', home_tagline: 'Open Lesson Standard — educación con sensores, sin conexión',
    home_footer_before: 'Configure la URL del hub en ',
    home_footer_after: ' para conectar.',
    card_hub: 'Hub docente', card_hub_desc: 'Resumen de clases, heterogeneidad, recomendaciones.',
    card_groups: 'Grupos', card_groups_desc: 'Cree grupos y asigne estudiantes.',
    card_author: 'Autor de lecciones', card_author_desc: 'Cree o edite lecciones en YAML.',
    card_parent: 'Padres', card_parent_desc: 'Enlace con su hijo y vea el progreso.',
    card_leaderboard: 'Clasificación', card_leaderboard_desc: 'Lecciones y autores destacados.',
    card_governance: 'Gobernanza', card_governance_desc: 'Política y catálogo aprobado.',
    card_admin: 'Admin', card_admin_desc: 'Configuración inicial del hub.'
  },
  sw: {
    nav_home: 'Nyumbani', nav_learn: 'Jifunze', nav_hub: 'Walimu', nav_collab: 'Vikao vya kushirikiana',
    nav_groups: 'Makundi', nav_students: 'Wanafunzi', nav_author: 'Mwandishi', nav_browse: 'Vinjari',
    nav_leaderboard: 'Ranki', nav_parent: 'Mzazi', nav_governance: 'Utawala', nav_admin: 'Admin', nav_settings: 'Mipangilio',
    logo: 'Portal AGNI', skip: 'Ruka kwenda maudhui', menu_toggle: 'Menyu',
    home_title: 'Portal AGNI', home_tagline: 'Open Lesson Standard — elimu yenye sensa, nje ya mtandao',
    home_footer_before: 'Weka URL ya hub katika ',
    home_footer_after: '.',
    card_hub: 'Kituo cha walimu', card_hub_desc: 'Muhtasari wa darasa, mapendekezo.',
    card_groups: 'Makundi', card_groups_desc: 'Unda makundi na wape wanafunzi.',
    card_author: 'Mwandishi wa masomo', card_author_desc: 'Unda masomo YAML.',
    card_parent: 'Wazazi', card_parent_desc: 'Unganisha na mtoto na maendeleo.',
    card_leaderboard: 'Ranki', card_leaderboard_desc: 'Masomo na waandishi bora.',
    card_governance: 'Utawala', card_governance_desc: 'Sera na katalogi.',
    card_admin: 'Admin', card_admin_desc: 'Sanidi hub.'
  },
  fr: {
    nav_home: 'Accueil', nav_learn: 'Apprendre', nav_hub: 'Enseignants', nav_collab: 'Sessions collaboratives',
    nav_groups: 'Groupes', nav_students: 'Élèves', nav_author: 'Auteur', nav_browse: 'Parcourir',
    nav_leaderboard: 'Classement', nav_parent: 'Parents', nav_governance: 'Gouvernance', nav_admin: 'Admin', nav_settings: 'Réglages',
    logo: 'Portail AGNI', skip: 'Aller au contenu', menu_toggle: 'Menu',
    home_title: 'Portail AGNI', home_tagline: 'Open Lesson Standard — éducation hors ligne et capteurs',
    home_footer_before: 'Configurez l’URL du hub dans ',
    home_footer_after: '.',
    card_hub: 'Hub enseignant', card_hub_desc: 'Vue classe, recommandations.',
    card_groups: 'Groupes', card_groups_desc: 'Créer des groupes et assigner.',
    card_author: 'Auteur de leçons', card_author_desc: 'Créer ou éditer des leçons YAML.',
    card_parent: 'Parents', card_parent_desc: 'Lier votre enfant et voir la progression.',
    card_leaderboard: 'Classement', card_leaderboard_desc: 'Leçons et auteurs en tête.',
    card_governance: 'Gouvernance', card_governance_desc: 'Politique et catalogue.',
    card_admin: 'Admin', card_admin_desc: 'Première configuration du hub.'
  }
};

export function getPortalLang() {
  try {
    const k = localStorage.getItem('agni_lang') || 'en';
    return STRINGS[k] ? k : 'en';
  } catch (e) { return 'en'; }
}

export function t(key) {
  const lang = getPortalLang();
  const table = STRINGS[lang] || STRINGS.en;
  return table[key] != null ? table[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
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
