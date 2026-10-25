(function () {
  var AI = window.NutritionAI;
  var NUTRIENTS = AI.NUTRIENTS;
  var NUTRIENT_BY_KEY = {};
  NUTRIENTS.forEach(function (n) {
    NUTRIENT_BY_KEY[n.key] = n;
  });

  var viewEl = document.getElementById('view');
  var titleEl = document.getElementById('pageTitle');
  var backBtn = document.getElementById('backBtn');
  var busyEl = document.getElementById('busy');
  var busyTextEl = document.getElementById('busyText');
  var photoInput = document.getElementById('photoInput');
  var backupInput = document.getElementById('backupInput');

  // Days the full-size meal photo is kept (today counts as day 1); the thumbnail is kept for good.
  var PHOTO_KEEP_DAYS = 7;

  var cap = window.Capacitor;
  var plugins = cap && cap.Plugins ? cap.Plugins : {};
  var isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  // Where the data is kept, in the words shown to the user: the APK or the web version.
  var ON_DEVICE = isNative ? 'trên điện thoại này' : 'trong trình duyệt này';

  // ---- Small helpers ----

  /** h('div', { class: 'card', onclick: fn }, child, 'text', [children]) */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (name) {
      var value = attrs[name];
      if (value === null || value === undefined || value === false) {
        return;
      }
      if (name.indexOf('on') === 0) {
        el.addEventListener(name.slice(2), value);
      } else if (name === 'class') {
        el.className = value;
      } else if (name === 'value') {
        el.value = value;
      } else {
        el.setAttribute(name, value === true ? '' : value);
      }
    });
    append(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function append(el, children) {
    children.forEach(function (c) {
      if (c === null || c === undefined || c === false) {
        return;
      }
      if (Array.isArray(c)) {
        append(el, c);
      } else {
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      }
    });
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function timeLabel(d) {
    d = d || new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  var WEEKDAYS = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

  function dayTitle(key) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmt(value, unit) {
    var v = Number(value) || 0;
    var digits = (unit === 'g' && Math.abs(v) < 10) ? 1 : 0;
    return v.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function fmtAmount(key, value) {
    var n = NUTRIENT_BY_KEY[key];
    return n ? fmt(value, n.unit) + ' ' + n.unit : fmt(value);
  }

  function emptyTotals() {
    var t = {};
    NUTRIENTS.forEach(function (n) {
      t[n.key] = 0;
    });
    return t;
  }

  function sumNutrients(meals) {
    var t = emptyTotals();
    meals.forEach(function (m) {
      NUTRIENTS.forEach(function (n) {
        t[n.key] += Number(m.nutrients && m.nutrients[n.key]) || 0;
      });
    });
    return t;
  }

  function scaleNutrients(nutrients, factor) {
    var t = {};
    NUTRIENTS.forEach(function (n) {
      t[n.key] = (Number(nutrients[n.key]) || 0) * factor;
    });
    return t;
  }

  function roundAll(totals) {
    var t = {};
    Object.keys(totals).forEach(function (k) {
      t[k] = Math.round(totals[k] * 10) / 10;
    });
    return t;
  }

  function showBusy(text) {
    busyTextEl.textContent = text;
    busyEl.hidden = false;
  }

  function hideBusy() {
    busyEl.hidden = true;
  }

  function ageFrom(birthDate) {
    if (!birthDate) {
      return null;
    }
    var b = new Date(birthDate);
    var now = new Date();
    var age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) {
      age--;
    }
    return age;
  }

  // ---- Stored data ----

  // The last settings read, so screens can tell synchronously which way Claude is asked.
  var settingsCache = { apiKey: '', totalCostUsd: 0, requestCount: 0 };

  function loadSettings() {
    return Db.getKv('settings').then(function (s) {
      settingsCache = s || { apiKey: '', totalCostUsd: 0, requestCount: 0 };
      return settingsCache;
    });
  }

  function saveSettings(s) {
    settingsCache = s;
    return Db.setKv('settings', s);
  }

  /**
   * How the AI is asked: 'app' shares the question to the Claude app (free with a Claude Pro
   * plan) and the user pastes the reply back; 'api' calls the Claude API with the user's key
   * (paid); 'gemini', 'groq', 'openrouter' and 'cohere' call that free service with
   * the user's own free key.
   */
  function askMode(settings) {
    settings = settings || settingsCache;
    // A service that has since been removed from the app (e.g. Mistral) counts as not chosen.
    var known = settings.mode === 'app' || settings.mode === 'api' || !!FREE_SERVICES[settings.mode];
    return known ? settings.mode : (settings.apiKey ? 'api' : 'app');
  }

  // The free services: settings key field and the name shown while waiting.
  var FREE_SERVICES = {
    gemini: { key: 'geminiKey', name: 'Gemini' },
    groq: { key: 'groqKey', name: 'Groq' },
    openrouter: { key: 'openrouterKey', name: 'OpenRouter' },
    cohere: { key: 'cohereKey', name: 'Cohere' }
  };

  /** True for the modes where the answer comes back straight into the app (one tap). */
  function isDirect(mode) {
    return mode === 'api' || !!FREE_SERVICES[mode];
  }

  function addCost(costUsd) {
    return loadSettings().then(function (s) {
      s.totalCostUsd = (s.totalCostUsd || 0) + costUsd;
      s.requestCount = (s.requestCount || 0) + 1;
      return saveSettings(s);
    });
  }

  /** The profile as sent to Claude: what matters for nutrition, with age and BMI worked out. */
  function profileForAi(profile) {
    if (!profile) {
      return {};
    }
    var bmi = profile.height_cm && profile.weight_kg
      ? Math.round(profile.weight_kg / Math.pow(profile.height_cm / 100, 2) * 10) / 10 : null;
    return {
      sex: profile.sex || null,
      age: ageFrom(profile.birthDate),
      height_cm: profile.height_cm || null,
      weight_kg: profile.weight_kg || null,
      bmi: bmi,
      activity_level: profile.activity || null,
      goal: profile.goal || null,
      conditions_and_medicines: profile.conditions || '',
      diet_notes_and_allergies: profile.dietNotes || ''
    };
  }

  var API_FUNCTIONS = { meal: 'analyzeMeal', targets: 'computeTargets', plan: 'planRestOfDay', labs: 'readLabReport' };

  /**
   * Asks Claude for request `kind` ('meal' | 'targets' | 'plan' | 'labs'); buildArgs(profile, labs)
   * gives the request's details. API mode resolves to the result. Claude app mode shares the
   * question to the Claude app and resolves to null — the result comes later through pasteReply().
   */
  function askClaude(kind, busyText, buildArgs) {
    return loadSettings().then(function (settings) {
      var mode = askMode(settings);
      var free = FREE_SERVICES[mode];
      if (mode === 'api' && !settings.apiKey || free && !settings[free.key]) {
        alert('Chưa có API key. Vào Cài đặt để nhập API key, hoặc chọn hỏi qua ứng dụng Claude (miễn phí).');
        location.hash = '#settings';
        return null;
      }
      return Promise.all([Db.getKv('profile'), Db.getAll('labs')]).then(function (r) {
        var args = buildArgs(profileForAi(r[0]), r[1]);
        if (mode === 'app') {
          return shareToClaude(AI.manualRequest(kind, args)).then(function () {
            return null;
          });
        }
        if (free) {
          showBusy(busyText.replace('Claude', free.name));
          args.apiKey = settings[free.key];
          args.speed = settings.geminiSpeed;
          return AI.askFree(mode, kind, args).then(function (answer) {
            hideBusy();
            return answer.result;
          });
        }
        showBusy(busyText);
        args.apiKey = settings.apiKey;
        return AI[API_FUNCTIONS[kind]](args).then(function (answer) {
          hideBusy();
          addCost(answer.costUsd);
          return answer.result;
        });
      }).catch(function (err) {
        hideBusy();
        alert(err && err.message ? err.message : String(err));
        return null;
      });
    });
  }

  // ---- Asking through the Claude app ----

  function isCancelError(err) {
    return /cancel/i.test(err && err.message || '');
  }

  /**
   * Opens the share sheet with the question and photos so the user can send them to the Claude
   * app. The question is also copied, in case the chosen app only takes the photos.
   */
  function shareToClaude(request) {
    window.__lastClaudeRequest = request; // lets the browser test see what was sent
    var copied = writeClipboard(request.text);
    if (isNative && plugins.Share && plugins.Filesystem) {
      return copied.then(function () {
        return Promise.all(request.images.map(function (base64, i) {
          return plugins.Filesystem.writeFile({ path: 'gui-claude-' + (i + 1) + '.jpg', data: base64, directory: 'CACHE' })
            .then(function (res) {
              return res.uri;
            });
        }));
      }).then(function (uris) {
        var options = { title: 'Hỏi Claude', text: request.text, dialogTitle: 'Chọn ứng dụng Claude' };
        if (uris.length) {
          options.files = uris;
        }
        return plugins.Share.share(options);
      }).catch(function (err) {
        if (!isCancelError(err)) {
          throw new Error('Không mở được chia sẻ: ' + (err && err.message ? err.message : err));
        }
      });
    }
    // Web version on a phone: the browser's share sheet can hand question and photos to the Claude app.
    var files = request.images.map(function (base64, i) {
      var bytes = atob(base64);
      var data = new Uint8Array(bytes.length);
      for (var j = 0; j < bytes.length; j++) {
        data[j] = bytes.charCodeAt(j);
      }
      return new File([data], 'gui-claude-' + (i + 1) + '.jpg', { type: 'image/jpeg' });
    });
    var shareData = files.length ? { title: 'Hỏi Claude', text: request.text, files: files } : { title: 'Hỏi Claude', text: request.text };
    var onPhone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (onPhone && navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      return copied.then(function () {
        return navigator.share(shareData);
      }).catch(function (err) {
        if (!err || err.name !== 'AbortError') {
          throw new Error('Không mở được chia sẻ: ' + (err && err.message ? err.message : err));
        }
      });
    }
    // Computer browser: the question is on the clipboard and the photos are downloaded, ready to
    // attach in claude.ai.
    return copied.then(function () {
      files.forEach(downloadFile);
      alert('Đã sao chép câu hỏi' + (files.length ? ' và tải về ' + files.length + ' ảnh (thư mục Tải xuống)' : '')
        + '. Mở claude.ai, dán câu hỏi' + (files.length ? ', đính kèm ảnh vừa tải' : '') + ' rồi gửi.');
    });
  }

  /** Saves a File to the browser's downloads (web version). */
  function downloadFile(file) {
    var url = URL.createObjectURL(file);
    var a = h('a', { href: url, download: file.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function writeClipboard(text) {
    if (isNative && plugins.Clipboard) {
      return plugins.Clipboard.write({ string: text }).catch(function () {});
    }
    return navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text).catch(function () {})
      : Promise.resolve();
  }

  /** Claude's reply from the clipboard; asks the user to paste it by hand if that isn't possible. */
  function readReply() {
    var read = isNative && plugins.Clipboard
      ? plugins.Clipboard.read().then(function (r) {
        return r && r.value;
      })
      : navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.resolve('');
    return read.catch(function () {
      return '';
    }).then(function (text) {
      if (text && text.indexOf('{') !== -1) {
        return text;
      }
      return askForReply();
    });
  }

  /**
   * An in-app paste box for Claude's reply. The system prompt() dialog grows with the text and
   * breaks the screen when a long reply is pasted; this box keeps a fixed height and scrolls.
   */
  function askForReply() {
    return new Promise(function (resolve) {
      var box = h('textarea', {
        class: 'paste-box',
        placeholder: 'Giữ ô này → Dán',
        spellcheck: 'false',
        autocomplete: 'off'
      });
      function close(text) {
        document.body.removeChild(overlay);
        resolve(text);
      }
      var overlay = h('div', { class: 'paste-overlay' },
        h('div', { class: 'paste-dialog', role: 'dialog', 'aria-label': 'Dán câu trả lời của Claude' },
          h('p', null, 'Chưa thấy câu trả lời của Claude trong bộ nhớ tạm. Hãy dán câu trả lời vào đây:'),
          box,
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn', type: 'button', onclick: function () { close(''); } }, 'Hủy'),
            h('button', { class: 'btn primary', type: 'button', onclick: function () { close(box.value); } }, 'Xong'))));
      document.body.appendChild(overlay);
      box.focus();
    });
  }

  /** Reads the copied reply for request `kind` and hands the checked result to onResult. */
  function pasteReply(kind, onResult) {
    return readReply().then(function (text) {
      if (!text.trim()) {
        return;
      }
      var result;
      try {
        result = AI.parseManualReply(kind, text);
      } catch (err) {
        alert(err.message);
        return;
      }
      return onResult(result);
    });
  }

  /**
   * The ask buttons for one kind of request. API mode: one button. Claude app mode: send to the
   * Claude app, then paste its reply back, with a short how-to.
   */
  function askButtons(kind, label, onAsk, onResult, primary) {
    if (isDirect(askMode())) {
      return h('button', { class: 'btn' + (primary ? ' primary' : ''), type: 'button', onclick: onAsk }, label);
    }
    return h('div', null,
      h('button', { class: 'btn' + (primary ? ' primary' : ''), type: 'button', onclick: onAsk }, '📤 ' + label + ' — gửi cho ứng dụng Claude'),
      h('button', {
        class: 'btn',
        type: 'button',
        onclick: function () {
          pasteReply(kind, onResult);
        }
      }, '📋 Dán câu trả lời của Claude'),
      h('p', { class: 'muted small' }, 'Chọn ứng dụng Claude → bấm gửi → khi Claude trả lời xong, bấm nút sao chép (Copy) dưới câu trả lời → quay lại đây bấm "Dán câu trả lời". Nếu câu hỏi không hiện trong Claude, giữ ô nhập và chọn Dán.'));
  }

  // ---- Photos ----

  function resizeToJpeg(dataUrl, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () {
        reject(new Error('Không đọc được ảnh.'));
      };
      img.src = dataUrl;
    });
  }

  function isCancel(err) {
    return /cancel|no image picked/i.test(err && err.message || '');
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsDataURL(file);
    });
  }

  /** Outside the app (browser testing): the hidden file box, one or several files. */
  function pickFromFileInput(multiple) {
    return new Promise(function (resolve) {
      photoInput.value = '';
      photoInput.multiple = !!multiple;
      photoInput.onchange = function () {
        resolve(Promise.all(Array.prototype.map.call(photoInput.files || [], readFileAsDataUrl)));
      };
      photoInput.click();
    });
  }

  // source: 'PROMPT' (ask camera or gallery) or 'CAMERA'
  function pickRawPhoto(title, source) {
    if (isNative && plugins.Camera) {
      return plugins.Camera.getPhoto({
        resultType: 'dataUrl',
        source: source || 'PROMPT',
        quality: 85,
        width: 1600,
        correctOrientation: true,
        saveToGallery: false,
        promptLabelHeader: title,
        promptLabelPhoto: 'Chọn từ thư viện',
        promptLabelPicture: 'Chụp ảnh',
        promptLabelCancel: 'Hủy'
      }).then(function (photo) {
        return photo.dataUrl;
      }, function (err) {
        if (isCancel(err)) {
          return null;
        }
        throw err;
      });
    }
    return pickFromFileInput(false).then(function (urls) {
      return urls[0] || null;
    });
  }

  /** Several photos from the gallery at once; resolves to a list of data URLs (empty if cancelled). */
  function pickRawGalleryPhotos() {
    if (isNative && plugins.Camera) {
      return plugins.Camera.pickImages({ quality: 85, width: 1600, correctOrientation: true, limit: 10 })
        .then(function (result) {
          return Promise.all(result.photos.map(function (p) {
            return fetch(p.webPath).then(function (res) {
              return res.blob();
            }).then(readFileAsDataUrl);
          }));
        }, function (err) {
          if (isCancel(err)) {
            return [];
          }
          throw err;
        });
    }
    return pickFromFileInput(true);
  }

  /** A 1280px JPEG for Claude, a preview and a small thumbnail to keep. */
  function preparePhoto(dataUrl) {
    return Promise.all([resizeToJpeg(dataUrl, 1280, 0.82), resizeToJpeg(dataUrl, 320, 0.7)]).then(function (r) {
      return { base64: r[0].split(',')[1], preview: r[0], thumb: r[1] };
    });
  }

  function reportPhotoError(err) {
    alert('Không lấy được ảnh: ' + (err && err.message ? err.message : err));
  }

  /** Resolves to one prepared photo, or null if cancelled. */
  function pickPhoto(title, source) {
    return pickRawPhoto(title, source).then(function (dataUrl) {
      return dataUrl ? preparePhoto(dataUrl) : null;
    }).catch(function (err) {
      reportPhotoError(err);
      return null;
    });
  }

  /** Resolves to a list of prepared photos chosen from the gallery (empty if cancelled). */
  function pickGalleryPhotos() {
    return pickRawGalleryPhotos().then(function (urls) {
      return Promise.all(urls.map(preparePhoto));
    }).catch(function (err) {
      reportPhotoError(err);
      return [];
    });
  }

  // ---- Nutrient bars ----

  function statusOf(value, range) {
    if (!range || (range.min === null && range.max === null)) {
      return 'none';
    }
    if (range.max !== null && value > range.max) {
      return 'over';
    }
    if (range.min !== null && value < range.min) {
      return 'under';
    }
    return 'ok';
  }

  function nutrientBar(key, value, range) {
    var n = NUTRIENT_BY_KEY[key];
    var status = statusOf(value, range);
    var ref = range ? (range.min !== null ? range.min : range.max) : null;
    var pct = ref ? Math.min(100, value / ref * 100) : 0;
    var valueText = fmt(value, n.unit) + (ref !== null && ref !== undefined ? ' / ' + fmt(ref, n.unit) : '') + ' ' + n.unit;
    var tag = null;
    if (status === 'over') {
      tag = h('span', { class: 'tag over' }, 'Thừa ' + fmtAmount(key, value - range.max));
    } else if (status === 'under') {
      tag = h('span', { class: 'tag under' }, 'Thiếu ' + fmtAmount(key, range.min - value));
    } else if (status === 'ok') {
      tag = h('span', { class: 'tag ok' }, range.min !== null ? 'Đạt' : 'Trong giới hạn');
    }
    var bar = h('div', { class: 'bar' });
    var fill = h('span');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    return h('div', { class: 'nutrient status-' + status },
      h('div', { class: 'nutrient-head' },
        h('span', null, n.name, tag),
        h('span', { class: 'value' }, valueText)),
      bar);
  }

  function nutrientBars(totals, targets) {
    var ranges = targets ? targets.targets : null;
    var main = NUTRIENTS.filter(function (n) {
      return n.group === 'main';
    });
    var micro = NUTRIENTS.filter(function (n) {
      return n.group !== 'main';
    });
    var microBox = h('div', { hidden: true },
      micro.map(function (n) {
        return nutrientBar(n.key, totals[n.key], ranges && ranges[n.key]);
      }));
    var toggle = h('button', {
      class: 'link-btn',
      type: 'button',
      onclick: function () {
        microBox.hidden = !microBox.hidden;
        toggle.textContent = microBox.hidden ? '▸ Vitamin & khoáng chất' : '▾ Ẩn vitamin & khoáng chất';
      }
    }, '▸ Vitamin & khoáng chất');
    return [
      main.map(function (n) {
        return nutrientBar(n.key, totals[n.key], ranges && ranges[n.key]);
      }),
      toggle,
      microBox
    ];
  }

  // Nutrients whose rows also list which foods in the meal they come from.
  var BREAKDOWN_KEYS = ['sat_fat_g', 'cholesterol_mg'];

  /**
   * Table rows for the given nutrient keys. Items are the meal's foods with their own nutrients
   * (meals analysed before v1.14 have none), scaled by the share of the meal eaten.
   */
  function nutrientRows(keys, nutrients, items, portion) {
    var rows = [];
    keys.forEach(function (key) {
      var n = NUTRIENT_BY_KEY[key];
      rows.push(h('tr', null, h('td', null, n.name), h('td', null, fmtAmount(key, nutrients[key]))));
      if (BREAKDOWN_KEYS.indexOf(key) === -1) {
        return;
      }
      (items || []).filter(function (i) {
        // Below what the table can show (0.1 g / 1 mg) isn't worth a line.
        return i.nutrients && i.nutrients[key] * portion >= (n.unit === 'g' ? 0.05 : 0.5);
      }).sort(function (a, b) {
        return b.nutrients[key] - a.nutrients[key];
      }).forEach(function (i) {
        rows.push(h('tr', { class: 'sub' }, h('td', null, '↳ ' + i.name), h('td', null, fmtAmount(key, i.nutrients[key] * portion))));
      });
    });
    return rows;
  }

  function nutrientTable(nutrients, items, portion) {
    return h('table', { class: 'simple' }, h('tbody', null, nutrientRows(NUTRIENTS.map(function (n) {
      return n.key;
    }), nutrients, items, portion || 1)));
  }

  // ---- Exercise ----

  // What can be logged. Energy uses MET values (Compendium of Physical Activities); counted
  // exercises (sets, skips, reps) are turned into minutes with a typical pace.
  // Counted in times (lần: reps, skips, badminton sets) or in minutes (phút: holds, time in the sun).
  var EXERCISES = [
    { id: 'skipping', name: 'Skipping (6mm Rope)', unit: 'lần', perMinute: 110, met: 11.8 },
    { id: 'sit-up', name: 'Sit-up', unit: 'lần', perMinute: 25, met: 3.8 },
    { id: 'plank', name: 'Plank', unit: 'phút', met: 3.8 },
    { id: 'push-up', name: 'Push-up', unit: 'lần', perMinute: 25, met: 8 },
    { id: 'bench-dip', name: 'Bench Dip', unit: 'lần', perMinute: 20, met: 5 },
    { id: 'kb-halo', name: 'Kettlebell Halo (5kg)', unit: 'lần', perMinute: 20, met: 3.5 },
    { id: 'kb-around-world', name: 'Kettlebell Around the World (5kg)', unit: 'lần', perMinute: 25, met: 3.5 },
    { id: 'goblet-squat', name: 'Goblet Squat (5kg)', unit: 'lần', perMinute: 20, met: 5 },
    { id: 'lunge', name: 'Lunge', unit: 'lần', perMinute: 20, met: 4 },
    { id: 'kb-goblet-curl', name: 'Kettlebell Goblet Curl (5kg)', unit: 'lần', perMinute: 20, met: 3.5 },
    { id: 'kb-triceps-ext', name: 'Kettlebell Overhead Triceps Extension (5kg)', unit: 'lần', perMinute: 20, met: 3.5 },
    { id: 'badminton-1', name: 'Badminton Set - 1 minute', unit: 'lần', minutesEach: 1, met: 5.5 },
    // Lying in the sun burns hardly more than resting (MET 1.3), so it adds almost nothing to targets.
    { id: 'sunbath', name: 'Sunbath (tắm nắng)', unit: 'phút', met: 1.3 }
  ];
  // What the amount field is called for each unit.
  var AMOUNT_LABEL = { set: 'Số set', 'lần': 'Số lần (Times)', 'phút': 'Số phút (Minutes)' };
  // Older choices, no longer offered but still needed to recompute or copy entries logged with them.
  var OLD_EXERCISES = [
    { id: 'badminton-10', name: 'Badminton Set - 10 mins', unit: 'lần', minutesEach: 10, met: 5.5 },
    { id: 'badminton-15', name: 'Badminton Set - 15 mins', unit: 'lần', minutesEach: 15, met: 5.5 },
    { id: 'badminton-set', name: 'Cầu lông', unit: 'set', minutesEach: 12, met: 5.5 },
    { id: 'badminton', name: 'Cầu lông', unit: 'phút', met: 5.5 },
    { id: 'rope', name: 'Nhảy dây', unit: 'lần', perMinute: 110, met: 11.8 },
    { id: 'pushup', name: 'Hít đất (chống đẩy)', unit: 'lần', perMinute: 25, met: 8 },
    { id: 'situp', name: 'Gập bụng / squat', unit: 'lần', perMinute: 25, met: 5 },
    { id: 'run', name: 'Chạy bộ', unit: 'phút', met: 8.3 },
    { id: 'walk', name: 'Đi bộ nhanh', unit: 'phút', met: 4.3 },
    { id: 'bike', name: 'Đạp xe', unit: 'phút', met: 7 },
    { id: 'swim', name: 'Bơi', unit: 'phút', met: 6 },
    { id: 'gym', name: 'Tập tạ / gym', unit: 'phút', met: 5 },
    { id: 'football', name: 'Bóng đá', unit: 'phút', met: 7 },
    { id: 'tennis', name: 'Tennis / pickleball', unit: 'phút', met: 6 },
    { id: 'yoga', name: 'Yoga / giãn cơ', unit: 'phút', met: 2.5 },
    { id: 'other', name: 'Môn khác (vừa sức)', unit: 'phút', met: 5 }
  ];
  var EXERCISE_BY_ID = {};
  EXERCISES.concat(OLD_EXERCISES).forEach(function (e) {
    EXERCISE_BY_ID[e.id] = e;
  });
  var DEFAULT_WEIGHT_KG = 65;

  /** Current name of a logged entry's exercise, so renamed exercises (6kg → 5kg) show the new name. */
  function exerciseName(e) {
    var ex = EXERCISE_BY_ID[e.type];
    return ex ? ex.name : e.name;
  }

  // ---- Vitamin D from the sun (Sunbath) ----
  //
  // Skin makes vitamin D from UVB. A rough estimate for Vietnam (strong UV, skin type III-IV):
  // the whole body in strong sun makes about 10 µg (400 IU) a minute; early morning or late
  // afternoon about 3 µg. Scaled by the share of skin in the sun, and only the first 30 minutes
  // count, since production levels off after that. Clouds, glass and sunscreen block most of it.
  var SUN_SKIN = {
    face: { label: 'Mặt + bàn tay', share: 0.1 },
    arms: { label: 'Tay + chân (áo thun, quần short)', share: 0.25 },
    most: { label: 'Phần lớn cơ thể', share: 0.6 }
  };
  var SUN_TIME = {
    mild: { label: 'Sáng sớm / chiều muộn', rate: 3 },
    strong: { label: '10h–15h (nắng gắt)', rate: 10 }
  };
  var SUN_MAX_MINUTES = 30;

  /** µg of vitamin D made in `minutes` of sun with that much skin out at that time of day. */
  function sunVitaminD(minutes, skin, time) {
    var s = SUN_SKIN[skin] || SUN_SKIN.arms;
    var t = SUN_TIME[time] || SUN_TIME.mild;
    return Math.round(t.rate * s.share * Math.min(minutes, SUN_MAX_MINUTES) * 10) / 10;
  }

  /** Nutrients taken in on a day: the meals, plus vitamin D made in the sun. */
  function dayIntake(meals, exercises) {
    var t = sumNutrients(meals);
    (exercises || []).forEach(function (e) {
      t.vitamin_d_ug += e.vitamin_d_ug || 0;
    });
    return t;
  }

  function sunFromExercises(exercises) {
    return Math.round((exercises || []).reduce(function (sum, e) {
      return sum + (e.vitamin_d_ug || 0);
    }, 0) * 10) / 10;
  }

  function exerciseMinutes(ex, amount) {
    return ex.minutesEach ? amount * ex.minutesEach : ex.perMinute ? amount / ex.perMinute : amount;
  }

  /** Energy burned above resting (MET − 1), since resting energy is already in the daily targets. */
  function exerciseKcal(ex, amount, weightKg) {
    return Math.round((ex.met - 1) * (weightKg || DEFAULT_WEIGHT_KG) * exerciseMinutes(ex, amount) / 60);
  }

  function exerciseTotal(exercises) {
    return exercises.reduce(function (sum, e) {
      return sum + e.kcal;
    }, 0);
  }

  // Share of the extra energy that goes to each macronutrient (kcal per g: carbs 4, protein 4, fat 9).
  var EXERCISE_SPLIT = { energy_kcal: 1, carbs_g: 0.55 / 4, protein_g: 0.15 / 4, fat_g: 0.3 / 9 };

  /**
   * The day's targets raised for the energy burned by its exercise. sunUg, the vitamin D the skin
   * made in the sun, raises the vitamin D maximum by that much: the upper limit is a safety limit
   * for food and supplements, and the body itself stops sun-made vitamin D from reaching harmful
   * levels, so sunshine alone never counts as "too much".
   */
  function withExercise(targets, kcal, sunUg) {
    if (!targets || (!kcal && !sunUg)) {
      return targets;
    }
    var ranges = Object.assign({}, targets.targets);
    Object.keys(EXERCISE_SPLIT).forEach(function (key) {
      var range = ranges[key];
      var extra = (kcal || 0) * EXERCISE_SPLIT[key];
      if (range) {
        ranges[key] = {
          min: range.min === null ? null : Math.round(range.min + extra),
          max: range.max === null ? null : Math.round(range.max + extra)
        };
      }
    });
    var d = ranges.vitamin_d_ug;
    if (sunUg && d && d.max !== null) {
      ranges.vitamin_d_ug = { min: d.min, max: Math.round((d.max + sunUg) * 10) / 10 };
    }
    return Object.assign({}, targets, { targets: ranges });
  }

  function exerciseForAi(exercises) {
    return exercises.map(function (e) {
      return { name: exerciseName(e), amount: e.amount, unit: e.unit, kcal: e.kcal, vitamin_d_ug: e.vitamin_d_ug || 0 };
    });
  }

  // Targets made before exercise logging counted workouts in; they need recomputing once.
  var TARGET_RULES_CHANGED = '2026-10-17T18:39:57.000Z';

  function targetsStale(targets, profile, labsUpdatedAt) {
    if (!targets) {
      return false;
    }
    var changed = [profile && profile.updatedAt, labsUpdatedAt, TARGET_RULES_CHANGED].filter(Boolean).sort().pop();
    return !!changed && changed > targets.computedAt;
  }

  // ---- Screens ----

  var TABS = ['today', 'food', 'workout', 'history', 'profile', 'settings'];

  function setScreen(title, tab, showBack) {
    titleEl.textContent = title;
    backBtn.hidden = !showBack;
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-tab') === tab);
    });
    viewEl.innerHTML = '';
    window.scrollTo(0, 0);
  }

  // Today (or a past day from Lịch sử)
  function renderDay(key) {
    var isToday = key === dayKey();
    setScreen(isToday ? 'Hôm nay · ' + dayTitle(key) : dayTitle(key), isToday ? 'today' : 'history', !isToday);
    return Promise.all([
      Db.getAllByIndex('meals', 'day', key), Db.getKv('targets'), Db.get('plans', key),
      Db.getKv('profile'), Db.getKv('labsUpdatedAt'), Db.getAllByIndex('exercises', 'day', key)
    ]).then(function (r) {
      var meals = r[0].sort(function (a, b) {
        return a.createdAt < b.createdAt ? -1 : 1;
      });
      var exercises = r[5];
      var burned = exerciseTotal(exercises);
      var targets = withExercise(r[1], burned, sunFromExercises(exercises));
      var plan = r[2];
      var profile = r[3];
      var totals = dayIntake(meals, exercises);
      var sun = sunFromExercises(exercises);

      if (!profile || !targets) {
        viewEl.appendChild(h('div', { class: 'card' },
          h('h2', null, 'Bắt đầu'),
          h('p', { class: 'muted' }, !profile
            ? 'Nhập hồ sơ sức khỏe (cân nặng, chiều cao, tuổi, xét nghiệm...) để ứng dụng biết bạn cần bao nhiêu mỗi chất.'
            : 'Hồ sơ đã có. Hãy tính mục tiêu dinh dưỡng mỗi ngày của bạn.'),
          h('a', { class: 'btn primary', href: '#profile' }, !profile ? 'Nhập hồ sơ sức khỏe' : 'Tính mục tiêu mỗi ngày')));
      } else if (targetsStale(targets, profile, r[4])) {
        viewEl.appendChild(h('div', { class: 'card' },
          h('p', { class: 'muted' }, 'Hồ sơ hoặc xét nghiệm đã thay đổi. Nên tính lại mục tiêu mỗi ngày.'),
          h('a', { class: 'btn', href: '#profile' }, 'Tính lại mục tiêu')));
      }

      viewEl.appendChild(h('div', { class: 'card' },
        h('h2', null, 'Tổng trong ngày'),
        meals.length === 0 ? h('p', { class: 'muted' }, 'Chưa có bữa ăn nào.') : null,
        burned && targets ? h('p', { class: 'muted small' }, '🏃 Mục tiêu đã cộng thêm ~' + burned + ' kcal nhờ tập luyện hôm nay.') : null,
        sun ? h('p', { class: 'muted small' }, '☀️ Vitamin D đã gồm ~' + fmt(sun, 'µg') + ' µg da tự tạo khi tắm nắng.') : null,
        nutrientBars(totals, targets)));

      if (isToday) {
        // Meals and workouts have their own tabs; today shows only a one-line count of each.
        viewEl.appendChild(h('div', { class: 'grid-2', style: 'margin:-10px 0 14px' },
          h('a', { class: 'btn', href: '#food' }, '🍽️ ' + meals.length + ' bữa ăn'),
          h('a', { class: 'btn', href: '#workout' }, '🏃 ' + exercises.length + ' bài tập' + (burned ? ' · ~' + burned + ' kcal' : ''))));
        viewEl.appendChild(planCard(key, meals, totals, targets, plan, exercises));
      } else {
        viewEl.appendChild(exerciseCard(key, exercises, profile));
        viewEl.appendChild(mealsCard(meals, false));
        viewEl.appendChild(h('button', {
          class: 'fab',
          type: 'button',
          onclick: function () {
            location.hash = '#add/' + key;
          }
        }, '+ Bữa ăn'));
      }
      viewEl.appendChild(h('p', { class: 'disclaimer' }, 'Số liệu là ước tính của AI, không thay thế lời khuyên của bác sĩ.'));
    });
  }

  function mealsCard(meals, isToday) {
    return h('div', { class: 'card' },
      h('h2', null, 'Bữa ăn (' + meals.length + ')'),
      meals.length === 0 ? h('p', { class: 'muted' }, isToday ? 'Trước khi ăn, bấm "+ Bữa ăn" và chụp ảnh món ăn.' : 'Không có bữa ăn.') : null,
      meals.map(function (m) {
        return h('a', { class: 'meal-row', href: '#meal/' + m.id },
          m.thumb ? h('img', { class: 'thumb', src: m.thumb, alt: '' }) : h('div', { class: 'thumb' }, '🍽️'),
          h('div', { class: 'info' },
            h('div', { class: 'name' }, m.name),
            h('div', { class: 'muted small' }, m.time + (m.portion !== 1 ? ' · ' + Math.round(m.portion * 100) + '% phần' : ''))),
          h('div', { class: 'kcal' }, fmt(m.nutrients.energy_kcal, 'kcal') + ' kcal'));
      }));
  }

  // Food: today's meals and adding one
  function renderFood() {
    var key = dayKey();
    setScreen('Food · ' + dayTitle(key), 'food', false);
    return Db.getAllByIndex('meals', 'day', key).then(function (meals) {
      meals.sort(function (a, b) {
        return a.createdAt < b.createdAt ? -1 : 1;
      });
      viewEl.appendChild(mealsCard(meals, true));
      viewEl.appendChild(h('button', {
        class: 'fab',
        type: 'button',
        onclick: function () {
          location.hash = '#add';
        }
      }, '+ Bữa ăn'));
    });
  }

  // Workout: today's exercise log
  function renderWorkout() {
    var key = dayKey();
    setScreen('Workout · ' + dayTitle(key), 'workout', false);
    return Promise.all([Db.getAllByIndex('exercises', 'day', key), Db.getKv('profile')]).then(function (r) {
      viewEl.appendChild(exerciseCard(key, r[0], r[1]));
    });
  }

  /** Redraws the day after an exercise change without jumping back to the top. */
  function rerenderKeepingScroll() {
    var y = window.scrollY;
    return Promise.resolve(route()).then(function () {
      window.scrollTo(0, y);
    });
  }

  function exerciseCard(key, exercises, profile) {
    var weight = profile && profile.weight_kg;
    var burned = exerciseTotal(exercises);
    var card = h('div', { class: 'card' }, h('h2', null, '🏃 Tập luyện' + (exercises.length ? ' (~' + burned + ' kcal)' : '')));

    if (exercises.length) {
      card.appendChild(h('div', null, exercises.map(function (e) {
        var row = h('div', { class: 'ex-row' },
          h('span', { class: 'name' }, exerciseName(e) + ' · ' + e.amount + ' ' + e.unit,
            e.vitamin_d_ug ? h('div', { class: 'muted small' }, '☀️ ~' + fmt(e.vitamin_d_ug, 'µg') + ' µg vitamin D · ' + (SUN_SKIN[e.sunSkin] || SUN_SKIN.arms).label.toLowerCase() + ', ' + (SUN_TIME[e.sunTime] || SUN_TIME.mild).label.toLowerCase()) : null),
          h('span', { class: 'kcal' }, '~' + e.kcal + ' kcal'),
          h('button', {
            type: 'button',
            'aria-label': 'Xóa ' + exerciseName(e),
            onclick: function () {
              Db.remove('exercises', e.id).then(rerenderKeepingScroll);
            }
          }, '✕'));
        var wrap = h('div', null, row);
        onLongPress(row, function () {
          if (!wrap.querySelector('form')) {
            wrap.appendChild(addMoreForm(e, weight));
          }
          // Cursor at the end of the prefilled number, ready to edit it.
          var input = wrap.querySelector('input');
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        });
        return wrap;
      })));
      card.appendChild(h('p', { class: 'muted small' }, 'Giữ một bài tập 0,5 giây để cộng thêm số lần / số phút.'));
    } else {
      card.appendChild(h('p', { class: 'muted' }, 'Hôm nay chưa tập? Nếu có tập, thêm vào đây để mục tiêu năng lượng của ngày tăng theo.'));
    }

    function addExercise(ex, amount) {
      var record = {
        day: key,
        createdAt: new Date().toISOString(),
        type: ex.id,
        name: ex.name,
        amount: amount,
        unit: ex.unit,
        minutes: Math.round(exerciseMinutes(ex, amount)),
        kcal: exerciseKcal(ex, amount, weight)
      };
      if (ex.id === 'sunbath') {
        record.sunSkin = skinSelect.value;
        record.sunTime = timeSelect.value;
        record.vitamin_d_ug = sunVitaminD(amount, record.sunSkin, record.sunTime);
      }
      return Db.put('exercises', record);
    }

    function sunOptions(map, selected) {
      return Object.keys(map).map(function (k) {
        var o = h('option', { value: k }, map[k].label);
        o.selected = k === selected;
        return o;
      });
    }
    var skinSelect = h('select', null, sunOptions(SUN_SKIN, 'arms'));
    var timeSelect = h('select', null, sunOptions(SUN_TIME, 'mild'));
    var sunBox = h('div', { hidden: true },
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, 'Phần da để nắng', skinSelect),
        h('label', { class: 'field' }, 'Giờ tắm nắng', timeSelect)),
      h('p', { class: 'muted small', style: 'margin-top:-6px' }, 'Không bôi kem chống nắng, không qua kính; trời nhiều mây thì da tạo ít hơn.'));

    var typeSelect = h('select', { name: 'type' }, EXERCISES.map(function (e) {
      return h('option', { value: e.id }, e.name);
    }));
    var amountInput = h('input', { name: 'amount', type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'VD: 20' });
    var unitLabel = h('span', null, 'Số lần (Times)');
    var preview = h('p', { class: 'muted small' }, '');
    function update() {
      var ex = EXERCISE_BY_ID[typeSelect.value];
      unitLabel.textContent = AMOUNT_LABEL[ex.unit];
      var amount = parseFloat(amountInput.value);
      var isSun = ex.id === 'sunbath';
      sunBox.hidden = !isSun;
      if (isSun) {
        var d = amount > 0 ? sunVitaminD(amount, skinSelect.value, timeSelect.value) : 0;
        preview.textContent = amount > 0
          ? '☀️ Da tạo khoảng ' + fmt(d, 'µg') + ' µg vitamin D (~' + Math.round(d * 40) + ' IU)'
            + (amount > SUN_MAX_MINUTES ? ' — chỉ tính ' + SUN_MAX_MINUTES + ' phút đầu, sau đó da gần như không tạo thêm' : '') + '.'
          : '';
        return;
      }
      preview.textContent = amount > 0
        ? '≈ ' + Math.round(exerciseMinutes(ex, amount)) + ' phút, tiêu hao thêm ~' + exerciseKcal(ex, amount, weight) + ' kcal'
          + (weight ? '' : ' (tính theo ' + DEFAULT_WEIGHT_KG + ' kg — nhập cân nặng trong Hồ sơ để chính xác hơn)')
        : '';
    }
    typeSelect.addEventListener('change', update);
    amountInput.addEventListener('input', update);
    skinSelect.addEventListener('change', update);
    timeSelect.addEventListener('change', update);

    var form = h('form', { hidden: true, novalidate: true },
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, 'Môn', typeSelect),
        h('label', { class: 'field' }, unitLabel, amountInput)),
      sunBox,
      preview,
      h('button', { class: 'btn primary', type: 'submit' }, 'Thêm'));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var amount = parseFloat(amountInput.value);
      if (!(amount > 0)) {
        alert('Hãy nhập ' + AMOUNT_LABEL[EXERCISE_BY_ID[typeSelect.value].unit].toLowerCase() + '.');
        return;
      }
      addExercise(EXERCISE_BY_ID[typeSelect.value], amount).then(rerenderKeepingScroll);
    });
    var showForm = h('button', {
      class: 'btn',
      type: 'button',
      onclick: function () {
        form.hidden = false;
        showForm.hidden = true;
        // Pick the exercise first, with the list already open; the number comes after.
        typeSelect.focus();
        try {
          typeSelect.showPicker();
        } catch (err) {
          // Older WebViews can't open a dropdown from code; it stays focused for a tap.
        }
      }
    }, '+ Thêm bài tập');
    card.appendChild(showForm);
    card.appendChild(form);
    return card;
  }

  /** Calls fn when el is held for half a second without moving (a tap or a scroll doesn't count). */
  /**
   * Calls fn when el is held for half a second without moving (a tap or a scroll doesn't count),
   * and again when the finger lifts: focus set from a timer doesn't bring up Android's keyboard,
   * focus set while handling the release does.
   */
  function onLongPress(el, fn) {
    var timer = null;
    var held = false;
    var startX = 0;
    var startY = 0;
    function cancel() {
      clearTimeout(timer);
      timer = null;
    }
    el.addEventListener('pointerdown', function (ev) {
      held = false;
      if (ev.target.closest('button')) {
        return;
      }
      startX = ev.clientX;
      startY = ev.clientY;
      cancel();
      timer = setTimeout(function () {
        timer = null;
        held = true;
        if (navigator.vibrate) {
          navigator.vibrate(30);
        }
        fn();
      }, 500);
    });
    el.addEventListener('pointermove', function (ev) {
      if (timer && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 10) {
        cancel();
      }
    });
    ['pointercancel', 'pointerleave'].forEach(function (type) {
      el.addEventListener(type, cancel);
    });
    el.addEventListener('pointerup', function (ev) {
      cancel();
      if (held && ev.pointerType === 'mouse') {
        held = false;
        fn();
      }
    });
    el.addEventListener('touchend', function (ev) {
      cancel();
      if (held) {
        held = false;
        // No follow-up mouse events, which would move focus back to the row.
        ev.preventDefault();
        fn();
      }
    });
    el.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
    });
  }

  /** Inline form under an exercise row: the number typed is added to the times already logged. */
  function addMoreForm(e, weight) {
    var ex = EXERCISE_BY_ID[e.type];
    function totalFor(amount) {
      var total = Math.round((e.amount + amount) * 100) / 100;
      var updated = {
        amount: total,
        // An entry whose exercise type is unknown keeps its own energy per unit.
        minutes: Math.round(ex ? exerciseMinutes(ex, total) : (e.minutes || 0) * total / e.amount),
        kcal: ex ? exerciseKcal(ex, total, weight) : Math.round(e.kcal * total / e.amount)
      };
      if (e.type === 'sunbath') {
        updated.vitamin_d_ug = sunVitaminD(total, e.sunSkin, e.sunTime);
      }
      return updated;
    }
    function typed() {
      return parseFloat(input.value.replace(',', '.'));
    }
    // Starts with the number added last time (or the first amount logged), since sets usually repeat.
    var input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'VD: 20' });
    input.value = String(e.lastAdded || e.amount);
    var preview = h('p', { class: 'muted small' }, '');
    function update() {
      var amount = typed();
      if (amount > 0) {
        var t = totalFor(amount);
        preview.textContent = 'Tổng: ' + e.amount + ' + ' + amount + ' = ' + t.amount + ' ' + e.unit + ', ~' + t.kcal + ' kcal'
          + (t.vitamin_d_ug !== undefined ? ', ☀️ ~' + fmt(t.vitamin_d_ug, 'µg') + ' µg vitamin D' : '');
      } else {
        preview.textContent = '';
      }
    }
    input.addEventListener('input', update);
    update();
    var form = h('form', { class: 'ex-more', novalidate: true },
      h('label', { class: 'field' }, 'Thêm ' + (AMOUNT_LABEL[e.unit] || 'Số lần').toLowerCase() + ' cho ' + exerciseName(e), input),
      preview,
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn primary', type: 'submit' }, 'Cộng thêm'),
        h('button', {
          class: 'btn',
          type: 'button',
          onclick: function () {
            form.remove();
          }
        }, 'Hủy')));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var amount = typed();
      if (!(amount > 0)) {
        alert('Hãy nhập số muốn cộng thêm.');
        return;
      }
      Db.put('exercises', Object.assign({}, e, totalFor(amount), { lastAdded: amount })).then(rerenderKeepingScroll);
    });
    return form;
  }

  function planCard(key, meals, totals, targets, plan, exercises) {
    var card = h('div', { class: 'card' }, h('h2', null, '🤖 Nên ăn gì tiếp hôm nay?'));
    var burned = exerciseTotal(exercises);
    var newMeals = plan && plan.mealCount !== meals.length;
    var stale = plan && (newMeals || (plan.exerciseKcal || 0) !== burned);
    if (plan) {
      var r = plan.result;
      card.appendChild(h('p', { class: 'muted small' },
        'Cập nhật lúc ' + plan.time + ' (sau ' + plan.mealCount + ' bữa)'
        + (stale ? ' · ' + (newMeals ? 'đã có bữa mới' : 'tập luyện đã thay đổi') + ', nên cập nhật' : '')));
      card.appendChild(h('p', null, r.summary));
      if (r.lacking.length) {
        card.appendChild(h('h3', null, 'Còn thiếu'));
        card.appendChild(h('ul', { class: 'items' }, r.lacking.map(function (x) {
          var n = NUTRIENT_BY_KEY[x.nutrient_key];
          return h('li', null, h('strong', null, (n ? n.name : x.nutrient_key) + ': ' + fmtAmount(x.nutrient_key, x.amount_left)), ' — ' + x.note);
        })));
      }
      if (r.excess.length) {
        card.appendChild(h('h3', null, 'Đã nhiều / cần tránh'));
        card.appendChild(h('ul', { class: 'items' }, r.excess.map(function (x) {
          var n = NUTRIENT_BY_KEY[x.nutrient_key];
          return h('li', null, h('strong', null, (n ? n.name : x.nutrient_key) + (x.over_by > 0 ? ': vượt ' + fmtAmount(x.nutrient_key, x.over_by) : '')), ' — ' + x.note);
        })));
      }
      if (r.plan.length) {
        card.appendChild(h('h3', null, 'Gợi ý cho phần còn lại của ngày'));
        r.plan.forEach(function (p) {
          card.appendChild(h('div', { class: 'plan-meal' },
            h('strong', null, p.meal),
            h('ul', { class: 'items' }, p.dishes.map(function (d) {
              return h('li', null, d.name + ' — ' + d.portion);
            })),
            h('p', { class: 'muted small' }, p.why)));
        });
      }
      if (r.tips.length) {
        card.appendChild(h('h3', null, 'Lưu ý'));
        card.appendChild(h('ul', { class: 'items' }, r.tips.map(function (t) {
          return h('li', null, t);
        })));
      }
    } else {
      card.appendChild(h('p', { class: 'muted' }, 'Claude xem những gì bạn đã ăn hôm nay, cho biết chất nào còn thiếu hoặc đã quá nhiều, và gợi ý nên ăn gì cho phần còn lại của ngày.'));
    }
    function savePlan(result) {
      return Db.put('plans', { day: key, time: timeLabel(), mealCount: meals.length, exerciseKcal: burned, result: result }).then(route);
    }
    card.appendChild(askButtons('plan', plan ? 'Cập nhật gợi ý' : 'Phân tích & gợi ý', function () {
      if (!targets) {
        alert('Hãy tính mục tiêu mỗi ngày trong Hồ sơ trước.');
        location.hash = '#profile';
        return;
      }
      askClaude('plan', 'Claude đang lên kế hoạch cho phần còn lại của ngày...', function (profile, labs) {
        return {
          profile: profile,
          labs: labs,
          targets: targets.targets,
          meals: meals.map(function (m) {
            return {
              time: m.time,
              name: m.name,
              items: m.items.map(function (i) {
                return i.name + ' (' + i.portion + ')';
              }).join(', ') + (m.portion !== 1 ? ' — ăn ' + Math.round(m.portion * 100) + '% phần' : '')
            };
          }),
          totals: roundAll(totals),
          exercise: exerciseForAi(exercises),
          now: dayTitle(key) + ' ' + timeLabel()
        };
      }).then(function (result) {
        return result ? savePlan(result) : null;
      });
    }, savePlan, !plan || stale));
    return card;
  }

  // Add a meal: photo → Claude's estimate → save (or not)
  var pending = null;

  function newPendingMeal() {
    // time stays null until chosen: the meal then gets the time it is saved.
    return { photo: null, note: '', result: null, portion: 1, day: dayKey(), time: null };
  }

  /** The day the meal being added belongs to (today unless another day was picked). */
  function pendingDay(p) {
    return p.day || dayKey();
  }

  /** Where to go once the meal is saved or dropped: Food for today, otherwise that day's screen. */
  function afterMealHash(day) {
    return day === dayKey() ? '#food' : '#day/' + day;
  }

  function renderAdd() {
    setScreen('Thêm bữa ăn', 'food', true);
    if (!pending) {
      pending = newPendingMeal();
    }
    var p = pending;
    var mealDay = pendingDay(p);
    if (mealDay !== dayKey()) {
      titleEl.textContent = 'Thêm bữa ăn · ' + dayTitle(mealDay);
    }

    var photoBox = h('button', {
      class: 'photo-box',
      type: 'button',
      onclick: function () {
        pickPhoto('Ảnh bữa ăn').then(function (photo) {
          if (photo) {
            p.photo = photo;
            p.result = null;
            storePendingMeal();
            renderAdd();
          }
        });
      }
    }, p.photo ? h('img', { src: p.photo.preview, alt: 'Ảnh bữa ăn' }) : '📷 Bấm để chụp ảnh bữa ăn');

    var noteInput = h('textarea', {
      placeholder: 'VD: 1 tô phở bò tái, không ăn hết nước; 1 ly trà đá',
      oninput: function () {
        p.note = noteInput.value;
      }
    });
    noteInput.value = p.note;

    viewEl.appendChild(photoBox);
    // Missed logging a meal? Pick the day (and time) it was eaten.
    var dayInput = h('input', { type: 'date', max: dayKey() });
    dayInput.value = mealDay;
    dayInput.addEventListener('change', function () {
      if (dayInput.value && dayInput.value <= dayKey()) {
        p.day = dayInput.value;
        storePendingMeal();
        renderAdd();
      } else {
        dayInput.value = mealDay;
      }
    });
    var timeInput = h('input', { type: 'time' });
    timeInput.value = p.time || (mealDay === dayKey() ? timeLabel() : '12:00');
    timeInput.addEventListener('change', function () {
      p.time = timeInput.value || null;
      storePendingMeal();
    });
    viewEl.appendChild(h('div', { class: 'grid-2', style: 'margin-top:12px' },
      h('label', { class: 'field' }, 'Ngày ăn', dayInput),
      h('label', { class: 'field' }, 'Giờ', timeInput)));
    if (mealDay !== dayKey()) {
      viewEl.appendChild(h('p', { class: 'muted small', style: 'margin-top:-6px' }, '📅 Bữa này sẽ được ghi vào ' + dayTitle(mealDay) + '.'));
    }
    viewEl.appendChild(h('label', { class: 'field' }, 'Ghi chú (không bắt buộc — món gì, bao nhiêu, cách nấu)', noteInput));

    if (!p.result) {
      viewEl.appendChild(askButtons('meal', '🔍 Phân tích bữa ăn', analyze, showMealResult, true));
      if (isDirect(askMode())) {
        viewEl.appendChild(h('p', { class: 'muted small' }, 'AI ước tính món, khối lượng và chất dinh dưỡng. Mất khoảng 10–60 giây.'));
      }
      return;
    }

    viewEl.appendChild(h('button', {
      class: 'btn',
      style: 'margin-bottom:14px',
      type: 'button',
      onclick: function () {
        p.result = null;
        storePendingMeal();
        renderAdd();
        if (isDirect(askMode())) {
          analyze();
        }
      }
    }, 'Phân tích lại'));

    var r = p.result;
    if (!r.is_food) {
      viewEl.appendChild(h('div', { class: 'card' },
        h('p', null, 'Ảnh này có vẻ không phải đồ ăn. Hãy chụp lại món ăn, hoặc ghi rõ món trong ghi chú.'),
        h('p', { class: 'muted small' }, r.comment)));
      return;
    }

    var portionChoices = [[0.5, '½'], [0.75, '¾'], [1, 'Cả phần'], [1.25, '1¼'], [1.5, '1½']];
    var scaled = scaleNutrients(r.nutrients, p.portion);

    Promise.all([
      Db.getAllByIndex('meals', 'day', mealDay), Db.getKv('targets'), Db.getAllByIndex('exercises', 'day', mealDay)
    ]).then(function (res) {
      var targets = withExercise(res[1], exerciseTotal(res[2]), sunFromExercises(res[2]));
      var before = dayIntake(res[0], res[2]);
      var overAfter = [];
      if (targets) {
        NUTRIENTS.forEach(function (n) {
          var range = targets.targets[n.key];
          var after = before[n.key] + scaled[n.key];
          if (range && range.max !== null && after > range.max) {
            overAfter.push(n.name + ' (' + fmt(after, n.unit) + ' / ' + fmt(range.max, n.unit) + ' ' + n.unit + ')');
          }
        });
      }

      var card = h('div', { class: 'card' },
        h('h2', null, r.meal_name),
        h('p', { class: 'muted small' }, 'Độ chắc chắn: ' + ({ low: 'thấp', medium: 'trung bình', high: 'cao' })[r.confidence]),
        h('ul', { class: 'items' }, r.items.map(function (i) {
          return h('li', null, i.name + ' — ' + i.portion + ' (~' + fmt(i.grams, 'g') + ' g)');
        })),
        h('h3', null, 'Bạn sẽ ăn bao nhiêu?'),
        h('div', { class: 'portion-choices' }, portionChoices.map(function (c) {
          return h('button', {
            type: 'button',
            class: p.portion === c[0] ? 'selected' : '',
            onclick: function () {
              p.portion = c[0];
              storePendingMeal();
              renderAdd();
            }
          }, c[1]);
        })),
        h('h3', null, 'Dinh dưỡng (phần bạn ăn)'),
        h('table', { class: 'simple' }, h('tbody', null, nutrientRows(
          ['energy_kcal', 'protein_g', 'carbs_g', 'sugar_g', 'fat_g', 'sat_fat_g', 'cholesterol_mg', 'fiber_g', 'sodium_mg', 'purine_mg'],
          scaled, r.items, p.portion))),
        h('p', null, r.comment),
        r.warnings.map(function (w) {
          return h('div', { class: 'warning' }, '⚠️ ' + w);
        }),
        overAfter.length ? h('div', { class: 'warning' }, '📈 Sau bữa này, hôm nay sẽ vượt mức: ' + overAfter.join(', ')) : null);
      viewEl.appendChild(card);

      viewEl.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: saveMeal }, '✅ Lưu — tôi sẽ ăn bữa này'));
      viewEl.appendChild(h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn danger',
          type: 'button',
          onclick: function () {
            clearPendingMeal();
            location.hash = afterMealHash(mealDay);
          }
        }, 'Bỏ')));
    });

    function saveMeal() {
      var now = new Date();
      var time = p.time || (mealDay === dayKey() ? timeLabel(now) : '12:00');
      var hm = time.split(':');
      var dm = mealDay.split('-');
      var eatenAt = new Date(+dm[0], +dm[1] - 1, +dm[2], +hm[0], +hm[1]);
      Db.put('meals', {
        day: mealDay,
        time: time,
        createdAt: eatenAt.toISOString(),
        name: r.meal_name,
        items: r.items,
        portion: p.portion,
        baseNutrients: r.nutrients,
        nutrients: scaleNutrients(r.nutrients, p.portion),
        comment: r.comment,
        warnings: r.warnings,
        confidence: r.confidence,
        note: p.note,
        thumb: p.photo ? p.photo.thumb : null
      }).then(function (mealId) {
        // The full photo is kept for PHOTO_KEEP_DAYS; the thumbnail above stays for good.
        // Kept by the day it was added, so a late-logged meal's photo isn't pruned straight away.
        return p.photo ? Db.put('photos', { mealId: mealId, day: dayKey(now), dataUrl: p.photo.preview }) : null;
      }).then(function () {
        clearPendingMeal();
        location.hash = afterMealHash(mealDay);
      }, function (err) {
        alert('Không lưu được: ' + err.message);
      });
    }
  }

  // The meal being added is also kept on the phone, so it survives Android closing the app while
  // the user is in the Claude app.
  function storePendingMeal() {
    return Db.setKv('pendingMeal', pending).catch(function () {});
  }

  function clearPendingMeal() {
    pending = null;
    return Db.setKv('pendingMeal', null).catch(function () {});
  }

  function showMealResult(result) {
    if (!pending) {
      return;
    }
    pending.result = result;
    pending.portion = 1;
    storePendingMeal();
    if (location.hash.split('/')[0] === '#add') {
      renderAdd();
    }
  }

  function analyze() {
    var p = pending;
    if (!p.photo && !p.note.trim()) {
      alert('Hãy chụp ảnh bữa ăn hoặc ghi chú món ăn.');
      return;
    }
    storePendingMeal();
    var day = pendingDay(p);
    Promise.all([Db.getAllByIndex('meals', 'day', day), Db.getAllByIndex('exercises', 'day', day)]).then(function (today) {
      return askClaude('meal', 'Claude đang xem bữa ăn...', function (profile, labs) {
        return {
          imageBase64: p.photo ? p.photo.base64 : null,
          note: p.note.trim(),
          profile: profile,
          labs: labs,
          eatenToday: roundAll(dayIntake(today[0], today[1])),
          exercise: exerciseForAi(today[1]),
          now: dayTitle(day) + ' ' + (p.time || (day === dayKey() ? timeLabel() : '12:00'))
        };
      });
    }).then(function (result) {
      if (result) {
        showMealResult(result);
      }
    });
  }

  // One saved meal
  function renderMeal(id) {
    setScreen('Bữa ăn', 'food', true);
    return Promise.all([Db.get('meals', id), Db.get('photos', id)]).then(function (r) {
      var m = r[0];
      var photo = r[1];
      if (!m) {
        viewEl.appendChild(h('p', { class: 'empty' }, 'Không tìm thấy bữa ăn này.'));
        return;
      }
      titleEl.textContent = m.name;
      var image = photo ? photo.dataUrl : m.thumb;
      viewEl.appendChild(h('div', { class: 'card' },
        image ? h('img', { src: image, alt: '', style: 'width:100%;border-radius:10px;margin-bottom:6px' }) : null,
        m.thumb ? h('p', { class: 'muted small', style: 'margin-top:0' }, photo
          ? 'Ảnh gốc được giữ ' + PHOTO_KEEP_DAYS + ' ngày, sau đó chỉ còn ảnh nhỏ.'
          : 'Ảnh gốc đã quá ' + PHOTO_KEEP_DAYS + ' ngày nên chỉ còn ảnh nhỏ.') : null,
        h('p', { class: 'muted small' }, dayTitle(m.day) + ' · ' + m.time + (m.portion !== 1 ? ' · ăn ' + Math.round(m.portion * 100) + '% phần' : '')),
        h('ul', { class: 'items' }, m.items.map(function (i) {
          return h('li', null, i.name + ' — ' + i.portion + ' (~' + fmt(i.grams, 'g') + ' g)');
        })),
        m.note ? h('p', { class: 'muted small' }, 'Ghi chú: ' + m.note) : null,
        h('p', null, m.comment),
        (m.warnings || []).map(function (w) {
          return h('div', { class: 'warning' }, '⚠️ ' + w);
        })));
      viewEl.appendChild(h('div', { class: 'card' }, h('h2', null, 'Dinh dưỡng'), nutrientTable(m.nutrients, m.items, m.portion)));
      viewEl.appendChild(h('button', {
        class: 'btn danger',
        type: 'button',
        onclick: function () {
          if (confirm('Xóa bữa ăn "' + m.name + '"?')) {
            Promise.all([Db.remove('meals', m.id), Db.remove('photos', m.id)]).then(function () {
              history.back();
            });
          }
        }
      }, '🗑️ Xóa bữa ăn'));
    });
  }

  // Past days
  function renderHistory() {
    setScreen('Lịch sử', 'history', false);
    return Promise.all([Db.getAll('meals'), Db.getKv('targets'), Db.getAll('exercises')]).then(function (r) {
      var byDay = {};
      r[0].forEach(function (m) {
        (byDay[m.day] = byDay[m.day] || []).push(m);
      });
      var exerciseByDay = {};
      r[2].forEach(function (e) {
        (exerciseByDay[e.day] = exerciseByDay[e.day] || []).push(e);
      });
      var days = Object.keys(Object.assign({}, exerciseByDay, byDay)).sort().reverse();
      if (days.length === 0) {
        viewEl.appendChild(h('p', { class: 'empty' }, 'Chưa có dữ liệu.'));
        return;
      }
      viewEl.appendChild(summaryPicker(addDays(dayKey(), -6), dayKey(), days[days.length - 1]));
      viewEl.appendChild(h('div', { class: 'card' }, days.map(function (day) {
        var meals = byDay[day] || [];
        var burned = exerciseTotal(exerciseByDay[day] || []);
        var dayTargets = withExercise(r[1], burned, sunFromExercises(exerciseByDay[day]));
        var ranges = dayTargets ? dayTargets.targets : null;
        var totals = dayIntake(meals, exerciseByDay[day]);
        var over = ranges ? NUTRIENTS.filter(function (n) {
          return statusOf(totals[n.key], ranges[n.key]) === 'over';
        }) : [];
        return h('a', { class: 'meal-row', href: '#day/' + day },
          h('div', { class: 'thumb' }, '📅'),
          h('div', { class: 'info' },
            h('div', { class: 'name' }, dayTitle(day)),
            h('div', { class: 'muted small' }, meals.length + ' bữa' + (burned ? ' · 🏃 ~' + burned + ' kcal' : '') + (over.length ? ' · vượt: ' + over.map(function (n) {
              return n.name;
            }).join(', ') : ''))),
          h('div', { class: 'kcal' }, fmt(totals.energy_kcal, 'kcal') + ' kcal'));
      })));
    });
  }

  // ---- Tổng kết: everything logged in a chosen period, added up ----

  function addDays(key, n) {
    var p = key.split('-');
    return dayKey(new Date(+p[0], +p[1] - 1, +p[2] + n));
  }

  /** Number of calendar days from `from` to `to`, both included. */
  function daysBetween(from, to) {
    var a = from.split('-');
    var b = to.split('-');
    return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 864e5) + 1;
  }

  /** The "Tổng kết" card: a period (from / to, or a quick choice) and a button to add it up. */
  function summaryPicker(from, to, firstDay) {
    var fromInput = h('input', { type: 'date', max: dayKey() });
    var toInput = h('input', { type: 'date', max: dayKey() });
    fromInput.value = from;
    toInput.value = to;
    function show(f, t) {
      if (!f || !t) {
        alert('Hãy chọn ngày bắt đầu và ngày kết thúc.');
        return;
      }
      location.hash = '#summary/' + (f <= t ? f + '/' + t : t + '/' + f);
    }
    function quick(label, f, t) {
      return h('button', {
        type: 'button',
        onclick: function () {
          show(f, t);
        }
      }, label);
    }
    var today = dayKey();
    return h('div', { class: 'card' },
      h('h2', null, '📊 Tổng kết'),
      h('p', { class: 'muted small' }, 'Cộng tất cả bữa ăn và bài tập trong khoảng thời gian bạn chọn.'),
      h('div', { class: 'portion-choices' },
        quick('7 ngày', addDays(today, -6), today),
        quick('30 ngày', addDays(today, -29), today),
        quick('Tháng này', today.slice(0, 8) + '01', today),
        quick('Tất cả', firstDay || today, today)),
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, 'Từ ngày', fromInput),
        h('label', { class: 'field' }, 'Đến ngày', toInput)),
      h('button', {
        class: 'btn primary',
        type: 'button',
        onclick: function () {
          show(fromInput.value, toInput.value);
        }
      }, 'Xem tổng kết'));
  }

  var SUMMARY_MARK = { ok: '✅ ', under: '⬇️ ', over: '⬆️ ' };

  /**
   * What the body needed over the period: each day that has meals logged adds its own daily
   * target, raised for that day's exercise (the same days the totals and averages count).
   * A side of a range stays open (null) when the daily target has no min or no max.
   */
  function periodTargets(targets, meals, exercises) {
    if (!targets) {
      return null;
    }
    var burnedByDay = {};
    var sunByDay = {};
    exercises.forEach(function (e) {
      burnedByDay[e.day] = (burnedByDay[e.day] || 0) + e.kcal;
      sunByDay[e.day] = (sunByDay[e.day] || 0) + (e.vitamin_d_ug || 0);
    });
    var days = {};
    meals.forEach(function (m) {
      days[m.day] = true;
    });
    var sum = {};
    Object.keys(days).forEach(function (day) {
      var ranges = withExercise(targets, burnedByDay[day] || 0, sunByDay[day] || 0).targets;
      NUTRIENTS.forEach(function (n) {
        var range = ranges[n.key];
        var acc = sum[n.key] = sum[n.key] || { min: 0, max: 0 };
        acc.min = range && range.min !== null && acc.min !== null ? acc.min + range.min : null;
        acc.max = range && range.max !== null && acc.max !== null ? acc.max + range.max : null;
      });
    });
    return sum;
  }

  /** A target range as text, e.g. "120–160", "≥ 25", "≤ 2.000". */
  function rangeText(range, unit) {
    if (!range || (range.min === null && range.max === null)) {
      return '—';
    }
    if (range.min !== null && range.max !== null) {
      return range.min === range.max ? fmt(range.min, unit) : fmt(range.min, unit) + '–' + fmt(range.max, unit);
    }
    return range.min !== null ? '≥ ' + fmt(range.min, unit) : '≤ ' + fmt(range.max, unit);
  }

  function renderSummary(from, to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      to = dayKey();
      from = addDays(to, -6);
    }
    setScreen('Tổng kết', 'history', true);
    var range = IDBKeyRange.bound(from, to);
    return Promise.all([
      Db.getAllByIndex('meals', 'day', range), Db.getAllByIndex('exercises', 'day', range), Db.getAll('meals'),
      Db.getKv('targets')
    ]).then(function (r) {
      var meals = r[0];
      var exercises = r[1];
      var need = periodTargets(r[3], meals, exercises);
      var allDays = r[2].map(function (m) {
        return m.day;
      }).sort();
      var calendarDays = daysBetween(from, to);
      var mealDays = Object.keys(meals.reduce(function (set, m) {
        set[m.day] = true;
        return set;
      }, {})).length;
      var workoutDays = Object.keys(exercises.reduce(function (set, e) {
        set[e.day] = true;
        return set;
      }, {})).length;
      var counted = {};
      meals.forEach(function (m) {
        counted[m.day] = true;
      });
      var totals = dayIntake(meals, exercises.filter(function (e) {
        return counted[e.day];
      }));
      var burned = exerciseTotal(exercises);

      viewEl.appendChild(summaryPicker(from, to, allDays[0]));

      viewEl.appendChild(h('div', { class: 'card' },
        h('h2', null, (from === to ? dayTitle(from) : dayTitle(from) + ' → ' + dayTitle(to))),
        h('ul', { class: 'items' },
          h('li', null, calendarDays + ' ngày; có ghi bữa ăn ' + mealDays + ' ngày'),
          h('li', null, meals.length + ' bữa ăn'),
          h('li', null, exercises.length + ' lần ghi bài tập trong ' + workoutDays + ' ngày, tiêu hao thêm ~' + burned + ' kcal')),
        mealDays < calendarDays && meals.length
          ? h('p', { class: 'muted small' }, 'Trung bình mỗi ngày được tính trên ' + mealDays + ' ngày có ghi bữa ăn (ngày không ghi có thể là quên ghi).')
          : null));

      if (!meals.length && !exercises.length) {
        viewEl.appendChild(h('p', { class: 'empty' }, 'Không có dữ liệu trong khoảng thời gian này.'));
        return;
      }

      if (meals.length) {
        var sections = [['main', 'Dinh dưỡng chính'], ['micro', 'Vitamin & khoáng chất']];
        var count = { ok: 0, under: 0, over: 0 };
        var table = h('table', { class: 'simple summary' },
          h('thead', null, h('tr', null, h('th', null, 'Chất'), h('th', null, 'Tổng'), h('th', null, 'Cần'), h('th', null, 'TB/ngày'))),
          sections.map(function (sec) {
            return h('tbody', null,
              h('tr', { class: 'section' }, h('td', { colspan: '4' }, sec[1])),
              NUTRIENTS.filter(function (n) {
                return n.group === sec[0];
              }).map(function (n) {
                var range = need && need[n.key];
                var status = statusOf(totals[n.key], range);
                if (count[status] !== undefined) {
                  count[status]++;
                }
                return h('tr', { class: 'st-' + status },
                  h('td', null, n.name, h('span', { class: 'unit' }, ' · ' + n.unit)),
                  h('td', { class: 'total' }, (SUMMARY_MARK[status] || '') + fmt(totals[n.key], n.unit)),
                  h('td', { class: 'need' }, rangeText(range, n.unit)),
                  h('td', null, fmt(totals[n.key] / mealDays, n.unit)));
              }));
          }));
        viewEl.appendChild(h('div', { class: 'card' },
          h('h2', null, '🍽️ Tổng dinh dưỡng'),
          need
            ? h('p', { class: 'muted small' }, '"Cần" là nhu cầu của ' + mealDays + ' ngày có ghi bữa ăn, theo mục tiêu mỗi ngày trong Hồ sơ'
              + (exercises.length ? ' (đã cộng thêm cho những ngày có tập)' : '') + '. ✅ đủ · ⬇️ thiếu · ⬆️ vượt.')
            : h('p', { class: 'muted small' }, 'Chưa có mục tiêu mỗi ngày nên chưa so được với nhu cầu. Tính mục tiêu trong Hồ sơ.'),
          need ? h('div', { class: 'summary-tags' },
            h('span', { class: 'tag ok' }, '✅ Đủ: ' + count.ok),
            h('span', { class: 'tag under' }, '⬇️ Thiếu: ' + count.under),
            h('span', { class: 'tag over' }, '⬆️ Vượt: ' + count.over)) : null,
          table));
      }

      if (exercises.length) {
        // One line per exercise: its times or minutes added up, and the energy.
        var byExercise = {};
        exercises.forEach(function (e) {
          var name = exerciseName(e);
          var row = byExercise[name + '|' + e.unit] = byExercise[name + '|' + e.unit] || { name: name, unit: e.unit, amount: 0, kcal: 0, days: {} };
          row.amount += e.amount;
          row.kcal += e.kcal;
          row.days[e.day] = true;
        });
        var rows = Object.keys(byExercise).map(function (k) {
          return byExercise[k];
        }).sort(function (a, b) {
          return b.kcal - a.kcal;
        });
        viewEl.appendChild(h('div', { class: 'card' },
          h('h2', null, '🏃 Tổng bài tập (~' + burned + ' kcal)'),
          h('table', { class: 'simple' }, h('tbody', null, rows.map(function (x) {
            return h('tr', null,
              h('td', null, x.name, h('div', { class: 'muted small' }, Object.keys(x.days).length + ' ngày · ~' + Math.round(x.kcal) + ' kcal')),
              h('td', null, Math.round(x.amount * 100) / 100 + ' ' + x.unit));
          })))));
      }
      viewEl.appendChild(h('p', { class: 'disclaimer' }, 'Số liệu là ước tính của AI, không thay thế lời khuyên của bác sĩ.'));
    });
  }

  // Health profile, daily targets and lab results
  var pendingLabs = null;
  // Photos of lab report pages collected before asking Claude to read them all together.
  var labPhotos = [];
  var MAX_LAB_PHOTOS = 10;
  var labsCardEl = null;

  /** Redraws just the lab results card, so the page doesn't jump back to the top. */
  function rerenderLabs() {
    return Db.getAll('labs').then(function (labs) {
      var old = labsCardEl;
      var fresh = labsCard(labs);
      if (old && old.parentNode) {
        old.parentNode.replaceChild(fresh, old);
      }
    });
  }

  function addLabPhotos(photos) {
    var room = MAX_LAB_PHOTOS - labPhotos.length;
    if (photos.length > room) {
      alert('Mỗi lần đọc tối đa ' + MAX_LAB_PHOTOS + ' ảnh. Chỉ lấy ' + room + ' ảnh đầu.');
    }
    labPhotos = labPhotos.concat(photos.slice(0, Math.max(0, room)));
    rerenderLabs();
  }

  function labPhotoButtons() {
    var full = labPhotos.length >= MAX_LAB_PHOTOS;
    return h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn',
        type: 'button',
        disabled: full,
        onclick: function () {
          pickPhoto('Ảnh phiếu xét nghiệm', 'CAMERA').then(function (photo) {
            if (photo) {
              addLabPhotos([photo]);
            }
          });
        }
      }, labPhotos.length ? '📷 Chụp thêm' : '📷 Chụp ảnh'),
      h('button', {
        class: 'btn',
        type: 'button',
        disabled: full,
        onclick: function () {
          pickGalleryPhotos().then(function (photos) {
            if (photos.length) {
              addLabPhotos(photos);
            }
          });
        }
      }, '🖼️ Chọn nhiều ảnh'));
  }

  function showLabResults(result) {
    if (result.tests.length === 0) {
      alert('Không đọc được kết quả nào. Hãy chụp rõ hơn, đủ sáng, thẳng phiếu.');
      return;
    }
    labPhotos = [];
    pendingLabs = result;
    rerenderLabs();
  }

  function labPhotosSection() {
    var box = h('div', null,
      h('p', { class: 'muted small' }, labPhotos.length + ' ảnh đã chọn' + (labPhotos.length >= MAX_LAB_PHOTOS ? ' (tối đa)' : '') + '. Bấm ✕ để bỏ ảnh chụp lỗi.'),
      h('div', { class: 'photo-grid' }, labPhotos.map(function (p, i) {
        return h('div', { class: 'photo-tile' },
          h('img', { src: p.thumb, alt: 'Ảnh ' + (i + 1) }),
          h('button', {
            type: 'button',
            'aria-label': 'Bỏ ảnh ' + (i + 1),
            onclick: function () {
              labPhotos.splice(i, 1);
              rerenderLabs();
            }
          }, '✕'));
      })),
      labPhotoButtons(),
      askButtons('labs', '🔍 Đọc ' + labPhotos.length + ' ảnh', function () {
        var images = labPhotos.map(function (p) {
          return p.base64;
        });
        askClaude('labs', 'Claude đang đọc ' + images.length + ' ảnh phiếu xét nghiệm...', function () {
          return { imagesBase64: images };
        }).then(function (result) {
          if (result) {
            showLabResults(result);
          }
        });
      }, showLabResults, true),
      h('button', {
        class: 'btn danger',
        type: 'button',
        onclick: function () {
          labPhotos = [];
          rerenderLabs();
        }
      }, 'Bỏ tất cả ảnh'));
    return box;
  }

  function renderProfile() {
    setScreen('Hồ sơ sức khỏe', 'profile', false);
    return Promise.all([Db.getKv('profile'), Db.getKv('targets'), Db.getAll('labs'), Db.getKv('labsUpdatedAt')]).then(function (r) {
      var profile = r[0] || {};
      var targets = r[1];
      var labs = r[2];

      function field(label, input) {
        return h('label', { class: 'field' }, label, input);
      }
      function select(name, options) {
        var s = h('select', { name: name }, h('option', { value: '' }, '— Chọn —'), options.map(function (o) {
          return h('option', { value: o }, o);
        }));
        s.value = profile[name] || '';
        return s;
      }
      function input(name, type, extra) {
        var i = h('input', Object.assign({ name: name, type: type }, extra || {}));
        i.value = profile[name] === undefined || profile[name] === null ? '' : profile[name];
        return i;
      }
      function textarea(name, placeholder) {
        var t = h('textarea', { name: name, placeholder: placeholder });
        t.value = profile[name] || '';
        return t;
      }

      var form = h('form', { class: 'card', novalidate: true },
        h('h2', null, 'Thông tin cơ bản'),
        h('div', { class: 'grid-2' },
          field('Giới tính', select('sex', ['Nam', 'Nữ'])),
          field('Ngày sinh', input('birthDate', 'date')),
          field('Chiều cao (cm)', input('height_cm', 'number', { inputmode: 'decimal', step: 'any' })),
          field('Cân nặng (kg)', input('weight_kg', 'number', { inputmode: 'decimal', step: 'any' }))),
        field('Mức vận động', select('activity', ['Ít vận động (ngồi nhiều)', 'Vận động nhẹ (1–3 buổi/tuần)', 'Vận động vừa (3–5 buổi/tuần)', 'Vận động nhiều (6–7 buổi/tuần)', 'Lao động nặng'])),
        h('p', { class: 'muted small', style: 'margin-top:-6px' }, 'Mục tiêu mỗi ngày được tính cho ngày không tập. Ngày nào tập thì ghi bài tập ở màn hình Workout, năng lượng sẽ được cộng thêm cho riêng ngày đó.'),
        field('Mục tiêu', select('goal', ['Giữ cân', 'Giảm cân', 'Tăng cân', 'Tăng cơ'])),
        field('Bệnh lý, thuốc đang dùng', textarea('conditions', 'VD: gout, tiểu đường type 2, cao huyết áp; đang uống metformin')),
        field('Chế độ ăn, dị ứng, sở thích', textarea('dietNotes', 'VD: dị ứng tôm, không ăn được cay, ăn chay ngày rằm')),
        h('button', { class: 'btn primary', type: 'submit' }, 'Lưu hồ sơ'));
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var data = { updatedAt: new Date().toISOString() };
        ['sex', 'birthDate', 'activity', 'goal', 'conditions', 'dietNotes'].forEach(function (name) {
          data[name] = form.elements[name].value.trim();
        });
        ['height_cm', 'weight_kg'].forEach(function (name) {
          data[name] = form.elements[name].value ? parseFloat(form.elements[name].value) : null;
        });
        if (!data.sex || !data.birthDate || !data.height_cm || !data.weight_kg) {
          alert('Hãy nhập ít nhất giới tính, ngày sinh, chiều cao và cân nặng.');
          return;
        }
        Db.setKv('profile', data).then(function () {
          alert('Đã lưu hồ sơ.');
          route();
        });
      });
      viewEl.appendChild(form);

      viewEl.appendChild(targetsCard(r[0], targets, labs, r[3]));
      viewEl.appendChild(labsCard(labs));
    });
  }

  function targetsCard(profile, targets, labs, labsUpdatedAt) {
    var card = h('div', { class: 'card' }, h('h2', null, '🎯 Mục tiêu mỗi ngày'));
    if (!targets) {
      card.appendChild(h('p', { class: 'muted' }, 'Claude tính lượng mỗi chất bạn cần (và giới hạn tối đa) dựa trên hồ sơ và xét nghiệm của bạn.'));
    } else {
      if (targetsStale(targets, profile, labsUpdatedAt)) {
        card.appendChild(h('div', { class: 'warning' }, 'Hồ sơ hoặc xét nghiệm đã thay đổi sau lần tính trước. Nên tính lại.'));
      }
      card.appendChild(h('p', { class: 'muted small' }, 'Tính ngày ' + dayTitle(dayKey(new Date(targets.computedAt)))));
      card.appendChild(h('p', null, targets.explanation));
      if (targets.labFlags && targets.labFlags.length) {
        card.appendChild(h('h3', null, 'Xét nghiệm cần chú ý'));
        card.appendChild(h('ul', { class: 'items' }, targets.labFlags.map(function (f) {
          var label = { low: 'thấp', high: 'cao', normal: 'bình thường', unclear: 'chưa rõ' }[f.status];
          return h('li', null, h('strong', null, f.test + ' (' + label + '): '), f.advice);
        })));
      }
      var table = h('table', { class: 'simple', hidden: true }, h('tbody', null, NUTRIENTS.map(function (n) {
        var range = targets.targets[n.key] || {};
        var text = range.min !== null && range.max !== null ? fmt(range.min, n.unit) + '–' + fmt(range.max, n.unit)
          : range.min !== null ? '≥ ' + fmt(range.min, n.unit)
            : range.max !== null ? '≤ ' + fmt(range.max, n.unit) : '—';
        return h('tr', null, h('td', null, n.name), h('td', null, text + ' ' + n.unit));
      })));
      var toggle = h('button', {
        class: 'link-btn',
        type: 'button',
        onclick: function () {
          table.hidden = !table.hidden;
          toggle.textContent = table.hidden ? '▸ Xem bảng mục tiêu' : '▾ Ẩn bảng mục tiêu';
        }
      }, '▸ Xem bảng mục tiêu');
      card.appendChild(toggle);
      card.appendChild(table);
    }
    function saveTargets(result) {
      return Db.setKv('targets', {
        computedAt: new Date().toISOString(),
        targets: result.targets,
        explanation: result.explanation,
        labFlags: result.lab_flags
      }).then(route);
    }
    card.appendChild(askButtons('targets', targets ? 'Tính lại mục tiêu' : 'Tính mục tiêu mỗi ngày', function () {
      if (!profile) {
        alert('Hãy lưu hồ sơ trước.');
        return;
      }
      askClaude('targets', 'Claude đang tính mục tiêu dinh dưỡng của bạn...', function (p, labList) {
        return { profile: p, labs: labList, today: dayKey() };
      }).then(function (result) {
        return result ? saveTargets(result) : null;
      });
    }, saveTargets, !targets || targetsStale(targets, profile, labsUpdatedAt)));
    return card;
  }

  function markLabsChanged() {
    return Db.setKv('labsUpdatedAt', new Date().toISOString());
  }

  function labsCard(labs) {
    var card = h('div', { class: 'card' }, h('h2', null, '🧪 Xét nghiệm máu & nước tiểu'));

    labsCardEl = card;

    if (pendingLabs) {
      card.appendChild(h('p', { class: 'muted small' }, 'Claude đọc được ' + pendingLabs.tests.length + ' kết quả. Kiểm tra lại với phiếu rồi bỏ chọn dòng sai.'));
      var boxes = pendingLabs.tests.map(function (t) {
        var box = h('input', { type: 'checkbox' });
        box.checked = true;
        card.appendChild(h('label', { class: 'check-row' }, box,
          h('span', null, h('strong', null, t.name), ': ' + t.value + ' ' + t.unit + (t.reference_range ? ' (tham chiếu ' + t.reference_range + ')' : ''),
            h('div', { class: 'muted small' }, t.date ? 'Ngày ' + t.date : 'Không rõ ngày — sẽ lưu là hôm nay'))));
        return box;
      });
      card.appendChild(h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn primary',
          type: 'button',
          onclick: function () {
            var writes = pendingLabs.tests.filter(function (t, i) {
              return boxes[i].checked;
            }).map(function (t) {
              return Db.put('labs', { type: t.type, name: t.name, value: t.value, unit: t.unit, reference_range: t.reference_range, date: t.date || dayKey() });
            });
            Promise.all(writes).then(markLabsChanged).then(function () {
              pendingLabs = null;
              route();
            });
          }
        }, 'Thêm các dòng đã chọn'),
        h('button', {
          class: 'btn',
          type: 'button',
          onclick: function () {
            pendingLabs = null;
            rerenderLabs();
          }
        }, 'Bỏ')));
      return card;
    }

    if (labPhotos.length) {
      card.appendChild(labPhotosSection());
      return card;
    }

    if (labs.length === 0) {
      card.appendChild(h('p', { class: 'muted' }, 'Chưa có kết quả xét nghiệm.'));
    }
    labs.sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name);
    }).forEach(function (t) {
      card.appendChild(h('div', { class: 'lab-row' },
        h('div', { class: 'info' },
          h('strong', null, t.name), ': ' + t.value + ' ' + (t.unit || ''),
          h('div', { class: 'muted small' }, ({ blood: 'Máu', urine: 'Nước tiểu', other: 'Khác' })[t.type] + (t.date ? ' · ' + t.date : '') + (t.reference_range ? ' · tham chiếu ' + t.reference_range : ''))),
        h('button', {
          class: 'remove',
          type: 'button',
          'aria-label': 'Xóa ' + t.name,
          onclick: function () {
            if (confirm('Xóa kết quả "' + t.name + '"?')) {
              Db.remove('labs', t.id).then(markLabsChanged).then(route);
            }
          }
        }, '✕')));
    });

    card.appendChild(h('p', { class: 'muted small', style: 'margin-bottom:0' }, 'Chụp hoặc chọn ảnh phiếu xét nghiệm (nhiều trang, nhiều phiếu đều được) — Claude đọc giúp:'));
    card.appendChild(labPhotoButtons());
    if (askMode() === 'app') {
      card.appendChild(h('button', {
        class: 'link-btn',
        type: 'button',
        onclick: function () {
          pasteReply('labs', showLabResults);
        }
      }, '📋 Đã gửi ảnh cho Claude? Dán câu trả lời ở đây'));
    }

    var addForm = h('form', { hidden: true, novalidate: true, style: 'margin-top:12px' },
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, 'Loại', h('select', { name: 'type' },
          h('option', { value: 'blood' }, 'Máu'), h('option', { value: 'urine' }, 'Nước tiểu'), h('option', { value: 'other' }, 'Khác'))),
        h('label', { class: 'field' }, 'Ngày xét nghiệm', h('input', { name: 'date', type: 'date', value: dayKey() }))),
      h('label', { class: 'field' }, 'Tên xét nghiệm', h('input', { name: 'name', type: 'text', placeholder: 'VD: Acid uric, Glucose, LDL-C' })),
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, 'Kết quả', h('input', { name: 'value', type: 'text', placeholder: 'VD: 480' })),
        h('label', { class: 'field' }, 'Đơn vị', h('input', { name: 'unit', type: 'text', placeholder: 'VD: µmol/L' }))),
      h('label', { class: 'field' }, 'Khoảng tham chiếu (nếu có)', h('input', { name: 'reference_range', type: 'text', placeholder: 'VD: 202–416' })),
      h('button', { class: 'btn primary', type: 'submit' }, 'Thêm kết quả'));
    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = addForm.elements;
      if (!f.name.value.trim() || !f.value.value.trim()) {
        alert('Hãy nhập tên xét nghiệm và kết quả.');
        return;
      }
      Db.put('labs', {
        type: f.type.value,
        name: f.name.value.trim(),
        value: f.value.value.trim(),
        unit: f.unit.value.trim(),
        reference_range: f.reference_range.value.trim(),
        date: f.date.value
      }).then(markLabsChanged).then(route);
    });
    var showAdd = h('button', {
      class: 'btn',
      type: 'button',
      onclick: function () {
        addForm.hidden = false;
        showAdd.hidden = true;
      }
    }, '✍️ Nhập tay một kết quả');
    card.appendChild(showAdd);
    card.appendChild(addForm);
    return card;
  }

  // Settings: API key, spending, backup
  function renderSettings() {
    setScreen('Cài đặt', 'settings', false);
    return loadSettings().then(function (s) {
      var mode = askMode(s);
      function modeChoice(value, title, detail) {
        var radio = h('input', { type: 'radio', name: 'askMode', value: value });
        radio.checked = mode === value;
        radio.addEventListener('change', function () {
          s.mode = value;
          saveSettings(s).then(route);
        });
        return h('label', { class: 'check-row' }, radio, h('span', null, h('strong', null, title), h('div', { class: 'muted small' }, detail)));
      }
      viewEl.appendChild(h('div', { class: 'card' },
        h('h2', null, '🤖 Cách hỏi AI'),
        modeChoice('app', 'Qua ứng dụng Claude (miễn phí với gói Pro)',
          'App gửi câu hỏi và ảnh sang ứng dụng Claude trên điện thoại; bạn bấm gửi, sao chép câu trả lời rồi dán lại vào đây. Tính vào giới hạn sử dụng của gói Pro.'),
        modeChoice('gemini', 'Google Gemini (miễn phí)',
          'Một chạm, kết quả hiện ngay trong app. Cần Gemini API key miễn phí từ aistudio.google.com (có giới hạn số lần mỗi ngày).'),
        modeChoice('groq', 'Groq (miễn phí, rất nhanh)',
          'Một chạm, trả lời thường chỉ vài giây. Cần Groq API key miễn phí từ console.groq.com. Đọc ảnh món ăn có thể kém chính xác hơn Gemini.'),
        modeChoice('openrouter', 'OpenRouter (miễn phí)',
          'Một chạm. Dùng các model miễn phí đọc được ảnh (Gemma, Nemotron...), app tự chọn. Key miễn phí từ openrouter.ai; khoảng 50 lần mỗi ngày.'),
        modeChoice('cohere', 'Cohere (miễn phí, 1.000 lần/tháng)',
          'Một chạm. Model Command A Vision. Key dùng thử miễn phí từ dashboard.cohere.com, khoảng 1.000 lần mỗi tháng.'),
        modeChoice('api', 'Claude API key (trả phí theo lần dùng)',
          'Một chạm, kết quả hiện ngay trong app. Cần API key và tiền nạp ở console.anthropic.com (khoảng vài cent mỗi bữa).')));

      /** Key box for a free service, with a button that checks the key and shows how fast it answers. */
      function freeKeyCard(service, placeholder, help, extra) {
        var field = FREE_SERVICES[service].key;
        var name = FREE_SERVICES[service].name;
        var input = h('input', { type: 'password', autocomplete: 'off', placeholder: placeholder });
        input.value = s[field] || '';
        var testResult = h('p', { class: 'muted small' }, '');
        return h('div', { class: 'card', hidden: mode !== service },
          h('h2', null, '🔑 ' + name + ' API key'),
          help.map(function (text) {
            return h('p', { class: 'muted small' }, text);
          }),
          extra,
          h('label', { class: 'field' }, 'API key', input),
          h('button', {
            class: 'link-btn',
            type: 'button',
            onclick: function () {
              input.type = input.type === 'password' ? 'text' : 'password';
            }
          }, 'Hiện / ẩn key'),
          h('div', { class: 'btn-row' },
            h('button', {
              class: 'btn',
              type: 'button',
              onclick: function () {
                testResult.textContent = 'Đang thử...';
                AI.testFreeKey(service, input.value.trim(), s.geminiSpeed).then(function (r) {
                  testResult.textContent = '✅ Key dùng được — model ' + r.model + ', trả lời trong ' + r.seconds + ' giây.';
                }, function (err) {
                  testResult.textContent = '❌ ' + (err && err.message ? err.message : err);
                });
              }
            }, '🧪 Thử key'),
            h('button', {
              class: 'btn primary',
              type: 'button',
              onclick: function () {
                s[field] = input.value.trim();
                saveSettings(s).then(function () {
                  alert(s[field] ? 'Đã lưu ' + name + ' API key.' : 'Đã xóa ' + name + ' API key.');
                });
              }
            }, 'Lưu key')),
          testResult);
      }

      function speedChoice(value, title, detail) {
        var radio = h('input', { type: 'radio', name: 'geminiSpeed', value: value });
        radio.checked = (s.geminiSpeed || 'fast') === value;
        radio.addEventListener('change', function () {
          s.geminiSpeed = value;
          saveSettings(s);
        });
        return h('label', { class: 'check-row' }, radio, h('span', null, h('strong', null, title), h('div', { class: 'muted small' }, detail)));
      }

      viewEl.appendChild(freeKeyCard('gemini', 'AIza...', [
        'Vào aistudio.google.com/apikey → đăng nhập Google → "Create API key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ lưu ' + ON_DEVICE + '.',
        'Lưu ý: với gói miễn phí, Google có thể dùng dữ liệu gửi lên (ảnh, hồ sơ, xét nghiệm) để cải thiện sản phẩm của họ.'
      ], h('div', null,
        speedChoice('fast', 'Nhanh (Flash-Lite)', 'Trả lời nhanh hơn nhiều lần, đủ tốt cho bữa ăn hằng ngày.'),
        speedChoice('careful', 'Kỹ hơn (Flash)', 'Chậm hơn nhưng đọc ảnh kỹ hơn — dùng khi đọc phiếu xét nghiệm khó.'))));

      viewEl.appendChild(freeKeyCard('groq', 'gsk_...', [
        'Vào console.groq.com → đăng nhập (Google hoặc email) → API Keys → "Create API Key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ lưu ' + ON_DEVICE + '.',
        'Groq đọc tối đa 5 ảnh mỗi lần; khi đọc nhiều ảnh xét nghiệm, app tự chia thành nhiều lần.'
      ]));

      viewEl.appendChild(freeKeyCard('openrouter', 'sk-or-...', [
        'Vào openrouter.ai → đăng nhập (Google, GitHub hoặc email) → Keys → "Create API Key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ lưu ' + ON_DEVICE + '.',
        'App chỉ dùng model có đuôi ":free" (không bao giờ tốn tiền) và tự chuyển sang model miễn phí khác khi một model bận. Giới hạn khoảng 50 lần mỗi ngày (1.000 lần nếu tài khoản từng nạp từ 10 USD).',
        'Lưu ý: nhà cung cấp model miễn phí có thể lưu và dùng dữ liệu gửi lên.'
      ]));

      viewEl.appendChild(freeKeyCard('cohere', 'Cohere API key', [
        'Vào dashboard.cohere.com → đăng ký → API Keys → sao chép "Trial key" rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ lưu ' + ON_DEVICE + '.',
        'Key dùng thử có khoảng 1.000 lần hỏi mỗi tháng và chỉ dành cho việc dùng cá nhân.'
      ]));

      var keyInput = h('input', { type: 'password', autocomplete: 'off', placeholder: 'sk-ant-...' });
      keyInput.value = s.apiKey || '';
      viewEl.appendChild(h('div', { class: 'card', hidden: mode !== 'api' },
        h('h2', null, '🔑 Claude API key'),
        h('p', { class: 'muted small' }, 'Tạo key tại console.anthropic.com → API Keys, rồi dán vào đây. Key chỉ lưu ' + ON_DEVICE + '.'),
        h('label', { class: 'field' }, 'API key', keyInput),
        h('button', {
          class: 'link-btn',
          type: 'button',
          onclick: function () {
            keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
          }
        }, 'Hiện / ẩn key'),
        h('button', {
          class: 'btn primary',
          type: 'button',
          onclick: function () {
            s.apiKey = keyInput.value.trim();
            saveSettings(s).then(function () {
              alert(s.apiKey ? 'Đã lưu API key.' : 'Đã xóa API key.');
            });
          }
        }, 'Lưu key')));

      viewEl.appendChild(h('div', { class: 'card', hidden: mode !== 'api' },
        h('h2', null, '💵 Chi phí đã dùng'),
        h('p', null, 'Khoảng $' + (s.totalCostUsd || 0).toFixed(2) + ' cho ' + (s.requestCount || 0) + ' lần hỏi Claude.'),
        h('p', { class: 'muted small' }, 'Ước tính theo giá Claude Opus 5.5; số chính xác xem ở console.anthropic.com. Mỗi bữa ăn thường tốn vài cent.')));

      var storageInfo = h('p', { class: 'muted small' }, '');
      if (!isNative) {
        showStorageInfo(storageInfo);
      }
      viewEl.appendChild(h('div', { class: 'card' },
        h('h2', null, '💾 Sao lưu'),
        h('p', { class: 'muted small' }, isNative
          ? 'Dữ liệu chỉ nằm trên điện thoại này và sẽ mất nếu gỡ ứng dụng. Hãy sao lưu thường xuyên (gửi file qua Zalo/Drive/email cho chính mình).'
          : 'Dữ liệu (hồ sơ, xét nghiệm máu/nước tiểu, bữa ăn, bài tập, API key) chỉ nằm trong trình duyệt này, trên máy này — không gửi lên máy chủ nào. Dữ liệu sẽ mất nếu xóa dữ liệu duyệt web của trang này, và không có khi mở bằng trình duyệt hoặc máy khác, hay ở chế độ ẩn danh. Hãy sao lưu thường xuyên; dùng file sao lưu để chuyển dữ liệu sang máy khác.'),
        isNative ? null : storageInfo,
        h('button', { class: 'btn', type: 'button', onclick: exportBackup }, '⬆️ Xuất file sao lưu'),
        h('button', {
          class: 'btn',
          type: 'button',
          onclick: function () {
            backupInput.value = '';
            backupInput.click();
          }
        }, '⬇️ Khôi phục từ file')));

      viewEl.appendChild(h('div', { class: 'card' },
        h('img', { class: 'about-logo', src: 'img/logo.png', alt: 'Logo' }),
        h('h2', null, 'ℹ️ Về ứng dụng'),
        h('p', { class: 'muted small' }, 'Ảnh bữa ăn, hồ sơ và kết quả xét nghiệm được gửi tới Anthropic (Claude), Google (Gemini), Groq, OpenRouter hoặc Cohere, tùy cách hỏi đã chọn, để phân tích mỗi khi bạn bấm phân tích; ngoài ra mọi dữ liệu chỉ lưu ' + (isNative ? 'trên điện thoại.' : 'trong trình duyệt này.')),
        isNative ? null : h('p', { class: 'muted small' }, 'Có bản ứng dụng Android: ',
          h('a', { href: 'https://github.com/aplintell/nutrition-coach/releases/latest/download/nutrition-coach.apk' }, 'tải file APK'),
          ' (dữ liệu hai bản không tự đồng bộ — chuyển bằng file sao lưu).'),
        h('p', { class: 'muted small' }, 'Mỗi lần hỏi Claude chỉ gửi dữ liệu của hôm nay (ảnh bữa đang ăn, các bữa trong ngày); các ngày trước không được gửi.'),
        h('p', { class: 'muted small' }, 'Ảnh gốc của bữa ăn được giữ ' + PHOTO_KEEP_DAYS + ' ngày rồi tự xóa; ảnh nhỏ trong lịch sử được giữ mãi. File sao lưu không gồm ảnh gốc.'),
        h('p', { class: 'muted small' }, 'Số liệu dinh dưỡng là ước tính của AI và có thể sai. Ứng dụng không thay thế bác sĩ hoặc chuyên gia dinh dưỡng.'),
        h('p', { class: 'muted small' }, 'Phiên bản ' + APP_VERSION)));
    });
  }

  var APP_VERSION = '1.21';

  /** Web version: how much of the browser's storage the data uses, and whether it is kept for good. */
  function showStorageInfo(el) {
    if (!navigator.storage || !navigator.storage.estimate) {
      return;
    }
    Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)
    ]).then(function (r) {
      var mb = (r[0].usage || 0) / 1024 / 1024;
      el.textContent = '📦 Đang dùng ' + (mb < 0.1 ? '< 0,1' : mb.toFixed(1).replace('.', ',')) + ' MB trong trình duyệt. '
        + (r[1]
          ? 'Trình duyệt đã đồng ý giữ dữ liệu lâu dài.'
          : 'Trình duyệt chưa hứa giữ lâu dài (có thể tự xóa khi máy hết chỗ) — thêm trang vào màn hình chính hoặc đánh dấu trang để được giữ, và nhớ sao lưu.');
    }).catch(function () {});
  }

  function exportBackup() {
    Db.exportAll().then(function (data) {
      var text = JSON.stringify(data);
      var fileName = 'dinh-duong-sao-luu-' + dayKey() + '.json';
      if (isNative && plugins.Filesystem && plugins.Share) {
        return plugins.Filesystem.writeFile({ path: fileName, data: text, directory: 'CACHE', encoding: 'utf8' })
          .then(function (res) {
            return plugins.Share.share({ title: fileName, files: [res.uri], dialogTitle: 'Lưu file sao lưu' });
          })
          .catch(function (err) {
            if (!/cancel/i.test(err && err.message || '')) {
              alert('Không xuất được file: ' + err.message);
            }
          });
      }
      downloadFile(new File([text], fileName, { type: 'application/json' }));
    });
  }

  backupInput.addEventListener('change', function () {
    var file = backupInput.files && backupInput.files[0];
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        alert('File không đọc được.');
        return;
      }
      var mealCount = (data.meals || []).length;
      if (!confirm('Khôi phục sẽ THAY THẾ toàn bộ dữ liệu hiện tại bằng file sao lưu (' + mealCount + ' bữa ăn). Tiếp tục?')) {
        return;
      }
      Db.importAll(data).then(function () {
        alert('Đã khôi phục.');
        location.hash = '#today';
      }, function (err) {
        alert(err.message);
      });
    };
    reader.readAsText(file);
  });

  // ---- Navigation ----

  function route() {
    var hash = location.hash.replace(/^#/, '') || 'today';
    var parts = hash.split('/');
    var screen = parts[0];
    var done;
    if (screen === 'add') {
      done = (pending ? Promise.resolve() : Db.getKv('pendingMeal').then(function (stored) {
        pending = stored || null;
      })).then(function () {
        // #add/<day>: a meal missed on a past day, opened from that day's screen.
        if (/^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '')) {
          pending = pending || newPendingMeal();
          pending.day = parts[1];
        }
        return renderAdd();
      });
    } else if (screen === 'meal') {
      done = renderMeal(parseInt(parts[1], 10));
    } else if (screen === 'day') {
      done = renderDay(parts[1]);
    } else if (screen === 'food') {
      done = renderFood();
    } else if (screen === 'workout') {
      done = renderWorkout();
    } else if (screen === 'history') {
      done = renderHistory();
    } else if (screen === 'summary') {
      done = renderSummary(parts[1], parts[2]);
    } else if (screen === 'profile') {
      done = renderProfile();
    } else if (screen === 'settings') {
      done = renderSettings();
    } else {
      done = renderDay(dayKey());
    }
    return done.catch(function (err) {
      viewEl.appendChild(h('p', { class: 'error' }, 'Lỗi: ' + (err && err.message ? err.message : err)));
    });
  }

  window.addEventListener('hashchange', route);
  backBtn.addEventListener('click', function () {
    history.back();
  });

  // Android back button: go back a screen; on a main tab, leave the app.
  if (isNative && plugins.App) {
    plugins.App.addListener('backButton', function () {
      if (!busyEl.hidden) {
        return;
      }
      var screen = (location.hash.replace(/^#/, '') || 'today').split('/')[0];
      if (TABS.indexOf(screen) !== -1) {
        plugins.App.exitApp();
      } else {
        history.back();
      }
    });
  }

  // Coming back to the app on a new day shows the new day.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && ['', '#today', '#food', '#workout'].indexOf(location.hash) !== -1) {
      route();
    }
  });

  // Full-size meal photos older than PHOTO_KEEP_DAYS are cleared out each time the app opens.
  var keepFrom = new Date();
  keepFrom.setDate(keepFrom.getDate() - (PHOTO_KEEP_DAYS - 1));
  Db.prunePhotosBefore(dayKey(keepFrom)).catch(function () {});

  // Web version: everything lives in this browser's storage (IndexedDB). Ask the browser to keep it
  // ("persistent"), so it isn't cleared on its own when the device runs low on space.
  if (!isNative && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }

  loadSettings().then(route, route);
})();
