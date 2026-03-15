/** Top indeterminate bar during route transitions */
let _bar = null;
let _hideT = null;

export function showRouteLoading() {
  if (!_bar) {
    _bar = document.createElement('div');
    _bar.id = 'portal-route-loading';
    _bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_bar);
  }
  _bar.classList.add('portal-route-loading--active');
  if (_hideT) clearTimeout(_hideT);
}

export function hideRouteLoading() {
  if (_hideT) clearTimeout(_hideT);
  _hideT = setTimeout(function () {
    if (_bar) _bar.classList.remove('portal-route-loading--active');
  }, 120);
}
