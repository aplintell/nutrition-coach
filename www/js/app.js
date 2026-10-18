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
   * (paid); 'gemini' and 'groq' call that free service with the user's own free key.
   */
  function askMode(settings) {
    settings = settings || settingsCache;
    return settings.mode || (settings.apiKey ? 'api' : 'app');
  }

  // The free services: settings key field and the name shown while waiting.
  var FREE_SERVICES = { gemini: { key: 'geminiKey', name: 'Gemini' }, groq: { key: 'groqKey', name: 'Groq' } };

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
    // Browser (testing): the question is on the clipboard; photos would be attached by hand.
    return copied.then(function () {
      alert('Đã sao chép câu hỏi. Mở Claude, dán câu hỏi' + (request.images.length ? ' và đính kèm ' + request.images.length + ' ảnh' : '') + ', rồi gửi.');
    });
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

  function nutrientTable(nutrients) {
    return h('table', { class: 'simple' },
      h('tbody', null, NUTRIENTS.map(function (n) {
        return h('tr', null, h('td', null, n.name), h('td', null, fmt(nutrients[n.key], n.unit) + ' ' + n.unit));
      })));
  }

  // ---- Exercise ----

  // What can be logged. Energy uses MET values (Compendium of Physical Activities); counted
  // exercises (sets, skips, reps) are turned into minutes with a typical pace.
  // Everything in the picker is counted in times (lần): reps, skips, or badminton sets.
  var EXERCISES = [
    { id: 'skipping', name: 'Skipping (6mm Rope)', unit: 'lần', perMinute: 110, met: 11.8 },
    { id: 'sit-up', name: 'Sit-up', unit: 'lần', perMinute: 25, met: 3.8 },
    { id: 'push-up', name: 'Push-up', unit: 'lần', perMinute: 25, met: 8 },
    { id: 'bench-dip', name: 'Bench Dip', unit: 'lần', perMinute: 20, met: 5 },
    { id: 'kb-halo', name: 'Kettlebell Halo (6kg)', unit: 'lần', perMinute: 20, met: 3.5 },
    { id: 'kb-around-world', name: 'Kettlebell Around the World (6kg)', unit: 'lần', perMinute: 25, met: 3.5 },
    { id: 'goblet-squat', name: 'Goblet Squat (6kg)', unit: 'lần', perMinute: 20, met: 5 },
    { id: 'kb-goblet-curl', name: 'Kettlebell Goblet Curl (6kg)', unit: 'lần', perMinute: 20, met: 3.5 },
    { id: 'kb-triceps-ext', name: 'Kettlebell Overhead Triceps Extension (6kg)', unit: 'lần', perMinute: 20, met: 3.5 },
    { id: 'badminton-10', name: 'Badminton Set - 10 mins', unit: 'lần', minutesEach: 10, met: 5.5 },
    { id: 'badminton-15', name: 'Badminton Set - 15 mins', unit: 'lần', minutesEach: 15, met: 5.5 }
  ];
  // Older choices, no longer offered but still needed to recompute or copy entries logged with them.
  var OLD_EXERCISES = [
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

  /** The day's targets raised for the energy burned by its exercise. */
  function withExercise(targets, kcal) {
    if (!targets || !kcal) {
      return targets;
    }
    var ranges = Object.assign({}, targets.targets);
    Object.keys(EXERCISE_SPLIT).forEach(function (key) {
      var range = ranges[key];
      var extra = kcal * EXERCISE_SPLIT[key];
      if (range) {
        ranges[key] = {
          min: range.min === null ? null : Math.round(range.min + extra),
          max: range.max === null ? null : Math.round(range.max + extra)
        };
      }
    });
    return Object.assign({}, targets, { targets: ranges });
  }

  function exerciseForAi(exercises) {
    return exercises.map(function (e) {
      return { name: e.name, amount: e.amount, unit: e.unit, kcal: e.kcal };
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
      var targets = withExercise(r[1], burned);
      var plan = r[2];
      var profile = r[3];
      var totals = sumNutrients(meals);

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
          h('span', { class: 'name' }, e.name + ' · ' + e.amount + ' ' + e.unit),
          h('span', { class: 'kcal' }, '~' + e.kcal + ' kcal'),
          h('button', {
            type: 'button',
            'aria-label': 'Xóa ' + e.name,
            onclick: function () {
              Db.remove('exercises', e.id).then(rerenderKeepingScroll);
            }
          }, '✕'));
        var wrap = h('div', null, row);
        onLongPress(row, function () {
          if (!wrap.querySelector('form')) {
            wrap.appendChild(addMoreForm(e, weight));
          }
          wrap.querySelector('input').focus();
        });
        return wrap;
      })));
      card.appendChild(h('p', { class: 'muted small' }, 'Giữ một bài tập 0,5 giây để cộng thêm số lần.'));
    } else {
      card.appendChild(h('p', { class: 'muted' }, 'Hôm nay chưa tập? Nếu có tập, thêm vào đây để mục tiêu năng lượng của ngày tăng theo.'));
    }

    function addExercise(ex, amount) {
      return Db.put('exercises', {
        day: key,
        createdAt: new Date().toISOString(),
        type: ex.id,
        name: ex.name,
        amount: amount,
        unit: ex.unit,
        minutes: Math.round(exerciseMinutes(ex, amount)),
        kcal: exerciseKcal(ex, amount, weight)
      });
    }

    var typeSelect = h('select', { name: 'type' }, EXERCISES.map(function (e) {
      return h('option', { value: e.id }, e.name);
    }));
    var amountInput = h('input', { name: 'amount', type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'VD: 20' });
    var unitLabel = h('span', null, 'Số lần (Times)');
    var preview = h('p', { class: 'muted small' }, '');
    function update() {
      var ex = EXERCISE_BY_ID[typeSelect.value];
      unitLabel.textContent = { set: 'Số set', 'lần': 'Số lần (Times)', 'phút': 'Số phút' }[ex.unit];
      var amount = parseFloat(amountInput.value);
      preview.textContent = amount > 0
        ? '≈ ' + Math.round(exerciseMinutes(ex, amount)) + ' phút, tiêu hao thêm ~' + exerciseKcal(ex, amount, weight) + ' kcal'
          + (weight ? '' : ' (tính theo ' + DEFAULT_WEIGHT_KG + ' kg — nhập cân nặng trong Hồ sơ để chính xác hơn)')
        : '';
    }
    typeSelect.addEventListener('change', update);
    amountInput.addEventListener('input', update);

    var form = h('form', { hidden: true, novalidate: true },
      h('div', { class: 'grid-2' },
        h('label', { class: 'field' }, 'Môn', typeSelect),
        h('label', { class: 'field' }, unitLabel, amountInput)),
      preview,
      h('button', { class: 'btn primary', type: 'submit' }, 'Thêm'));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var amount = parseFloat(amountInput.value);
      if (!(amount > 0)) {
        alert('Hãy nhập số lần.');
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
        amountInput.focus();
      }
    }, '+ Thêm bài tập');
    card.appendChild(showForm);
    card.appendChild(form);

    // Most days are the same routine: copy the last day that had exercise.
    Db.getAll('exercises').then(function (all) {
      var lastDay = all.map(function (e) {
        return e.day;
      }).filter(function (d) {
        return d < key;
      }).sort().pop();
      if (!lastDay) {
        return;
      }
      var routine = all.filter(function (e) {
        return e.day === lastDay;
      });
      card.insertBefore(h('button', {
        class: 'btn',
        type: 'button',
        onclick: function () {
          Promise.all(routine.map(function (e) {
            var ex = EXERCISE_BY_ID[e.type] || EXERCISE_BY_ID.other;
            return addExercise(ex, e.amount);
          })).then(rerenderKeepingScroll);
        }
      }, '↺ Giống buổi tập ' + dayTitle(lastDay) + ': ' + routine.map(function (e) {
        return e.name + ' ' + e.amount + ' ' + e.unit;
      }).join(', ')), showForm);
    });
    return card;
  }

  /** Calls fn when el is held for half a second without moving (a tap or a scroll doesn't count). */
  function onLongPress(el, fn) {
    var timer = null;
    var startX = 0;
    var startY = 0;
    function cancel() {
      clearTimeout(timer);
      timer = null;
    }
    el.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button')) {
        return;
      }
      startX = ev.clientX;
      startY = ev.clientY;
      cancel();
      timer = setTimeout(function () {
        timer = null;
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
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      el.addEventListener(type, cancel);
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
      return {
        amount: total,
        // An entry whose exercise type is unknown keeps its own energy per unit.
        minutes: Math.round(ex ? exerciseMinutes(ex, total) : (e.minutes || 0) * total / e.amount),
        kcal: ex ? exerciseKcal(ex, total, weight) : Math.round(e.kcal * total / e.amount)
      };
    }
    var input = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'VD: 20' });
    var preview = h('p', { class: 'muted small' }, '');
    input.addEventListener('input', function () {
      var amount = parseFloat(input.value);
      if (amount > 0) {
        var t = totalFor(amount);
        preview.textContent = 'Tổng: ' + e.amount + ' + ' + amount + ' = ' + t.amount + ' ' + e.unit + ', ~' + t.kcal + ' kcal';
      } else {
        preview.textContent = '';
      }
    });
    var form = h('form', { class: 'ex-more', novalidate: true },
      h('label', { class: 'field' }, 'Thêm số lần cho ' + e.name, input),
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
      var amount = parseFloat(input.value);
      if (!(amount > 0)) {
        alert('Hãy nhập số lần muốn cộng thêm.');
        return;
      }
      Db.put('exercises', Object.assign({}, e, totalFor(amount))).then(rerenderKeepingScroll);
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

  function renderAdd() {
    setScreen('Thêm bữa ăn', 'food', true);
    if (!pending) {
      pending = { photo: null, note: '', result: null, portion: 1 };
    }
    var p = pending;

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
    viewEl.appendChild(h('label', { class: 'field', style: 'margin-top:12px' }, 'Ghi chú (không bắt buộc — món gì, bao nhiêu, cách nấu)', noteInput));

    if (!p.result) {
      viewEl.appendChild(askButtons('meal', '🔍 Phân tích bữa ăn', analyze, showMealResult, true));
      if (isDirect(askMode())) {
        viewEl.appendChild(h('p', { class: 'muted small' }, 'AI ước tính món, khối lượng và chất dinh dưỡng. Mất khoảng 10–60 giây.'));
      }
      return;
    }

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
      Db.getAllByIndex('meals', 'day', dayKey()), Db.getKv('targets'), Db.getAllByIndex('exercises', 'day', dayKey())
    ]).then(function (res) {
      var targets = withExercise(res[1], exerciseTotal(res[2]));
      var before = sumNutrients(res[0]);
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
        h('table', { class: 'simple' }, h('tbody', null,
          ['energy_kcal', 'protein_g', 'carbs_g', 'sugar_g', 'fat_g', 'sat_fat_g', 'fiber_g', 'sodium_mg', 'purine_mg'].map(function (k) {
            return h('tr', null, h('td', null, NUTRIENT_BY_KEY[k].name), h('td', null, fmtAmount(k, scaled[k])));
          }))),
        h('p', null, r.comment),
        r.warnings.map(function (w) {
          return h('div', { class: 'warning' }, '⚠️ ' + w);
        }),
        overAfter.length ? h('div', { class: 'warning' }, '📈 Sau bữa này, hôm nay sẽ vượt mức: ' + overAfter.join(', ')) : null);
      viewEl.appendChild(card);

      viewEl.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: saveMeal }, '✅ Lưu — tôi sẽ ăn bữa này'));
      viewEl.appendChild(h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn',
          type: 'button',
          onclick: function () {
            p.result = null;
            storePendingMeal();
            renderAdd();
            if (isDirect(askMode())) {
              analyze();
            }
          }
        }, 'Phân tích lại'),
        h('button', {
          class: 'btn danger',
          type: 'button',
          onclick: function () {
            clearPendingMeal();
            location.hash = '#food';
          }
        }, 'Bỏ')));
    });

    function saveMeal() {
      var now = new Date();
      Db.put('meals', {
        day: dayKey(now),
        time: timeLabel(now),
        createdAt: now.toISOString(),
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
        return p.photo ? Db.put('photos', { mealId: mealId, day: dayKey(now), dataUrl: p.photo.preview }) : null;
      }).then(function () {
        clearPendingMeal();
        location.hash = '#food';
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
    if (location.hash === '#add') {
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
    Promise.all([Db.getAllByIndex('meals', 'day', dayKey()), Db.getAllByIndex('exercises', 'day', dayKey())]).then(function (today) {
      return askClaude('meal', 'Claude đang xem bữa ăn...', function (profile, labs) {
        return {
          imageBase64: p.photo ? p.photo.base64 : null,
          note: p.note.trim(),
          profile: profile,
          labs: labs,
          eatenToday: roundAll(sumNutrients(today[0])),
          exercise: exerciseForAi(today[1]),
          now: dayTitle(dayKey()) + ' ' + timeLabel()
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
      viewEl.appendChild(h('div', { class: 'card' }, h('h2', null, 'Dinh dưỡng'), nutrientTable(m.nutrients)));
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
      viewEl.appendChild(h('div', { class: 'card' }, days.map(function (day) {
        var meals = byDay[day] || [];
        var burned = exerciseTotal(exerciseByDay[day] || []);
        var dayTargets = withExercise(r[1], burned);
        var ranges = dayTargets ? dayTargets.targets : null;
        var totals = sumNutrients(meals);
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
        'Vào aistudio.google.com/apikey → đăng nhập Google → "Create API key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ lưu trên điện thoại này.',
        'Lưu ý: với gói miễn phí, Google có thể dùng dữ liệu gửi lên (ảnh, hồ sơ, xét nghiệm) để cải thiện sản phẩm của họ.'
      ], h('div', null,
        speedChoice('fast', 'Nhanh (Flash-Lite)', 'Trả lời nhanh hơn nhiều lần, đủ tốt cho bữa ăn hằng ngày.'),
        speedChoice('careful', 'Kỹ hơn (Flash)', 'Chậm hơn nhưng đọc ảnh kỹ hơn — dùng khi đọc phiếu xét nghiệm khó.'))));

      viewEl.appendChild(freeKeyCard('groq', 'gsk_...', [
        'Vào console.groq.com → đăng nhập (Google hoặc email) → API Keys → "Create API Key" → sao chép rồi dán vào đây. Miễn phí, không cần thẻ. Key chỉ lưu trên điện thoại này.',
        'Groq đọc tối đa 5 ảnh mỗi lần; khi đọc nhiều ảnh xét nghiệm, app tự chia thành nhiều lần.'
      ]));

      var keyInput = h('input', { type: 'password', autocomplete: 'off', placeholder: 'sk-ant-...' });
      keyInput.value = s.apiKey || '';
      viewEl.appendChild(h('div', { class: 'card', hidden: mode !== 'api' },
        h('h2', null, '🔑 Claude API key'),
        h('p', { class: 'muted small' }, 'Tạo key tại console.anthropic.com → API Keys, rồi dán vào đây. Key chỉ lưu trên điện thoại này.'),
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

      viewEl.appendChild(h('div', { class: 'card' },
        h('h2', null, '💾 Sao lưu'),
        h('p', { class: 'muted small' }, 'Dữ liệu chỉ nằm trên điện thoại này và sẽ mất nếu gỡ ứng dụng. Hãy sao lưu thường xuyên (gửi file qua Zalo/Drive/email cho chính mình).'),
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
        h('p', { class: 'muted small' }, 'Ảnh bữa ăn, hồ sơ và kết quả xét nghiệm được gửi tới Anthropic (Claude), Google (Gemini) hoặc Groq, tùy cách hỏi đã chọn, để phân tích mỗi khi bạn bấm phân tích; ngoài ra mọi dữ liệu chỉ lưu trên điện thoại.'),
        h('p', { class: 'muted small' }, 'Mỗi lần hỏi Claude chỉ gửi dữ liệu của hôm nay (ảnh bữa đang ăn, các bữa trong ngày); các ngày trước không được gửi.'),
        h('p', { class: 'muted small' }, 'Ảnh gốc của bữa ăn được giữ ' + PHOTO_KEEP_DAYS + ' ngày rồi tự xóa; ảnh nhỏ trong lịch sử được giữ mãi. File sao lưu không gồm ảnh gốc.'),
        h('p', { class: 'muted small' }, 'Số liệu dinh dưỡng là ước tính của AI và có thể sai. Ứng dụng không thay thế bác sĩ hoặc chuyên gia dinh dưỡng.'),
        h('p', { class: 'muted small' }, 'Phiên bản ' + APP_VERSION)));
    });
  }

  var APP_VERSION = '1.9';

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
      var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      var a = h('a', { href: url, download: fileName });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
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
      })).then(renderAdd);
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

  loadSettings().then(route, route);
})();
