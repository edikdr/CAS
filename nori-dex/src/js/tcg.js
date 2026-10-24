/* ==========================================================================
   Карточка: отрисовка HTML и пояснения к каждому пункту.
   PL.tcg.html(card)  → разметка карточки 252×352 (объёмная: толщина + лицо)
   PL.tcg.items(card) → список пунктов для модального окна с объяснением

   Два режима лица карточки:
   • card.scan = true  → настоящий скан (скачивает scripts/fetch-card-images.mjs) + невидимые зоны поверх
   • иначе             → карточка рисуется стилями (тестовые данные)
   Каждая кликабельная часть помечена data-part="…", этот же id у пункта.
   ========================================================================== */
window.PL = window.PL || {};

PL.tcg = (function () {
  var STAGES = [_('Базовый'), _('Стадия 1'), _('Стадия 2')];

  /* правило особых карт: сколько призовых карт получает соперник */
  var SUFFIX = {
    ex:    { prizes: 2, text: _('Карта «ex»: сильнее обычной версии, но за её нокаут соперник берёт 2 призовые карты вместо одной.') },
    EX:    { prizes: 2, text: _('Карта «EX» (старая серия): мощнее обычной, но за её нокаут соперник берёт 2 призовые карты.') },
    GX:    { prizes: 2, text: _('Карта «GX»: у неё есть особая GX-атака, которую можно применить один раз за игру. За нокаут соперник берёт 2 призовые карты.') },
    V:     { prizes: 2, text: _('Карта «V»: усиленная версия покемона. За её нокаут соперник берёт 2 призовые карты.') },
    VMAX:  { prizes: 3, text: _('Карта «VMAX» — гигантская форма. Очень много HP, но за нокаут соперник берёт сразу 3 призовые карты.') },
    VSTAR: { prizes: 2, text: _('Карта «VSTAR»: у неё есть VSTAR-сила, которую можно применить один раз за игру. За нокаут соперник берёт 2 призовые карты.') },
  };

  /* зоны на скане карточки в % (рассчитаны на современную раскладку; на старых картах могут чуть съезжать) */
  var Z = {
    stage:   [3, 1.5, 15, 4.5],
    name:    [18, 1.5, 46, 6],
    hp:      [64, 1.5, 22, 6.5],
    type:    [86, 1.5, 11, 6.5],
    art:     [5, 12, 90, 43],
    moves:   [4, 56, 92, 27],
    weak:    [4, 85.5, 26, 4.8],
    resist:  [30, 85.5, 28, 4.8],
    retreat: [58, 85.5, 28, 4.8],
    rarity:  [3, 91, 46, 6],
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function pad3(n) { return String(n || 0).padStart(3, '0'); }
  function T(id) { return PL.types[id] || PL.types.colorless; }
  function R(card) { return PL.rarities[card.rarity] || PL.rarities.rare; }

  function orb(typeId, cls) {
    var t = T(typeId);
    var light = typeId === 'colorless';
    return '<span class="orb ' + (cls || '') + (light ? ' orb--light' : '') + '" style="--o1:' + t.c1 + ';--o2:' + t.c2 + '">' + PL.icon(t.icon) + '</span>';
  }

  function stageLabel(card) { return card.stageLabel || STAGES[card.stage] || _('Базовый'); }

  function zone(part, z) {
    return '<i class="zone" data-part="' + part + '" style="left:' + z[0] + '%;top:' + z[1] + '%;width:' + z[2] + '%;height:' + z[3] + '%"></i>';
  }

  /* лицо-скан: картинка (несколько источников, см. js/img.js) + невидимые зоны поверх */
  function scanImg(card, big) {
    return '<img class="scan-img" ' + PL.img.scanAttrs(card, big) + ' alt="' + esc(card.en || card.name) + '" draggable="false" loading="lazy">';
  }
  function scanBg(card, big) {   // пока грузится крупный скан, под ним уже виден маленький из кармашка
    if (!big) return '';
    var u = PL.img.chain(card, false)[0];
    return u && u.charAt(0) !== '@' ? ' style="background-image:url(' + esc(u) + ')"' : '';
  }
  function scanFace(card, big) {
    if (card.super && card.super !== 'P') {
      return '<div class="tcg-card is-scan"' + scanBg(card, big) + '>' + scanImg(card, big) +
        zone('kind', [3, 1.5, 30, 5]) + zone('lore', [5, 6, 90, 8]) + zone('rules', [6, 54, 88, 32]) + zone('rarity', Z.rarity) + '</div>';
    }
    var moves = (card.ability ? [{ id: 'abil' }] : []).concat(card.attacks.map(function (a, i) { return { id: 'atk' + i }; }));
    var mz = Z.moves, h = mz[3] / Math.max(1, moves.length);
    var zones = zone('stage', Z.stage) + zone('lore', Z.name) + zone('hp', Z.hp) + zone('type', Z.type) + zone('lore', Z.art) +
      moves.map(function (m, k) { return zone(m.id, [mz[0], mz[1] + k * h, mz[2], h]); }).join('') +
      zone('weak', Z.weak) + zone('resist', Z.resist) + zone('retreat', Z.retreat) + zone('rarity', Z.rarity);
    return '<div class="tcg-card is-scan"' + scanBg(card, big) + '>' + scanImg(card, big) + zones + '</div>';
  }

  /* лицо, нарисованное стилями */
  function drawnFace(card) {
    var t = T(card.type);
    var r = R(card);
    var art = '<div class="art-rays"></div><div class="art-dots"></div>' + (card.art
      ? '<img class="art-mon" src="' + esc(card.art) + '" alt="" draggable="false" loading="lazy">'
      : '<span class="art-num">' + pad3(card.num) + '</span><span class="art-glyph">' + PL.icon(t.icon) + '</span>');

    var attacks = card.attacks.map(function (a, i) {
      return '<div class="tcg-atk" data-part="atk' + i + '">' +
        '<div class="atk-row"><span class="atk-cost">' + a.cost.map(function (c) { return orb(c, 'orb--s'); }).join('') + '</span>' +
        '<b class="atk-name">' + esc(a.name) + '</b><em class="atk-dmg">' + esc(a.dmg || '') + '</em></div>' +
        '<p class="atk-text">' + esc(a.text) + '</p></div>';
    }).join('');

    var weak = card.weak ? orb(card.weak.type, 'orb--xs') + '<b>' + esc(card.weak.val) + '</b>' : '<b>—</b>';
    var resist = card.resist ? orb(card.resist.type, 'orb--xs') + '<b>' + esc(card.resist.val) + '</b>' : '<b>—</b>';
    var retreat = '';
    for (var i = 0; i < card.retreat; i++) retreat += orb('colorless', 'orb--xs');
    if (!card.retreat) retreat = '<b>—</b>';

    return '<div class="tcg-card">' +
      '<div class="tcg-art" data-part="lore">' + art + '</div>' +
      '<div class="tcg-shade"></div>' +
      '<div class="tcg-top">' +
        '<div class="tcg-id">' +
          (card.light ? '' : '<span class="tcg-stage" data-part="stage">' + esc(stageLabel(card)) + '</span>') +
          '<b class="tcg-name" data-part="lore">' + esc(card.name) + '</b>' +
          (card.from ? '<span class="tcg-from" data-part="stage">' + _('Эволюция от {name}', { name: esc(card.from) }) + '</span>' : '') +
        '</div>' +
        (card.hp ? '<div class="tcg-hp" data-part="hp"><span>HP</span><b>' + card.hp + '</b></div>' : '') +
        '<span class="tcg-type" data-part="type">' + orb(card.type, 'orb--l') + '</span>' +
      '</div>' +
      '<div class="tcg-moves">' + attacks + '</div>' +
      '<div class="tcg-foot">' +
        '<div class="ft" data-part="weak"><span>' + _('Слабость') + '</span><div>' + weak + '</div></div>' +
        '<div class="ft" data-part="resist"><span>' + _('Сопротивл.') + '</span><div>' + resist + '</div></div>' +
        '<div class="ft" data-part="retreat"><span>' + _('Отступление') + '</span><div>' + retreat + '</div></div>' +
      '</div>' +
      '<div class="tcg-credit" data-part="rarity"><span>' + esc(card.set || _('Тестовый набор · арт скоро')) + '</span><span>' + pad3(card.num) + ' ' + r.mark + '</span></div>' +
    '</div>';
  }

  /* лицо карты-тренера или энергии */
  /* card.kind приходит из data.js русским идентификатором (в EN — уже переведённым): ключи ниже — идентификаторы, не текст интерфейса */
  var KIND_NAME = {
    'Сторонник': _('Сторонник'),                       // i18n-ok
    'Предмет': _('Предмет'),                           // i18n-ok
    'Стадион': _('Стадион'),                           // i18n-ok
    'Инструмент': _('Инструмент'),                     // i18n-ok
    'Техническая машина': _('Техническая машина'),     // i18n-ok
    'Секретная машина': _('Секретная машина'),         // i18n-ok
    'Базовая энергия': _('Базовая энергия'),           // i18n-ok
    'Особая энергия': _('Особая энергия'),             // i18n-ok
    'Тренер': _('Тренер'),                             // i18n-ok
    'Энергия': _('Энергия'),                           // i18n-ok
  };
  function kindId(card) {   // русский идентификатор вида карты, как бы он ни пришёл (оригинал или перевод)
    var k = card.kind;
    if (KIND_NAME[k]) return k;
    for (var id in KIND_NAME) if (KIND_NAME[id] === k) return id;
    return k;
  }
  function kindName(card) { return KIND_NAME[kindId(card)] || card.kind; }

  var KIND_COLOR = { 'Сторонник': ['#ffb04a', '#c8561e'], 'Предмет': ['#5aa8ff', '#2a4fc4'], 'Стадион': ['#58d08a', '#1d7a4c'],   // i18n-ok
    'Инструмент': ['#c48cff', '#6a37c8'], 'Техническая машина': ['#9aa4b8', '#4a5468'], 'Секретная машина': ['#ff6a6a', '#9a1e2a'] };   // i18n-ok
  function trainerFace(card) {
    var energy = card.super === 'E';
    var t = T(card.type);
    var kc = energy ? [t.c1, t.c2] : (KIND_COLOR[kindId(card)] || ['#9aa4b8', '#4a5468']);
    var rules = (card.rules.length ? card.rules : card.attacks.map(function (a) { return a.text; })).filter(Boolean).slice(0, 2);
    return '<div class="tcg-card tcg-trainer" style="--t1:' + kc[0] + ';--t2:' + kc[1] + '">' +
      '<div class="tcg-art" data-part="lore"><div class="art-rays"></div><div class="art-dots"></div><span class="art-glyph">' + PL.icon(energy ? t.icon : kindId(card) === 'Стадион' ? 'map' : kindId(card) === 'Сторонник' ? 'user' : 'pokeball') + '</span></div>' +   // i18n-ok
      '<div class="tcg-shade"></div>' +
      '<div class="tcg-top"><div class="tcg-id"><span class="tcg-stage" data-part="kind">' + esc(kindName(card)) + '</span><b class="tcg-name" data-part="lore">' + esc(card.name) + '</b></div>' +
        (energy ? '<span class="tcg-type" data-part="kind">' + orb(card.type, 'orb--l') + '</span>' : '') + '</div>' +
      (rules.length ? '<div class="tcg-rules" data-part="rules">' + rules.map(function (r) { return '<p>' + esc(r) + '</p>'; }).join('') + '</div>' : '') +
      '<div class="tcg-credit" data-part="rarity"><span>' + esc(card.set || '') + '</span><span>' + esc(card.localId || '') + ' ' + R(card).mark + '</span></div>' +
    '</div>';
  }

  /* карточки по id — нужны, чтобы заменить битый скан нарисованной карточкой */
  var reg = {};

  function html(card, opts) {
    if (!card.failed) reg[card.id] = card;
    var big = !!(opts && opts.big);
    var r = R(card);
    return '<div class="tcg foil-' + r.foil + (card.scan ? ' tcg--scan' : '') + '" data-card="' + esc(card.id) + '" style="--t1:' + T(card.type).c1 + ';--t2:' + T(card.type).c2 + '">' +
      '<i class="tcg-thick t3"></i><i class="tcg-thick t2"></i><i class="tcg-thick t1"></i>' +
      '<div class="tcg-face">' +
        (card.scan ? scanFace(card, big) : card.super && card.super !== 'P' ? trainerFace(card) : drawnFace(card)) +
        '<div class="tcg-holo"></div><div class="tcg-glare"></div>' +
      '</div>' +
    '</div>';
  }

  /* ---------- пояснения ---------- */
  function costText(cost) {
    if (!cost.length) return _('бесплатно');
    var counts = {}, order = [];
    cost.forEach(function (c) { if (!counts[c]) { counts[c] = 0; order.push(c); } counts[c]++; });
    return order.map(function (c) {
      return counts[c] + '× ' + (c === 'colorless' ? _('любая энергия') : T(c).name);
    }).join(', ');
  }

  function dmgNote(dmg) {
    if (!dmg) return _('Урона нет, только эффект.');
    if (/\+$/.test(dmg)) return _('«{dmg}» — это базовый урон {base} и возможная прибавка от эффекта.', { dmg: dmg, base: dmg.slice(0, -1) });
    if (/[×x]$/.test(dmg)) return _('«{dmg}» — урон умножается в зависимости от условия.', { dmg: dmg });
    if (/-$/.test(dmg)) return _('«{dmg}» — базовый урон, который может уменьшиться от эффекта.', { dmg: dmg });
    return _('Урон: {dmg}.', { dmg: dmg });
  }

  function chainOf(card) {
    if (card.chain && card.chain.length) return card.chain;
    return card.from ? [card.from, card.name] : [card.name];
  }

  var KIND_TEXT = {
    'Сторонник': _('Сторонник — сильная карта-помощник. Играть можно только одного сторонника за ход, поэтому выбирать надо с умом.'),   // i18n-ok
    'Предмет': _('Предмет можно сыграть сколько угодно раз за ход. После использования он уходит в сброс.'),   // i18n-ok
    'Стадион': _('Стадион кладут в центр поля, и он действует на обоих игроков, пока его не заменят другим стадионом.'),   // i18n-ok
    'Инструмент': _('Инструмент прикрепляют к покемону, и он даёт постоянный эффект, пока покемон в игре.'),   // i18n-ok
    'Техническая машина': _('Техническую машину прикрепляют к покемону, чтобы дать ему дополнительную атаку.'),   // i18n-ok
    'Секретная машина': _('Секретная машина Команды R прикрепляется к покемону и даёт ему особую атаку.'),   // i18n-ok
    'Базовая энергия': _('Базовая энергия — топливо для атак. Каждый ход можно прикрепить одну энергию к своему покемону.'),   // i18n-ok
    'Особая энергия': _('Особая энергия работает как обычная, но даёт ещё и дополнительный эффект, указанный на карте.'),   // i18n-ok
    'Тренер': _('Карта тренера помогает в игре: добирает карты, лечит или мешает сопернику.'),   // i18n-ok
  };
  /* «Набор · № 12/102 · художник Имя» */
  function whereOf(card) {
    return [card.set, card.localId ? _('№ {id}', { id: card.localId + (card.total ? '/' + card.total : '') }) : '', card.illus ? _('художник {name}', { name: card.illus }) : ''].filter(Boolean).join(' · ');
  }

  function trainerItems(card) {
    var r = R(card);
    var rules = card.rules.length ? card.rules : card.attacks.map(function (a) { return a.text; }).filter(Boolean);
    var kindText = KIND_TEXT[kindId(card)] || KIND_TEXT['Тренер'];   // i18n-ok
    var list = [
      { id: 'kind', label: _('Тип карты'), title: kindName(card), value: card.super === 'E' ? _('Энергия') : _('Тренер'), tag: _('В игре'), text: kindText,
        note: card.super === 'E' && card.type !== 'colorless' ? _('Тип энергии: {type}.', { type: T(card.type).name }) : '' },
    ];
    if (rules.length) list.push({ id: 'rules', label: _('Эффект'), title: _('Эффект карты'), value: '', tag: _('В игре'), text: _('Что происходит, когда карту разыгрывают. Текст приведён так, как он напечатан на карте.'), note: _('Текст на карте: {text}', { text: rules.join(' ') }) });
    list.push({ id: 'rarity', label: _('Редкость'), title: _('Редкость · {name}', { name: card.rarityName || r.name }), value: card.localId || '', tag: _('В игре'), text: r.text, note: whereOf(card) });
    return list;
  }

  function items(card) {
    if (card.super && card.super !== 'P') return trainerItems(card);
    var t = T(card.type);
    var r = R(card);
    var chain = chainOf(card);
    var list = [];

    list.push({
      id: 'lore', label: _('Запись'), title: _('Запись о покемоне'), value: _('№{num}', { num: pad3(card.num) }), tag: _('В лоре'),
      text: card.lore || _('Описание этого покемона появится позже.'),
      note: card.loreLang === 'en' && PL.lang !== 'en'
        ? _('Описание на английском (с карты или из Покедекса) — русский перевод добавим позже.')
        : _('Линия эволюции: {chain}.', { chain: chain.join(' → ') }),
    });

    list.push({
      id: 'type', label: _('Тип'), title: _('Тип · {name}', { name: t.name }), value: t.name, tag: _('В лоре'),
      text: t.lore,
      note: _('В игре тип определяет, какая энергия нужна для атак и против каких покемонов карта сильна или слаба.'),
    });

    var st;
    if (card.stageLabel) {
      st = { text: _('Особая стадия «{stage}». Такие карты кладут поверх обычной формы покемона или выкладывают по особым правилам, указанным на карте.', { stage: card.stageLabel }),
             note: card.from ? _('Эволюционирует из: {name}.', { name: card.from }) : _('Подробности — в правиле карты.') };
    } else {
      st = {
        0: { text: _('Базовый покемон — начало эволюционной цепочки. Его можно выложить в игру сразу, без подготовки.'),
             note: chain.length > 1 ? _('В лоре это исходная форма вида, из которой развиваются {list}.', { list: chain.slice(1).join(_(' и ')) }) : _('В лоре это исходная форма вида.') },
        1: { text: card.from ? _('Первая эволюция. Эту карту кладут поверх базового покемона ({name}): он становится сильнее, но сначала его надо подготовить.', { name: card.from })
                             : _('Первая эволюция. Эту карту кладут поверх базового покемона: он становится сильнее, но сначала его надо подготовить.'),
             note: _('В лоре эволюция — резкое изменение тела: покемон растёт, набирает силу и иногда меняет облик целиком.') },
        2: { text: chain.length > 2 ? _('Вторая эволюция, финал цепочки. Нужны оба предыдущих этапа ({chain}), зато такие карты самые мощные.', { chain: chain.slice(0, -1).join(' → ') })
                                    : _('Вторая эволюция, финал цепочки. Нужны оба предыдущих этапа, зато такие карты самые мощные.'),
             note: _('В лоре финальная форма — результат долгого пути: покемон полностью раскрыл свою природу.') },
      }[card.stage] || { text: _('Стадия эволюции покемона.'), note: '' };
    }
    list.push({ id: 'stage', label: _('Стадия'), title: _('Стадия эволюции'), value: stageLabel(card), tag: _('В игре'), text: st.text, note: st.note });

    var hpWord = card.hp >= 150 ? _('Это высокий показатель: карта живучая.') : card.hp <= 80 ? _('Это мало: покемон хрупкий и быстро выбывает.') : _('Это средний запас здоровья.');
    list.push({
      id: 'hp', label: 'HP', title: _('Здоровье (HP)'), value: card.hp + ' HP', tag: _('В игре'),
      text: _('Сколько урона выдерживает покемон. Когда накопленный урон достигает {hp}, покемон нокаутирован и покидает поле.', { hp: card.hp }) + ' ' + hpWord,
      note: _('Урон не исчезает сам: он копится, пока покемона не вылечат или не заменят.'),
    });

    if (card.ability) {
      list.push({
        id: 'abil', label: card.ability.name, title: _('Способность · {name}', { name: card.ability.name }), value: card.ability.kind || 'Ability', tag: _('В игре'),
        text: _('Способность — это не атака: она работает постоянно или по условию и не требует энергии.'),
        note: card.ability.text ? _('Текст на карте: {text}', { text: card.ability.text }) : '',
      });
    }

    card.attacks.forEach(function (a, i) {
      list.push({
        id: 'atk' + i, label: a.name, title: _('Атака · {name}', { name: a.name }), value: a.dmg || _('эффект'), tag: _('В игре'),
        text: _('Стоимость: {cost}. Цветные кружки требуют энергию именно этого типа, серый (звезда) подходит любой.', { cost: costText(a.cost) }) + ' ' + dmgNote(a.dmg),
        note: a.explain || (a.text ? _('Текст на карте: {text}', { text: a.text }) : ''),
      });
    });

    var w = card.weak;
    list.push({
      id: 'weak', label: _('Слабость'), title: _('Слабость'), value: w ? T(w.type).name + ' ' + w.val : _('нет'), tag: _('В игре'),
      text: w ? (/^[×x]/.test(w.val)
                  ? _('Против покемонов типа «{type}» эта карта страдает сильнее: урон умножается на {n}.', { type: T(w.type).name, n: w.val.slice(1) })
                  : _('Против покемонов типа «{type}» эта карта страдает сильнее: к урону добавляется {n}.', { type: T(w.type).name, n: w.val.replace('+', '') }))
              : _('У этой карты нет слабости: ни один тип не бьёт её сильнее обычного.'),
      note: w ? (PL.weakWhy[w.type] || '') : '',
    });

    var rs = card.resist;
    list.push({
      id: 'resist', label: _('Сопротивление'), title: _('Сопротивление'), value: rs ? T(rs.type).name + ' ' + rs.val : _('нет'), tag: _('В игре'),
      text: rs ? _('Против покемонов типа «{type}» урон уменьшается на {n}. Это защитный бонус, обратный слабости.', { type: T(rs.type).name, n: rs.val.replace(/[−-]/, '') })
               : _('Сопротивления нет: все типы бьют эту карту в полную силу.'),
      note: rs ? _('Сопротивление показывает, чьи приёмы покемон хорошо переносит или умеет гасить.') : _('Такое бывает у большинства карт, это нормально.'),
    });

    var rt = card.retreat;
    list.push({
      id: 'retreat', label: _('Отступление'), title: _('Цена отступления'), value: rt ? rt + ' ' + _n(rt, 'энергия|энергии|энергий') : _('бесплатно'), tag: _('В игре'),
      text: rt ? _('Чтобы заменить покемона на скамье, нужно сбросить {n} энергии с него.', { n: rt }) + ' ' + (rt >= 3 ? _('Это дорого: отступать невыгодно, покемон обычно остаётся до конца.') : _('Цена умеренная.')) : _('Отступать можно бесплатно: такой покемон лёгкий и ловкий.'),
      note: _('Серые кружки — любая энергия. Чем тяжелее покемон, тем дороже его оттаскивать с поля.'),
    });

    if (card.suffix && SUFFIX[card.suffix]) {
      list.push({ id: 'rule', label: _('Правило {suffix}', { suffix: card.suffix }), title: _('Правило карты {suffix}', { suffix: card.suffix }), value: SUFFIX[card.suffix].prizes + ' ' + _n(SUFFIX[card.suffix].prizes, 'приз|приза|призов'), tag: _('В игре'),
        text: SUFFIX[card.suffix].text, note: _('Призовые карты — это 6 карт, отложенных в начале игры. Кто первым заберёт все свои призы, тот победил.') });
    }

    list.push({
      id: 'rarity', label: _('Редкость'), title: _('Редкость · {name}', { name: card.rarityName || r.name }), value: card.localId ? card.localId + (card.total ? '/' + card.total : '') : pad3(card.num) + ' ' + r.mark, tag: _('В игре'),
      text: r.text,
      note: whereOf(card) || _('Значок рядом с номером показывает редкость, а блеск на рисунке — отдельный эффект «фольги». Сейчас данные тестовые.'),
    });

    return list;
  }

  /* скан не загрузился (файла нет): на лету заменяем карточку нарисованной, сохраняя состояние (поворот, подсветку) */
  function scanFail(img) {
    var el = img.closest && img.closest('.tcg');
    if (!el || el.dataset.failed) return;
    var card = reg[el.dataset.card];
    if (!card) { img.style.visibility = 'hidden'; return; }
    var tmp = document.createElement('div');
    tmp.innerHTML = html(Object.assign({}, card, { scan: false, image: null, failed: true }));
    var neu = tmp.firstChild;
    neu.dataset.failed = '1';
    Array.prototype.forEach.call(el.classList, function (c) { if (c !== 'tcg--scan') neu.classList.add(c); });
    neu.style.cssText += el.style.cssText;
    el.replaceWith(neu);
  }

  return { html: html, items: items, esc: esc, scanFail: scanFail };
})();
