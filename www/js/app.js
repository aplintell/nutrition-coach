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

  function loadSettings() {
    return Db.getKv('settings').then(function (s) {
      return s || { apiKey: '', totalCostUsd: 0, requestCount: 0 };
    });
  }

  function addCost(costUsd) {
    return loadSettings().then(function (s) {
      s.totalCostUsd = (s.totalCostUsd || 0) + costUsd;
      s.requestCount = (s.requestCount || 0) + 1;
      return Db.setKv('settings', s);
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

  /** Runs a Claude request with the busy overlay, records its cost, and reports errors. */
  function callAi(busyText, fn) {
    return loadSettings().then(function (settings) {
      if (!settings.apiKey) {
        alert('Chưa có API key. Vào Cài đặt để nhập API key của Anthropic.');
        location.hash = '#settings';
        return null;
      }
      showBusy(busyText);
      return Promise.all([Db.getKv('profile'), Db.getAll('labs')]).then(function (r) {
        return fn(settings.apiKey, profileForAi(r[0]), r[1]);
      }).then(function (answer) {
        hideBusy();
        addCost(answer.costUsd);
        return answer.result;
      }, function (err) {
        hideBusy();
        alert(err && err.message ? err.message : String(err));
        return null;
      });
    });
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

  function pickRawPhoto(title) {
    if (isNative && plugins.Camera) {
      return plugins.Camera.getPhoto({
        resultType: 'dataUrl',
        source: 'PROMPT',
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
        if (/cancel/i.test(err && err.message || '')) {
          return null;
        }
        throw err;
      });
    }
    return new Promise(function (resolve) {
      photoInput.value = '';
      photoInput.onchange = function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file) {
          resolve(null);
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          resolve(reader.result);
        };
        reader.readAsDataURL(file);
      };
      photoInput.click();
    });
  }

  /** Resolves to { base64, thumb } (1280px JPEG for Claude, small JPEG to keep), or null if cancelled. */
  function pickPhoto(title) {
    return pickRawPhoto(title).then(function (dataUrl) {
      if (!dataUrl) {
        return null;
      }
      return Promise.all([resizeToJpeg(dataUrl, 1280, 0.82), resizeToJpeg(dataUrl, 320, 0.7)]).then(function (r) {
        return { base64: r[0].split(',')[1], preview: r[0], thumb: r[1] };
      });
    }).catch(function (err) {
      alert('Không lấy được ảnh: ' + (err && err.message ? err.message : err));
      return null;
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

  function targetsStale(targets, profile, labsUpdatedAt) {
    if (!targets) {
      return false;
    }
    var changed = [profile && profile.updatedAt, labsUpdatedAt].filter(Boolean).sort().pop();
    return !!changed && changed > targets.computedAt;
  }

  // ---- Screens ----

  var TABS = ['today', 'history', 'profile', 'settings'];

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
      Db.getKv('profile'), Db.getKv('labsUpdatedAt')
    ]).then(function (r) {
      var meals = r[0].sort(function (a, b) {
        return a.createdAt < b.createdAt ? -1 : 1;
      });
      var targets = r[1];
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
        nutrientBars(totals, targets)));

      viewEl.appendChild(h('div', { class: 'card' },
        h('h2', null, 'Bữa ăn (' + meals.length + ')'),
        meals.length === 0 ? h('p', { class: 'muted' }, isToday ? 'Trước khi ăn, bấm "+ Bữa ăn" và chụp ảnh món ăn.' : 'Không có bữa ăn.') : null,
        meals.map(function (m) {
          return h('a', { class: 'meal-row', href: '#meal/' + m.id },
            m.thumb ? h('img', { class: 'thumb', src: m.thumb, alt: '' }) : h('div', { class: 'thumb' }, '🍽️'),
            h('div', { class: 'info' },
              h('div', { class: 'name' }, m.name),
              h('div', { class: 'muted small' }, m.time + (m.portion !== 1 ? ' · ' + Math.round(m.portion * 100) + '% phần' : ''))),
            h('div', { class: 'kcal' }, fmt(m.nutrients.energy_kcal, 'kcal') + ' kcal'));
        })));

      if (isToday) {
        viewEl.appendChild(planCard(key, meals, totals, targets, plan));
        viewEl.appendChild(h('button', {
          class: 'fab',
          type: 'button',
          onclick: function () {
            location.hash = '#add';
          }
        }, '+ Bữa ăn'));
      }
      viewEl.appendChild(h('p', { class: 'disclaimer' }, 'Số liệu là ước tính của AI, không thay thế lời khuyên của bác sĩ.'));
    });
  }

  function planCard(key, meals, totals, targets, plan) {
    var card = h('div', { class: 'card' }, h('h2', null, '🤖 Nên ăn gì tiếp hôm nay?'));
    var stale = plan && plan.mealCount !== meals.length;
    if (plan) {
      var r = plan.result;
      card.appendChild(h('p', { class: 'muted small' },
        'Cập nhật lúc ' + plan.time + ' (sau ' + plan.mealCount + ' bữa)' + (stale ? ' · đã có bữa mới, nên cập nhật' : '')));
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
    card.appendChild(h('button', {
      class: 'btn' + (!plan || stale ? ' primary' : ''),
      type: 'button',
      onclick: function () {
        if (!targets) {
          alert('Hãy tính mục tiêu mỗi ngày trong Hồ sơ trước.');
          location.hash = '#profile';
          return;
        }
        callAi('Claude đang lên kế hoạch cho phần còn lại của ngày...', function (apiKey, profile, labs) {
          return AI.planRestOfDay({
            apiKey: apiKey,
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
            now: dayTitle(key) + ' ' + timeLabel()
          });
        }).then(function (result) {
          if (!result) {
            return;
          }
          return Db.put('plans', { day: key, time: timeLabel(), mealCount: meals.length, result: result }).then(route);
        });
      }
    }, plan ? 'Cập nhật gợi ý' : 'Phân tích & gợi ý'));
    return card;
  }

  // Add a meal: photo → Claude's estimate → save (or not)
  var pending = null;

  function renderAdd() {
    setScreen('Thêm bữa ăn', 'today', true);
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
      viewEl.appendChild(h('button', {
        class: 'btn primary',
        type: 'button',
        onclick: analyze
      }, '🔍 Phân tích bữa ăn'));
      viewEl.appendChild(h('p', { class: 'muted small' }, 'Claude ước tính món, khối lượng và chất dinh dưỡng. Mất khoảng 10–60 giây.'));
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

    Promise.all([Db.getAllByIndex('meals', 'day', dayKey()), Db.getKv('targets')]).then(function (res) {
      var targets = res[1];
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
        h('button', { class: 'btn', type: 'button', onclick: analyze }, 'Phân tích lại'),
        h('button', {
          class: 'btn danger',
          type: 'button',
          onclick: function () {
            pending = null;
            location.hash = '#today';
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
      }).then(function () {
        pending = null;
        location.hash = '#today';
      }, function (err) {
        alert('Không lưu được: ' + err.message);
      });
    }
  }

  function analyze() {
    var p = pending;
    if (!p.photo && !p.note.trim()) {
      alert('Hãy chụp ảnh bữa ăn hoặc ghi chú món ăn.');
      return;
    }
    Db.getAllByIndex('meals', 'day', dayKey()).then(function (meals) {
      return callAi('Claude đang xem bữa ăn...', function (apiKey, profile, labs) {
        return AI.analyzeMeal({
          apiKey: apiKey,
          imageBase64: p.photo ? p.photo.base64 : null,
          note: p.note.trim(),
          profile: profile,
          labs: labs,
          eatenToday: roundAll(sumNutrients(meals)),
          now: dayTitle(dayKey()) + ' ' + timeLabel()
        });
      });
    }).then(function (result) {
      if (result) {
        p.result = result;
        p.portion = 1;
        if (location.hash === '#add') {
          renderAdd();
        }
      }
    });
  }

  // One saved meal
  function renderMeal(id) {
    setScreen('Bữa ăn', 'today', true);
    return Db.get('meals', id).then(function (m) {
      if (!m) {
        viewEl.appendChild(h('p', { class: 'empty' }, 'Không tìm thấy bữa ăn này.'));
        return;
      }
      titleEl.textContent = m.name;
      viewEl.appendChild(h('div', { class: 'card' },
        m.thumb ? h('img', { src: m.thumb, alt: '', style: 'width:100%;border-radius:10px;margin-bottom:10px' }) : null,
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
            Db.remove('meals', m.id).then(function () {
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
    return Promise.all([Db.getAll('meals'), Db.getKv('targets')]).then(function (r) {
      var byDay = {};
      r[0].forEach(function (m) {
        (byDay[m.day] = byDay[m.day] || []).push(m);
      });
      var days = Object.keys(byDay).sort().reverse();
      if (days.length === 0) {
        viewEl.appendChild(h('p', { class: 'empty' }, 'Chưa có dữ liệu.'));
        return;
      }
      var ranges = r[1] ? r[1].targets : null;
      viewEl.appendChild(h('div', { class: 'card' }, days.map(function (day) {
        var totals = sumNutrients(byDay[day]);
        var over = ranges ? NUTRIENTS.filter(function (n) {
          return statusOf(totals[n.key], ranges[n.key]) === 'over';
        }) : [];
        return h('a', { class: 'meal-row', href: '#day/' + day },
          h('div', { class: 'thumb' }, '📅'),
          h('div', { class: 'info' },
            h('div', { class: 'name' }, dayTitle(day)),
            h('div', { class: 'muted small' }, byDay[day].length + ' bữa' + (over.length ? ' · vượt: ' + over.map(function (n) {
              return n.name;
            }).join(', ') : ''))),
          h('div', { class: 'kcal' }, fmt(totals.energy_kcal, 'kcal') + ' kcal'));
      })));
    });
  }

  // Health profile, daily targets and lab results
  var pendingLabs = null;

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
    card.appendChild(h('button', {
      class: 'btn' + (!targets || targetsStale(targets, profile, labsUpdatedAt) ? ' primary' : ''),
      type: 'button',
      onclick: function () {
        if (!profile) {
          alert('Hãy lưu hồ sơ trước.');
          return;
        }
        callAi('Claude đang tính mục tiêu dinh dưỡng của bạn...', function (apiKey, p, labList) {
          return AI.computeTargets({ apiKey: apiKey, profile: p, labs: labList, today: dayKey() });
        }).then(function (result) {
          if (!result) {
            return;
          }
          return Db.setKv('targets', {
            computedAt: new Date().toISOString(),
            targets: result.targets,
            explanation: result.explanation,
            labFlags: result.lab_flags
          }).then(route);
        });
      }
    }, targets ? 'Tính lại mục tiêu' : 'Tính mục tiêu mỗi ngày'));
    return card;
  }

  function markLabsChanged() {
    return Db.setKv('labsUpdatedAt', new Date().toISOString());
  }

  function labsCard(labs) {
    var card = h('div', { class: 'card' }, h('h2', null, '🧪 Xét nghiệm máu & nước tiểu'));

    if (pendingLabs) {
      card.appendChild(h('p', { class: 'muted small' }, 'Claude đọc được ' + pendingLabs.tests.length + ' kết quả' + (pendingLabs.test_date ? ' (ngày ' + pendingLabs.test_date + ')' : '') + '. Kiểm tra lại với phiếu rồi bỏ chọn dòng sai.'));
      var boxes = pendingLabs.tests.map(function (t) {
        var box = h('input', { type: 'checkbox' });
        box.checked = true;
        card.appendChild(h('label', { class: 'check-row' }, box,
          h('span', null, h('strong', null, t.name), ': ' + t.value + ' ' + t.unit + (t.reference_range ? ' (tham chiếu ' + t.reference_range + ')' : ''))));
        return box;
      });
      card.appendChild(h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn primary',
          type: 'button',
          onclick: function () {
            var date = pendingLabs.test_date || dayKey();
            var writes = pendingLabs.tests.filter(function (t, i) {
              return boxes[i].checked;
            }).map(function (t) {
              return Db.put('labs', { type: t.type, name: t.name, value: t.value, unit: t.unit, reference_range: t.reference_range, date: date });
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
            route();
          }
        }, 'Bỏ')));
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

    card.appendChild(h('button', {
      class: 'btn',
      type: 'button',
      onclick: function () {
        pickPhoto('Ảnh phiếu xét nghiệm').then(function (photo) {
          if (!photo) {
            return;
          }
          callAi('Claude đang đọc phiếu xét nghiệm...', function (apiKey) {
            return AI.readLabReport({ apiKey: apiKey, imageBase64: photo.base64 });
          }).then(function (result) {
            if (!result) {
              return;
            }
            if (result.tests.length === 0) {
              alert('Không đọc được kết quả nào. Hãy chụp rõ hơn, đủ sáng, thẳng phiếu.');
              return;
            }
            pendingLabs = result;
            route();
          });
        });
      }
    }, '📷 Chụp phiếu xét nghiệm (Claude đọc giúp)'));

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
      var keyInput = h('input', { type: 'password', autocomplete: 'off', placeholder: 'sk-ant-...' });
      keyInput.value = s.apiKey || '';
      viewEl.appendChild(h('div', { class: 'card' },
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
            Db.setKv('settings', s).then(function () {
              alert(s.apiKey ? 'Đã lưu API key.' : 'Đã xóa API key.');
            });
          }
        }, 'Lưu key')));

      viewEl.appendChild(h('div', { class: 'card' },
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
        h('h2', null, 'ℹ️ Về ứng dụng'),
        h('p', { class: 'muted small' }, 'Ảnh bữa ăn, hồ sơ và kết quả xét nghiệm được gửi tới Anthropic (Claude) để phân tích mỗi khi bạn bấm phân tích; ngoài ra mọi dữ liệu chỉ lưu trên điện thoại.'),
        h('p', { class: 'muted small' }, 'Số liệu dinh dưỡng là ước tính của AI và có thể sai. Ứng dụng không thay thế bác sĩ hoặc chuyên gia dinh dưỡng.'),
        h('p', { class: 'muted small' }, 'Phiên bản ' + APP_VERSION)));
    });
  }

  var APP_VERSION = '1.0';

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
      done = Promise.resolve(renderAdd());
    } else if (screen === 'meal') {
      done = renderMeal(parseInt(parts[1], 10));
    } else if (screen === 'day') {
      done = renderDay(parts[1]);
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
    if (!document.hidden && (location.hash === '' || location.hash === '#today')) {
      route();
    }
  });

  route();
})();
