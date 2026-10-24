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
  var STAGES = [_('Basic'), _('Stage 1'), _('Stage 2')];

  /* правило особых карт: сколько призовых карт получает соперник */
  var SUFFIX = {
    ex:    { prizes: 2, text: _('Pokémon ex: stronger than the regular version, but when it is Knocked Out, your opponent takes 2 Prize cards instead of 1.') },
    EX:    { prizes: 2, text: _('Pokémon-EX (older series): more powerful than the regular version, but when it is Knocked Out, your opponent takes 2 Prize cards.') },
    GX:    { prizes: 2, text: _('Pokémon-GX: it has a special GX attack that you can use once per game. When it is Knocked Out, your opponent takes 2 Prize cards.') },
    V:     { prizes: 2, text: _('Pokémon V: a powered-up version of a Pokémon. When it is Knocked Out, your opponent takes 2 Prize cards.') },
    VMAX:  { prizes: 3, text: _('Pokémon VMAX is a gigantic form. It has a lot of HP, but when it is Knocked Out, your opponent takes 3 Prize cards at once.') },
    VSTAR: { prizes: 2, text: _('Pokémon VSTAR: it has a VSTAR Power that you can use once per game. When it is Knocked Out, your opponent takes 2 Prize cards.') },
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

  function stageLabel(card) { return card.stageLabel || STAGES[card.stage] || _('Basic'); }

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
          (card.from ? '<span class="tcg-from" data-part="stage">' + _('Evolves from {name}', { name: esc(card.from) }) + '</span>' : '') +
        '</div>' +
        (card.hp ? '<div class="tcg-hp" data-part="hp"><span>HP</span><b>' + card.hp + '</b></div>' : '') +
        '<span class="tcg-type" data-part="type">' + orb(card.type, 'orb--l') + '</span>' +
      '</div>' +
      '<div class="tcg-moves">' + attacks + '</div>' +
      '<div class="tcg-foot">' +
        '<div class="ft" data-part="weak"><span>' + _('Weakness') + '</span><div>' + weak + '</div></div>' +
        '<div class="ft" data-part="resist"><span>' + _('Resistance') + '</span><div>' + resist + '</div></div>' +
        '<div class="ft" data-part="retreat"><span>' + _('Retreat') + '</span><div>' + retreat + '</div></div>' +
      '</div>' +
      '<div class="tcg-credit" data-part="rarity"><span>' + esc(card.set || _('Test set · art coming soon')) + '</span><span>' + pad3(card.num) + ' ' + r.mark + '</span></div>' +
    '</div>';
  }

  /* лицо карты-тренера или энергии */
  /* card.kind приходит из data.js русским идентификатором (в EN — уже переведённым): ключи ниже — идентификаторы, не текст интерфейса */
  var KIND_NAME = {
    'Сторонник': _('Supporter'),                       // i18n-ok
    'Предмет': _('Item'),                           // i18n-ok
    'Стадион': _('Stadium'),                           // i18n-ok
    'Инструмент': _('Pokémon Tool'),                     // i18n-ok
    'Техническая машина': _('Technical Machine'),     // i18n-ok
    'Секретная машина': _('Rocket’s Secret Machine'),         // i18n-ok
    'Базовая энергия': _('Basic Energy'),           // i18n-ok
    'Особая энергия': _('Special Energy'),             // i18n-ok
    'Тренер': _('Trainer'),                             // i18n-ok
    'Энергия': _('Energy'),                           // i18n-ok
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
    if (!cost.length) return _('free');
    var counts = {}, order = [];
    cost.forEach(function (c) { if (!counts[c]) { counts[c] = 0; order.push(c); } counts[c]++; });
    return order.map(function (c) {
      return counts[c] + '× ' + (c === 'colorless' ? _('any Energy') : T(c).name);
    }).join(', ');
  }

  function dmgNote(dmg) {
    if (!dmg) return _('No damage, just an effect.');
    if (/\+$/.test(dmg)) return _('“{dmg}” means base damage of {base} plus a possible bonus from an effect.', { dmg: dmg, base: dmg.slice(0, -1) });
    if (/[×x]$/.test(dmg)) return _('“{dmg}” means the damage is multiplied depending on a condition.', { dmg: dmg });
    if (/-$/.test(dmg)) return _('“{dmg}” is base damage that an effect may reduce.', { dmg: dmg });
    return _('Damage: {dmg}.', { dmg: dmg });
  }

  function chainOf(card) {
    if (card.chain && card.chain.length) return card.chain;
    return card.from ? [card.from, card.name] : [card.name];
  }

  var KIND_TEXT = {
    'Сторонник': _('A Supporter is a powerful helper card. You can play only one Supporter per turn, so choose wisely.'),   // i18n-ok
    'Предмет': _('You can play as many Item cards as you like during your turn. After it is used, it goes to the discard pile.'),   // i18n-ok
    'Стадион': _('A Stadium is played in the center of the field and affects both players until another Stadium replaces it.'),   // i18n-ok
    'Инструмент': _('A Pokémon Tool is attached to a Pokémon and gives a lasting effect for as long as that Pokémon is in play.'),   // i18n-ok
    'Техническая машина': _('A Technical Machine is attached to a Pokémon to give it an extra attack.'),   // i18n-ok
    'Секретная машина': _('A Team Rocket’s Secret Machine is attached to a Pokémon and gives it a special attack.'),   // i18n-ok
    'Базовая энергия': _('Basic Energy is the fuel for attacks. Once per turn, you can attach one Energy card to one of your Pokémon.'),   // i18n-ok
    'Особая энергия': _('Special Energy works like basic Energy, but it also has an extra effect printed on the card.'),   // i18n-ok
    'Тренер': _('A Trainer card helps you during the game: it draws cards, heals, or disrupts your opponent.'),   // i18n-ok
  };
  /* «Набор · № 12/102 · художник Имя» */
  function whereOf(card) {
    return [card.set, card.localId ? _('№ {id}', { id: card.localId + (card.total ? '/' + card.total : '') }) : '', card.illus ? _('illustrator {name}', { name: card.illus }) : ''].filter(Boolean).join(' · ');
  }

  function trainerItems(card) {
    var r = R(card);
    var rules = card.rules.length ? card.rules : card.attacks.map(function (a) { return a.text; }).filter(Boolean);
    var kindText = KIND_TEXT[kindId(card)] || KIND_TEXT['Тренер'];   // i18n-ok
    var list = [
      { id: 'kind', label: _('Card type'), title: kindName(card), value: card.super === 'E' ? _('Energy') : _('Trainer'), tag: _('Gameplay'), text: kindText,
        note: card.super === 'E' && card.type !== 'colorless' ? _('Energy type: {type}.', { type: T(card.type).name }) : '' },
    ];
    if (rules.length) list.push({ id: 'rules', label: _('Effect'), title: _('Card effect'), value: '', tag: _('Gameplay'), text: _('What happens when the card is played. The text is shown exactly as it is printed on the card.'), note: _('Card text: {text}', { text: rules.join(' ') }) });
    list.push({ id: 'rarity', label: _('Rarity'), title: _('Rarity · {name}', { name: card.rarityName || r.name }), value: card.localId || '', tag: _('Gameplay'), text: r.text, note: whereOf(card) });
    return list;
  }

  function items(card) {
    if (card.super && card.super !== 'P') return trainerItems(card);
    var t = T(card.type);
    var r = R(card);
    var chain = chainOf(card);
    var list = [];

    list.push({
      id: 'lore', label: _('Entry'), title: _('Pokémon entry'), value: _('№{num}', { num: pad3(card.num) }), tag: _('Lore'),
      text: card.lore || _('This Pokémon’s description will be added later.'),
      note: card.loreLang === 'en' && PL.lang !== 'en'
        ? _('Description in English (from the card or the Pokédex); a translation will be added later.')
        : _('Evolution line: {chain}.', { chain: chain.join(' → ') }),
    });

    list.push({
      id: 'type', label: _('Type'), title: _('Type · {name}', { name: t.name }), value: t.name, tag: _('Lore'),
      text: t.lore,
      note: _('In the game, a Pokémon’s type determines which Energy its attacks need and which Pokémon the card is strong or weak against.'),
    });

    var st;
    if (card.stageLabel) {
      st = { text: _('Special stage “{stage}”. These cards are played on top of the regular form of the Pokémon, or put into play under the special rules printed on the card.', { stage: card.stageLabel }),
             note: card.from ? _('Evolves from: {name}.', { name: card.from }) : _('See the card’s rule text for details.') };
    } else {
      st = {
        0: { text: _('A Basic Pokémon is the start of an evolution line. You can put it into play right away, with no setup.'),
             note: chain.length > 1 ? _('In lore, this is the original form of the species, which evolves into {list}.', { list: chain.slice(1).join(_(' and ')) }) : _('In lore, this is the original form of the species.') },
        1: { text: card.from ? _('A first evolution. Play this card on top of a Basic Pokémon ({name}): it grows stronger, but the Basic has to be in play first.', { name: card.from })
                             : _('A first evolution. Play this card on top of a Basic Pokémon: it grows stronger, but the Basic has to be in play first.'),
             note: _('In lore, evolution is a dramatic change of body: the Pokémon grows, gains strength and sometimes changes its whole appearance.') },
        2: { text: chain.length > 2 ? _('A second evolution, the end of the line. You need both earlier stages ({chain}), but these cards are the most powerful.', { chain: chain.slice(0, -1).join(' → ') })
                                    : _('A second evolution, the end of the line. You need both earlier stages, but these cards are the most powerful.'),
             note: _('In lore, the final form is the result of a long journey: the Pokémon has fully realized its nature.') },
      }[card.stage] || { text: _('A Pokémon’s evolution stage.'), note: '' };
    }
    list.push({ id: 'stage', label: _('Stage'), title: _('Evolution stage'), value: stageLabel(card), tag: _('Gameplay'), text: st.text, note: st.note });

    var hpWord = card.hp >= 150 ? _('That is high: a sturdy card.') : card.hp <= 80 ? _('That is low: the Pokémon is fragile and gets Knocked Out quickly.') : _('That is an average amount of health.');
    list.push({
      id: 'hp', label: 'HP', title: _('Hit Points (HP)'), value: card.hp + ' HP', tag: _('Gameplay'),
      text: _('How much damage this Pokémon can take. When the damage on it reaches {hp}, it is Knocked Out and leaves the field.', { hp: card.hp }) + ' ' + hpWord,
      note: _('Damage does not go away on its own: it builds up until the Pokémon is healed or replaced.'),
    });

    if (card.ability) {
      list.push({
        id: 'abil', label: card.ability.name, title: _('Ability · {name}', { name: card.ability.name }), value: card.ability.kind || 'Ability', tag: _('Gameplay'),
        text: _('An Ability is not an attack: it works all the time or under certain conditions, and it needs no Energy.'),
        note: card.ability.text ? _('Card text: {text}', { text: card.ability.text }) : '',
      });
    }

    card.attacks.forEach(function (a, i) {
      list.push({
        id: 'atk' + i, label: a.name, title: _('Attack · {name}', { name: a.name }), value: a.dmg || _('effect'), tag: _('Gameplay'),
        text: _('Cost: {cost}. Colored orbs require Energy of exactly that type; a gray one (star) accepts any Energy.', { cost: costText(a.cost) }) + ' ' + dmgNote(a.dmg),
        note: a.explain || (a.text ? _('Card text: {text}', { text: a.text }) : ''),
      });
    });

    var w = card.weak;
    list.push({
      id: 'weak', label: _('Weakness'), title: _('Weakness'), value: w ? T(w.type).name + ' ' + w.val : _('none'), tag: _('Gameplay'),
      text: w ? (/^[×x]/.test(w.val)
                  ? _('This card takes extra damage from {type}-type Pokémon: the damage is multiplied by {n}.', { type: T(w.type).name, n: w.val.slice(1) })
                  : _('This card takes extra damage from {type}-type Pokémon: the damage is increased by {n}.', { type: T(w.type).name, n: w.val.replace('+', '') }))
              : _('This card has no Weakness: no type hits it harder than usual.'),
      note: w ? (PL.weakWhy[w.type] || '') : '',
    });

    var rs = card.resist;
    list.push({
      id: 'resist', label: _('Resistance'), title: _('Resistance'), value: rs ? T(rs.type).name + ' ' + rs.val : _('none'), tag: _('Gameplay'),
      text: rs ? _('Against {type}-type Pokémon, damage is reduced by {n}. This is a defensive bonus, the opposite of Weakness.', { type: T(rs.type).name, n: rs.val.replace(/[−-]/, '') })
               : _('There is no Resistance: every type hits this card at full strength.'),
      note: rs ? _('Resistance shows whose attacks the Pokémon can take well or shrug off.') : _('Most cards have none, and that is perfectly normal.'),
    });

    var rt = card.retreat;
    list.push({
      id: 'retreat', label: _('Retreat'), title: _('Retreat Cost'), value: rt ? rt + ' ' + _n(rt, 'Energy|Energy') : _('free'), tag: _('Gameplay'),
      text: rt ? _('To switch this Pokémon with one on your Bench, you must discard {n} Energy attached to it.', { n: rt }) + ' ' + (rt >= 3 ? _('That is expensive: retreating is a poor deal, so the Pokémon usually stays put to the end.') : _('The cost is moderate.')) : _('You can retreat for free: this Pokémon is light and agile.'),
      note: _('Gray orbs mean any Energy. The heavier the Pokémon, the more it costs to drag it off the field.'),
    });

    if (card.suffix && SUFFIX[card.suffix]) {
      list.push({ id: 'rule', label: _('{suffix} rule', { suffix: card.suffix }), title: _('{suffix} card rule', { suffix: card.suffix }), value: SUFFIX[card.suffix].prizes + ' ' + _n(SUFFIX[card.suffix].prizes, 'Prize card|Prize cards'), tag: _('Gameplay'),
        text: SUFFIX[card.suffix].text, note: _('Prize cards are the 6 cards set aside at the start of the game. Whoever takes all of their Prize cards first wins.') });
    }

    list.push({
      id: 'rarity', label: _('Rarity'), title: _('Rarity · {name}', { name: card.rarityName || r.name }), value: card.localId ? card.localId + (card.total ? '/' + card.total : '') : pad3(card.num) + ' ' + r.mark, tag: _('Gameplay'),
      text: r.text,
      note: whereOf(card) || _('The symbol next to the number shows the rarity, while the shine on the art is a separate “foil” effect. The data here is for testing.'),
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
