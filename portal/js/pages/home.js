import { t } from '../i18n.js';

export function render(main) {
  main.innerHTML = `
    <div class="top-page">
      <h1>${esc(t('home_title'))}</h1>
      <p class="tagline">${esc(t('home_tagline'))}</p>

      <div class="cards">
        <a href="#/hub" class="card card-link">
          <h2>${esc(t('card_hub'))}</h2>
          <p>${esc(t('card_hub_desc'))}</p>
        </a>
        <a href="#/groups" class="card card-link">
          <h2>${esc(t('card_groups'))}</h2>
          <p>${esc(t('card_groups_desc'))}</p>
        </a>
        <a href="#/author/new" class="card card-link">
          <h2>${esc(t('card_author'))}</h2>
          <p>${esc(t('card_author_desc'))}</p>
        </a>
        <a href="#/parent/dashboard" class="card card-link">
          <h2>${esc(t('card_parent'))}</h2>
          <p>${esc(t('card_parent_desc'))}</p>
        </a>
        <a href="#/leaderboard" class="card card-link">
          <h2>${esc(t('card_leaderboard'))}</h2>
          <p>${esc(t('card_leaderboard_desc'))}</p>
        </a>
        <a href="#/governance/setup" class="card card-link">
          <h2>${esc(t('card_governance'))}</h2>
          <p>${esc(t('card_governance_desc'))}</p>
        </a>
        <a href="#/admin/onboarding" class="card card-link">
          <h2>${esc(t('card_admin'))}</h2>
          <p>${esc(t('card_admin_desc'))}</p>
        </a>
      </div>

      <p class="footer">${esc(t('home_footer_before'))}<a href="#/settings">${esc(t('nav_settings'))}</a>${esc(t('home_footer_after'))}</p>
    </div>
  `;
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
