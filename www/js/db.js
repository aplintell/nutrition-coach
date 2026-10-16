(function (global) {
  // All data stays on the phone, in the WebView's IndexedDB.
  //   kv:    single records by name — 'profile', 'targets', 'settings'
  //   labs:  one record per lab test result
  //   meals: one record per saved meal (with a small photo thumbnail), indexed by day (YYYY-MM-DD)
  //   plans: the latest "rest of the day" plan per day, keyed by day
  var DB_NAME = 'nutrition-coach';
  var DB_VERSION = 1;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
        if (!db.objectStoreNames.contains('labs')) {
          db.createObjectStore('labs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('meals')) {
          var meals = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
          meals.createIndex('day', 'day');
        }
        if (!db.objectStoreNames.contains('plans')) {
          db.createObjectStore('plans', { keyPath: 'day' });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function run(storeName, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction([storeName], mode);
        var req = fn(t.objectStore(storeName));
        t.oncomplete = function () {
          resolve(req ? req.result : undefined);
        };
        t.onerror = function () {
          reject(t.error);
        };
        t.onabort = function () {
          reject(t.error);
        };
      });
    });
  }

  var Db = {
    getKv: function (name) {
      return run('kv', 'readonly', function (s) {
        return s.get(name);
      });
    },
    setKv: function (name, value) {
      return run('kv', 'readwrite', function (s) {
        return s.put(value, name);
      });
    },
    getAll: function (storeName) {
      return run(storeName, 'readonly', function (s) {
        return s.getAll();
      });
    },
    get: function (storeName, key) {
      return run(storeName, 'readonly', function (s) {
        return s.get(key);
      });
    },
    getAllByIndex: function (storeName, indexName, value) {
      return run(storeName, 'readonly', function (s) {
        return s.index(indexName).getAll(value);
      });
    },
    /** Adds or replaces a record; resolves to its key. */
    put: function (storeName, value) {
      return run(storeName, 'readwrite', function (s) {
        return s.put(value);
      });
    },
    remove: function (storeName, key) {
      return run(storeName, 'readwrite', function (s) {
        return s.delete(key);
      });
    },
    clear: function (storeName) {
      return run(storeName, 'readwrite', function (s) {
        return s.clear();
      });
    },

    /** Everything, for the backup file. */
    exportAll: function () {
      return Promise.all([
        Db.getKv('profile'), Db.getKv('targets'), Db.getAll('labs'), Db.getAll('meals'), Db.getAll('plans')
      ]).then(function (r) {
        return {
          app: 'nutrition-coach',
          version: 1,
          exportedAt: new Date().toISOString(),
          profile: r[0] || null,
          targets: r[1] || null,
          labs: r[2],
          meals: r[3],
          plans: r[4]
        };
      });
    },

    /** Replaces all data with a backup made by exportAll. Settings (API key) are kept as they are. */
    importAll: function (data) {
      if (!data || data.app !== 'nutrition-coach') {
        return Promise.reject(new Error('Đây không phải file sao lưu của ứng dụng này.'));
      }
      return Promise.all(['labs', 'meals', 'plans'].map(Db.clear)).then(function () {
        var writes = [Db.setKv('profile', data.profile || null), Db.setKv('targets', data.targets || null)];
        (data.labs || []).forEach(function (x) {
          writes.push(Db.put('labs', x));
        });
        (data.meals || []).forEach(function (x) {
          writes.push(Db.put('meals', x));
        });
        (data.plans || []).forEach(function (x) {
          writes.push(Db.put('plans', x));
        });
        return Promise.all(writes);
      });
    }
  };

  // Ask the browser not to clear the data when the phone runs low on space.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }

  global.Db = Db;
})(window);
