(function (global) {
  // Exercise icons, 24x24 line icons (2 px round strokes). Jump rope, walk, run, bike, swimming,
  // yoga, tennis, football, barbell, sun and the heartbeat line are from Tabler Icons
  // (https://tabler.io/icons, MIT License, Copyright (c) 2020-2024 Pawel Kuna); the others were drawn
  // for this app in the same style. Markup is fixed, trusted text, never user data.
  var KB = function (cx, cy) {
    // A small kettlebell: bell and handle.
    return '<circle cx="' + cx + '" cy="' + (cy + 0.6) + '" r="2.3"/>'
      + '<path d="M' + (cx - 1.5) + ' ' + (cy - 0.9) + 'v-.9a1.5 1.5 0 0 1 3 0v.9"/>';
  };
  var HEAD = function (cx, cy) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="1"/>';
  };
    var ICONS = {
    // Tabler Icons (MIT): jump rope, walk, run, bike, swimming, yoga, tennis, football, barbell, sun, heartbeat.
    skipping: '<path d="M6 14v-6a3 3 0 1 1 6 0v8a3 3 0 0 0 6 0v-6"/><path d="M16 5a2 2 0 0 1 2 -2a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2a2 2 0 0 1 -2 -2z"/><path d="M4 16a2 2 0 0 1 2 -2a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2a2 2 0 0 1 -2 -2z"/>',
    walk: '<path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M7 21l3 -4"/><path d="M16 21l-2 -4l-3 -3l1 -6"/><path d="M6 12l2 -3l4 -1l3 3l3 1"/>',
    run: '<path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M4 17l5 1l.75 -1.5"/><path d="M15 21l0 -4l-4 -3l1 -6"/><path d="M7 12l0 -3l5 -1l3 3l3 1"/>',
    bike: '<path d="M5 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M19 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M12 19l0 -4l-3 -3l5 -4l2 3l3 0"/><path d="M17 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    swim: '<path d="M16 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M6 11l4 -2l3.5 3l-1.5 2"/><path d="M3 16.75a2.4 2.4 0 0 0 1 .25a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 1 -.25"/>',
    yoga: '<path d="M12 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M4 20h4l1.5 -3"/><path d="M17 20l-1 -5h-5l1 -7"/><path d="M4 10l4 -1l4 -1l4 1.5l4 1.5"/>',
    tennis: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M6 5.3a9 9 0 0 1 0 13.4"/><path d="M18 5.3a9 9 0 0 0 0 13.4"/>',
    football: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55z"/><path d="M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45"/>',
    gym: '<path d="M2 12h1"/><path d="M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2"/><path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1z"/><path d="M9 12h6"/><path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1z"/><path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2"/><path d="M22 12h-1"/>',
    sun: '<path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
    other: '<path d="M3 12h4.5l1.5 -6l4 12l2 -9l1.5 3h4.5"/>',
    // Drawn for this app in the same style.
    situp: HEAD(6, 8) + '<path d="M7.2 10.5l3.8 8"/><path d="M11 18.5l4.5 -6l4.5 6"/><path d="M8.2 13h6"/><path d="M3 21h18"/>',
    pushup: HEAD(5, 8.5) + '<path d="M6.8 10.8l13.7 6.2"/><path d="M7.5 11.3v7.2"/><path d="M3 20h18"/>',
    plank: HEAD(5, 12) + '<path d="M7 14l13.5 3.3"/><path d="M7.5 14.5v4h4.5"/><path d="M3 20.5h18"/>',
    benchdip: HEAD(14, 5) + '<path d="M2 12h7"/><path d="M3 12v8"/><path d="M8 12v8"/><path d="M14 7.5v7"/><path d="M14 9l-5 3"/><path d="M14 14.5h5v5.5"/>',
    lunge: HEAD(11, 3.5) + '<path d="M11 6v6.5"/><path d="M11 12.5l5 .5v6.5"/><path d="M11 12.5l-3 5.5l-3.5 1"/><path d="M11 7.5l-2.5 3.5"/><path d="M3 21h18"/>',
    kbhalo: HEAD(12, 12) + '<path d="M6.6 14.2a5.8 5.8 0 1 1 10.8 0"/><path d="M17.4 14.2l.4 -2.6m-.4 2.6l-2.4 -1"/><path d="M12 14.5v3.5"/><path d="M12 18l-2.5 3.5m2.5 -3.5l2.5 3.5"/>' + KB(7.6, 6.2),
    kbaround: HEAD(12, 3.5) + '<path d="M12 6v8"/><path d="M12 14l-2.5 7m2.5 -7l2.5 7"/><path d="M15.8 9.6c-1.1 -.2 -2.4 -.3 -3.8 -.3c-3.9 0 -7 1.1 -7 2.5s3.1 2.5 7 2.5s7 -1.1 7 -2.5"/>' + KB(18.6, 9.4),
    gobletsquat: HEAD(8.5, 4) + '<path d="M8.5 6.5l-1.5 7"/><path d="M7 13.5h6v6.5"/><path d="M8.3 8.5l3.7 1.5"/><path d="M3 21h18"/>' + KB(14.5, 10),
    gobletcurl: HEAD(8.5, 3.5) + '<path d="M8.5 6v8"/><path d="M8.5 14l-2 7m2 -7l2 7"/><path d="M8.5 7.5l2.5 4.5l3 -3.2"/><path d="M8.5 7.5l-2 4.5"/>' + KB(16.2, 7.6),
    triceps: HEAD(12, 10.5) + '<path d="M12 13v4"/><path d="M12 17l-2.5 4.5m2.5 -4.5l2.5 4.5"/><path d="M10.6 12.6l-2.6 -4.6l2.4 -2"/><path d="M13.4 12.6l2.6 -4.6l-2.4 -2"/>' + KB(12, 4),
    badminton: '<ellipse cx="8.5" cy="8.5" rx="5.6" ry="4.1" transform="rotate(-45 8.5 8.5)"/><path d="M5.5 5.5l6 6"/><path d="M12.5 12.5l7.5 7.5"/><circle cx="19.2" cy="4.8" r="1.4"/><path d="M18.2 5.8l-3.6 1l2.6 2.6z"/>'
  };

  // Exercise type (EXERCISES / OLD_EXERCISES ids in app.js) -> icon.
  var FOR_TYPE = {
    skipping: 'skipping', rope: 'skipping', 'sit-up': 'situp', situp: 'situp', plank: 'plank', 'push-up': 'pushup', pushup: 'pushup',
    'bench-dip': 'benchdip', 'kb-halo': 'kbhalo', 'kb-around-world': 'kbaround', 'goblet-squat': 'gobletsquat', lunge: 'lunge',
    'kb-goblet-curl': 'gobletcurl', 'kb-triceps-ext': 'triceps', 'badminton-1': 'badminton', 'badminton-10': 'badminton',
    'badminton-15': 'badminton', 'badminton-set': 'badminton', badminton: 'badminton', 'walk-min': 'walk', 'walk-km': 'walk',
    walk: 'walk', run: 'run', bike: 'bike', swim: 'swim', gym: 'gym', football: 'football', tennis: 'tennis', yoga: 'yoga',
    sunbath: 'sun', other: 'other'
  };

  /** A new <svg> element with the icon for an exercise type (aria-hidden: the name is said elsewhere). */
  function forType(type) {
    var holder = document.createElement('span');
    holder.innerHTML = '<svg class="ex-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[FOR_TYPE[type] || 'other'] + '</svg>';
    return holder.firstChild;
  }

  global.ExerciseIcons = { forType: forType };
})(window);
