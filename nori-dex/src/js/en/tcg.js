window.PL = window.PL || {};
PL.i18n.add({
  // стадии
  'Базовый': 'Basic',
  'Стадия 1': 'Stage 1',
  'Стадия 2': 'Stage 2',

  // правила особых карт
  'Карта «ex»: сильнее обычной версии, но за её нокаут соперник берёт 2 призовые карты вместо одной.':
    'Pokémon ex: stronger than the regular version, but when it is Knocked Out, your opponent takes 2 Prize cards instead of 1.',
  'Карта «EX» (старая серия): мощнее обычной, но за её нокаут соперник берёт 2 призовые карты.':
    'Pokémon-EX (older series): more powerful than the regular version, but when it is Knocked Out, your opponent takes 2 Prize cards.',
  'Карта «GX»: у неё есть особая GX-атака, которую можно применить один раз за игру. За нокаут соперник берёт 2 призовые карты.':
    'Pokémon-GX: it has a special GX attack that you can use once per game. When it is Knocked Out, your opponent takes 2 Prize cards.',
  'Карта «V»: усиленная версия покемона. За её нокаут соперник берёт 2 призовые карты.':
    'Pokémon V: a powered-up version of a Pokémon. When it is Knocked Out, your opponent takes 2 Prize cards.',
  'Карта «VMAX» — гигантская форма. Очень много HP, но за нокаут соперник берёт сразу 3 призовые карты.':
    'Pokémon VMAX is a gigantic form. It has a lot of HP, but when it is Knocked Out, your opponent takes 3 Prize cards at once.',
  'Карта «VSTAR»: у неё есть VSTAR-сила, которую можно применить один раз за игру. За нокаут соперник берёт 2 призовые карты.':
    'Pokémon VSTAR: it has a VSTAR Power that you can use once per game. When it is Knocked Out, your opponent takes 2 Prize cards.',

  // разметка карточки
  'Эволюция от {name}': 'Evolves from {name}',
  'Слабость': 'Weakness',
  'Сопротивл.': 'Resistance',
  'Отступление': 'Retreat',
  'Тестовый набор · арт скоро': 'Test set · art coming soon',

  // виды карт Тренера и Энергии (те же ключи есть в en/data.js — значения совпадают)
  'Сторонник': 'Supporter',
  'Предмет': 'Item',
  'Стадион': 'Stadium',
  'Инструмент': 'Pokémon Tool',
  'Техническая машина': 'Technical Machine',
  'Секретная машина': 'Rocket’s Secret Machine',
  'Базовая энергия': 'Basic Energy',
  'Особая энергия': 'Special Energy',
  'Тренер': 'Trainer',
  'Энергия': 'Energy',

  // стоимость и урон
  'бесплатно': 'free',
  'любая энергия': 'any Energy',
  'Урона нет, только эффект.': 'No damage, just an effect.',
  '«{dmg}» — это базовый урон {base} и возможная прибавка от эффекта.': '“{dmg}” means base damage of {base} plus a possible bonus from an effect.',
  '«{dmg}» — урон умножается в зависимости от условия.': '“{dmg}” means the damage is multiplied depending on a condition.',
  '«{dmg}» — базовый урон, который может уменьшиться от эффекта.': '“{dmg}” is base damage that an effect may reduce.',
  'Урон: {dmg}.': 'Damage: {dmg}.',

  // пояснения к видам карт
  'Сторонник — сильная карта-помощник. Играть можно только одного сторонника за ход, поэтому выбирать надо с умом.':
    'A Supporter is a powerful helper card. You can play only one Supporter per turn, so choose wisely.',
  'Предмет можно сыграть сколько угодно раз за ход. После использования он уходит в сброс.':
    'You can play as many Item cards as you like during your turn. After it is used, it goes to the discard pile.',
  'Стадион кладут в центр поля, и он действует на обоих игроков, пока его не заменят другим стадионом.':
    'A Stadium is played in the center of the field and affects both players until another Stadium replaces it.',
  'Инструмент прикрепляют к покемону, и он даёт постоянный эффект, пока покемон в игре.':
    'A Pokémon Tool is attached to a Pokémon and gives a lasting effect for as long as that Pokémon is in play.',
  'Техническую машину прикрепляют к покемону, чтобы дать ему дополнительную атаку.':
    'A Technical Machine is attached to a Pokémon to give it an extra attack.',
  'Секретная машина Команды R прикрепляется к покемону и даёт ему особую атаку.':
    'A Team Rocket’s Secret Machine is attached to a Pokémon and gives it a special attack.',
  'Базовая энергия — топливо для атак. Каждый ход можно прикрепить одну энергию к своему покемону.':
    'Basic Energy is the fuel for attacks. Once per turn, you can attach one Energy card to one of your Pokémon.',
  'Особая энергия работает как обычная, но даёт ещё и дополнительный эффект, указанный на карте.':
    'Special Energy works like basic Energy, but it also has an extra effect printed on the card.',
  'Карта тренера помогает в игре: добирает карты, лечит или мешает сопернику.':
    'A Trainer card helps you during the game: it draws cards, heals, or disrupts your opponent.',

  // пояснения к карте
  '№ {id}': '#{id}',
  '№{num}': '#{num}',
  'художник {name}': 'illustrator {name}',
  'Тип карты': 'Card type',
  'В игре': 'Gameplay',
  'В лоре': 'Lore',
  'Тип энергии: {type}.': 'Energy type: {type}.',
  'Эффект': 'Effect',
  'Эффект карты': 'Card effect',
  'Что происходит, когда карту разыгрывают. Текст приведён так, как он напечатан на карте.':
    'What happens when the card is played. The text is shown exactly as it is printed on the card.',
  'Текст на карте: {text}': 'Card text: {text}',
  'Редкость': 'Rarity',
  'Редкость · {name}': 'Rarity · {name}',

  'Запись': 'Entry',
  'Запись о покемоне': 'Pokémon entry',
  'Описание этого покемона появится позже.': 'This Pokémon’s description will be added later.',
  'Описание на английском (с карты или из Покедекса) — русский перевод добавим позже.':
    'Description in English (from the card or the Pokédex); a translation will be added later.',
  'Линия эволюции: {chain}.': 'Evolution line: {chain}.',

  'Тип': 'Type',
  'Тип · {name}': 'Type · {name}',
  'В игре тип определяет, какая энергия нужна для атак и против каких покемонов карта сильна или слаба.':
    'In the game, a Pokémon’s type determines which Energy its attacks need and which Pokémon the card is strong or weak against.',

  'Стадия': 'Stage',
  'Стадия эволюции': 'Evolution stage',
  'Особая стадия «{stage}». Такие карты кладут поверх обычной формы покемона или выкладывают по особым правилам, указанным на карте.':
    'Special stage “{stage}”. These cards are played on top of the regular form of the Pokémon, or put into play under the special rules printed on the card.',
  'Эволюционирует из: {name}.': 'Evolves from: {name}.',
  'Подробности — в правиле карты.': 'See the card’s rule text for details.',
  'Базовый покемон — начало эволюционной цепочки. Его можно выложить в игру сразу, без подготовки.':
    'A Basic Pokémon is the start of an evolution line. You can put it into play right away, with no setup.',
  'В лоре это исходная форма вида, из которой развиваются {list}.':
    'In lore, this is the original form of the species, which evolves into {list}.',
  ' и ': ' and ',
  'В лоре это исходная форма вида.': 'In lore, this is the original form of the species.',
  'Первая эволюция. Эту карту кладут поверх базового покемона ({name}): он становится сильнее, но сначала его надо подготовить.':
    'A first evolution. Play this card on top of a Basic Pokémon ({name}): it grows stronger, but the Basic has to be in play first.',
  'Первая эволюция. Эту карту кладут поверх базового покемона: он становится сильнее, но сначала его надо подготовить.':
    'A first evolution. Play this card on top of a Basic Pokémon: it grows stronger, but the Basic has to be in play first.',
  'В лоре эволюция — резкое изменение тела: покемон растёт, набирает силу и иногда меняет облик целиком.':
    'In lore, evolution is a dramatic change of body: the Pokémon grows, gains strength and sometimes changes its whole appearance.',
  'Вторая эволюция, финал цепочки. Нужны оба предыдущих этапа ({chain}), зато такие карты самые мощные.':
    'A second evolution, the end of the line. You need both earlier stages ({chain}), but these cards are the most powerful.',
  'Вторая эволюция, финал цепочки. Нужны оба предыдущих этапа, зато такие карты самые мощные.':
    'A second evolution, the end of the line. You need both earlier stages, but these cards are the most powerful.',
  'В лоре финальная форма — результат долгого пути: покемон полностью раскрыл свою природу.':
    'In lore, the final form is the result of a long journey: the Pokémon has fully realized its nature.',
  'Стадия эволюции покемона.': 'A Pokémon’s evolution stage.',

  'Здоровье (HP)': 'Hit Points (HP)',
  'Это высокий показатель: карта живучая.': 'That is high: a sturdy card.',
  'Это мало: покемон хрупкий и быстро выбывает.': 'That is low: the Pokémon is fragile and gets Knocked Out quickly.',
  'Это средний запас здоровья.': 'That is an average amount of health.',
  'Сколько урона выдерживает покемон. Когда накопленный урон достигает {hp}, покемон нокаутирован и покидает поле.':
    'How much damage this Pokémon can take. When the damage on it reaches {hp}, it is Knocked Out and leaves the field.',
  'Урон не исчезает сам: он копится, пока покемона не вылечат или не заменят.':
    'Damage does not go away on its own: it builds up until the Pokémon is healed or replaced.',

  'Способность · {name}': 'Ability · {name}',
  'Способность — это не атака: она работает постоянно или по условию и не требует энергии.':
    'An Ability is not an attack: it works all the time or under certain conditions, and it needs no Energy.',

  'Атака · {name}': 'Attack · {name}',
  'эффект': 'effect',
  'Стоимость: {cost}. Цветные кружки требуют энергию именно этого типа, серый (звезда) подходит любой.':
    'Cost: {cost}. Colored orbs require Energy of exactly that type; a gray one (star) accepts any Energy.',

  'нет': 'none',
  'Против покемонов типа «{type}» эта карта страдает сильнее: урон умножается на {n}.':
    'This card takes extra damage from {type}-type Pokémon: the damage is multiplied by {n}.',
  'Против покемонов типа «{type}» эта карта страдает сильнее: к урону добавляется {n}.':
    'This card takes extra damage from {type}-type Pokémon: the damage is increased by {n}.',
  'У этой карты нет слабости: ни один тип не бьёт её сильнее обычного.':
    'This card has no Weakness: no type hits it harder than usual.',

  'Сопротивление': 'Resistance',
  'Против покемонов типа «{type}» урон уменьшается на {n}. Это защитный бонус, обратный слабости.':
    'Against {type}-type Pokémon, damage is reduced by {n}. This is a defensive bonus, the opposite of Weakness.',
  'Сопротивления нет: все типы бьют эту карту в полную силу.':
    'There is no Resistance: every type hits this card at full strength.',
  'Сопротивление показывает, чьи приёмы покемон хорошо переносит или умеет гасить.':
    'Resistance shows whose attacks the Pokémon can take well or shrug off.',
  'Такое бывает у большинства карт, это нормально.': 'Most cards have none, and that is perfectly normal.',

  'Цена отступления': 'Retreat Cost',
  'энергия|энергии|энергий': 'Energy|Energy',
  'Чтобы заменить покемона на скамье, нужно сбросить {n} энергии с него.':
    'To switch this Pokémon with one on your Bench, you must discard {n} Energy attached to it.',
  'Это дорого: отступать невыгодно, покемон обычно остаётся до конца.':
    'That is expensive: retreating is a poor deal, so the Pokémon usually stays put to the end.',
  'Цена умеренная.': 'The cost is moderate.',
  'Отступать можно бесплатно: такой покемон лёгкий и ловкий.':
    'You can retreat for free: this Pokémon is light and agile.',
  'Серые кружки — любая энергия. Чем тяжелее покемон, тем дороже его оттаскивать с поля.':
    'Gray orbs mean any Energy. The heavier the Pokémon, the more it costs to drag it off the field.',

  'Правило {suffix}': '{suffix} rule',
  'Правило карты {suffix}': '{suffix} card rule',
  'приз|приза|призов': 'Prize card|Prize cards',
  'Призовые карты — это 6 карт, отложенных в начале игры. Кто первым заберёт все свои призы, тот победил.':
    'Prize cards are the 6 cards set aside at the start of the game. Whoever takes all of their Prize cards first wins.',

  'Значок рядом с номером показывает редкость, а блеск на рисунке — отдельный эффект «фольги». Сейчас данные тестовые.':
    'The symbol next to the number shows the rarity, while the shine on the art is a separate “foil” effect. The data here is for testing.',
});
