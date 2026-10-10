// Передача данных пользователя счётчику SberAds (Топ-100) — учебный проект.
//
// Это классический скрипт, не модуль: он должен выполниться ДО кода счётчика,
// поэтому подключается обычным <script src="js/analytics.js"></script> перед ним.
//
// Что передаётся, если пользователь авторизован (в профиле есть имя и телефон):
// - phone — телефон в формате 79999999999. Счётчик шифрует его сам перед отправкой;
// - user_id — идентификатор пользователя: SHA-256 от номера телефона (hex).
//   Телефон — это ключ пользователя в базе (users/{телефон}), поэтому id один и тот же
//   на всех устройствах. Сам номер в user_id не попадает: счётчик передаёт его как есть.
// Имя не передаётся: параметра для него у счётчика нет.

(function () {
  'use strict';

  // Профиль с устройства, если пользователь авторизован (как getMe() в common.js).
  function readProfile() {
    try {
      var raw = localStorage.getItem('skinemsya:me');
      var me = raw ? JSON.parse(raw) : null;
      if (!me || typeof me !== 'object' || !me.name) return null;
      return /^7\d{10}$/.test(String(me.phone || '')) ? me : null;
    } catch (e) {
      return null; // хранилище недоступно (приватный режим и т. п.)
    }
  }

  // Синхронный SHA-256 для ASCII-строки: crypto.subtle асинхронный,
  // а параметры нужны счётчику сразу при создании.
  function sha256(ascii) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    // Дополнение сообщения: байт 0x80, нули и длина в битах (хватает 32 бит).
    var bytes = [];
    for (var i = 0; i < ascii.length; i++) bytes.push(ascii.charCodeAt(i) & 0xff);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

    var w = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        var j = off + t * 4;
        w[t] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }

    var hex = '';
    for (i = 0; i < 8; i++) hex += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return hex;
  }

  window.skAnalytics = {
    // Добавляет телефон и user_id пользователя в параметры счётчика (options). Возвращает options.
    apply: function (options) {
      var me = readProfile();
      if (me) {
        options.phone = String(me.phone);
        options.user_id = sha256(String(me.phone));
      }
      return options;
    }
  };
})();
