// Передача телефона счётчику SberAds (Топ-100) — учебный проект.
//
// Это классический скрипт, не модуль: он должен выполниться ДО кода счётчика,
// поэтому подключается обычным <script src="js/analytics.js"></script> перед ним.
//
// Что передаётся: телефон из профиля в формате 79999999999, если профиль заполнен.
// Счётчик шифрует номер сам перед отправкой (параметр phone в справке SberAds).
// Имя не передаётся: параметра для него у счётчика нет.

(function () {
  'use strict';

  function readProfile() {
    try {
      var raw = localStorage.getItem('skinemsya:me');
      var me = raw ? JSON.parse(raw) : null;
      return me && typeof me === 'object' ? me : null;
    } catch (e) {
      return null; // хранилище недоступно (приватный режим и т. п.)
    }
  }

  window.skAnalytics = {
    // Добавляет телефон пользователя в параметры счётчика (options). Возвращает options.
    apply: function (options) {
      var me = readProfile();
      if (me && /^7\d{10}$/.test(String(me.phone || ''))) {
        options.phone = String(me.phone);
      }
      return options;
    }
  };
})();
