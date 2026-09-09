/* Loaded in the head so the browser's install event cannot be missed. */
(function () {
  'use strict';
  var memory = {};
  window.CampusCartStorage = {
    get: function (key) {
      try { return window.localStorage.getItem(key) || memory[key] || null; }
      catch (error) { return memory[key] || null; }
    },
    set: function (key, value) {
      memory[key] = String(value);
      try { window.localStorage.setItem(key, String(value)); } catch (error) { /* Browsing still works. */ }
    }
  };
  // Small compatibility shims for older Android browsers.
  if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
  if (!Object.entries) Object.entries = function (object) {
    return Object.keys(object).map(function (key) { return [key, object[key]]; });
  };
  if (!Array.prototype.includes) Object.defineProperty(Array.prototype, 'includes', {
    value: function (value, from) {
      var length = this.length >>> 0;
      var start = Number(from) || 0;
      var i = Math.max(start < 0 ? length + Math.ceil(start) : Math.floor(start), 0);
      for (; i < length; i += 1) {
        if (this[i] === value || (this[i] !== this[i] && value !== value)) return true;
      }
      return false;
    }, configurable: true, writable: true
  });
  if (!String.prototype.includes) String.prototype.includes = function (text, from) { return this.indexOf(text, from || 0) !== -1; };
  if (!String.prototype.startsWith) String.prototype.startsWith = function (text, from) {
    return this.substr(Math.max(Number(from) || 0, 0), String(text).length) === String(text);
  };
  if (!String.prototype.padStart) String.prototype.padStart = function (length, fill) {
    var value = String(this);
    var padding = fill === undefined ? ' ' : String(fill);
    var missing = Math.max(Number(length) - value.length, 0);
    if (!padding || !missing) return value;
    while (padding.length < missing) padding += padding;
    return padding.slice(0, missing) + value;
  };
  if (window.Element && !Element.prototype.closest) {
    Element.prototype.matches = Element.prototype.matches || Element.prototype.webkitMatchesSelector || Element.prototype.msMatchesSelector;
    Element.prototype.closest = function (selector) {
      var element = this;
      while (element && element.nodeType === 1) {
        if (element.matches(selector)) return element;
        element = element.parentElement;
      }
      return null;
    };
  }

  var pendingPrompt = null;
  var banner = null;
  var installButton = null;
  var dismissed = false;
  var installed = false;
  var registering = false;
  var registration = null;
  try { dismissed = window.sessionStorage.getItem('campusCartInstallDismissed') === '1'; } catch (error) { /* Optional preference. */ }
  function standalone() {
    return installed || window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function updateBanner() {
    if (!banner || !installButton) return;
    var visible = !!pendingPrompt && !dismissed && !standalone();
    banner.hidden = !visible;
    banner.classList.toggle('show', visible);
    installButton.disabled = !visible;
  }
  function status(message) {
    var element = document.getElementById('installStatus');
    if (element) { element.textContent = message; element.hidden = !message; }
  }
  window.addEventListener('beforeinstallprompt', function (event) {
    // Never advertise a button unless the browser supplies a real install prompt.
    if (typeof event.prompt !== 'function') return;
    event.preventDefault();
    pendingPrompt = event;
    status('');
    updateBanner();
  });
  window.addEventListener('appinstalled', function () {
    installed = true;
    pendingPrompt = null;
    updateBanner();
    status('');
    if (navigator.storage && navigator.storage.persist) {
      try { navigator.storage.persist().catch(function () {}); } catch (error) { /* Optional API. */ }
    }
  });
  function install() {
    if (!pendingPrompt || standalone()) { updateBanner(); return; }
    var prompt = pendingPrompt;
    pendingPrompt = null; // A browser install event can only be used once.
    updateBanner();
    status('');
    function failed() { status('Installation could not start. Reopen Campus Cart in your browser and try again.'); }
    try {
      // Call directly from the tap; awaiting another task would lose user activation.
      var result = prompt.prompt();
      if (result && typeof result.catch === 'function') result.catch(failed);
      var choice = prompt.userChoice || result;
      if (choice && typeof choice.then === 'function') choice.then(function (answer) {
        if (answer && answer.outcome === 'dismissed') dismissed = true;
        updateBanner();
      }, failed);
    } catch (error) { failed(); }
  }
  function updateConnection() {
    var element = document.getElementById('connectionStatus');
    if (element) element.hidden = navigator.onLine !== false;
  }
  function registerWorker() {
    if (registering || !('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    if (registration) { registration.update().catch(function () {}); return; }
    registering = true;
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function (worker) {
      registration = worker;
      registering = false;
      // No controllerchange reload: preserve the customer's current cart.
    }, function () { registering = false; });
  }
  function ready() {
    banner = document.getElementById('installBanner');
    installButton = document.getElementById('installApp');
    var dismissButton = document.getElementById('dismissInstall');
    if (banner && installButton && dismissButton) {
      installButton.addEventListener('click', install);
      dismissButton.addEventListener('click', function () {
        dismissed = true;
        try { window.sessionStorage.setItem('campusCartInstallDismissed', '1'); } catch (error) { /* In-memory fallback. */ }
        updateBanner();
      });
      updateBanner();
    }
    updateConnection();
    registerWorker();
  }
  window.addEventListener('online', function () { updateConnection(); registerWorker(); });
  window.addEventListener('offline', updateConnection);
  window.addEventListener('pageshow', function () { updateConnection(); updateBanner(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}());
