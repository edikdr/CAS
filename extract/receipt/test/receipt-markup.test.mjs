// Runs receipt.js + our overrides in a bare Node VM (no browser) and checks the generated markup.
// node extract/receipt/test/receipt-markup.test.mjs   (run from the kit root)
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const R = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const J = p => JSON.parse(fs.readFileSync(new URL('../../../data/' + p, import.meta.url), 'utf8'));
const win = { addEventListener() {}, matchMedia: () => ({ matches: false }), requestIdleCallback: null };
const ctx = vm.createContext({ window: win, document: { fonts: null, getElementById: () => null, querySelectorAll: () => [] }, setTimeout, clearTimeout, console });
for (const f of ['../js/receipt-deps.js', '../js/receipt.js', '../js/sunniva-receipts.js']) vm.runInContext(R(f), ctx, { filename: f });
const albums = vm.runInContext('buildSunnivaReceipts', ctx)(J('tracks.json'), J('releases.json'), J('receipts.json'));
const counts = Object.fromEntries(albums.map(a => [a.id, a.tracks.length]));
assert.deepEqual(counts, { album: 17, singles: 7, demos: 8, appearances: 1 });
const markup = vm.runInContext('receiptMarkup', ctx);
for (const a of albums) {
  const html = markup(a);
  assert.equal((html.match(/class="rc-row"/g) || []).length, a.tracks.length, a.id + ' rows');
  assert.ok(!/arctic|monkeys|producers|label:|studio:/i.test(html), a.id + ' has AM wording');
  assert.ok(/TOTAL LENGTH/.test(html));
}
const singles = markup(albums.find(a => a.id === 'singles'));
assert.equal((singles.match(/ \*<\/span>/g) || []).length, 4, 'four singles are also on the album');
assert.ok(/\* ALSO ON THE ALBUM/.test(singles));
console.log('receipt markup OK:', JSON.stringify(counts));
for (const a of albums) console.log(' ', a.id.padEnd(12), a.tracks.length, 'rows, runtime', vm.runInContext('albumRuntime', ctx)(a), ', date', a.released);
