/* sunniva-receipts.js - NEW code (not from the AM archive).
   1) buildSunnivaReceipts(tracksJson, releasesJson, receiptsJson) -> array of "album" objects in the
      shape receipt.js expects: { id, title, short, year, released, type, tracks:[{name, duration, id, alsoOnAlbum}] }
   2) receiptMarkup(album) override with sunniva wording: no AM logo, no label/producer/studio lines
      (we do not have verified credits), no cover art, no lyrics. Load AFTER receipt.js so this version wins.
   Rows = number, title, duration. Nothing else on the face (see docs/CONTRACT.md section 3). */

function fmtDuration(ms) {
  const s = Math.round((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildSunnivaReceipts(tracksJson, releasesJson, receiptsJson) {
  const track = new Map(tracksJson.tracks.map(t => [t.id, t]));
  const release = new Map(releasesJson.releases.map(r => [r.id, r]));
  const dateOf = ids => ids.map(i => track.get(i).releaseDate).sort()[0];
  return receiptsJson.receipts.map(rc => {
    const rows = rc.trackIds.map(id => {
      const t = track.get(id);
      return { id: t.id, name: t.title, duration: fmtDuration(t.durationMs),
               credit: t.artistCredit, alsoOnAlbum: !!t.alsoOnAlbumTrackId,
               release: release.get(t.releaseId).title };
    });
    const released = rc.kind === 'album' ? release.get(track.get(rc.trackIds[0]).releaseId).releaseDate
                                          : dateOf(rc.trackIds);
    return { id: rc.id, title: rc.title, short: rc.title, kind: rc.kind,
             year: released.slice(0, 4), released, type: rc.kind, tracks: rows };
  });
}

/* override of receipt.js receiptMarkup */
function receiptMarkup(album) {
  const rows = album.tracks.map((t, i) => `
      <li class="rc-row" role="button" tabindex="0"
          data-track="${esc(t.name)}" data-track-id="${esc(t.id)}" data-album="${esc(album.id)}"
          aria-label="${esc(t.name)} - open track">
        <span class="rc-qty">${String(i + 1).padStart(2, '0')}</span>
        <span class="rc-item">${esc(t.name)}${t.alsoOnAlbum ? ' *' : ''}</span>
        <span class="rc-amt">${t.duration}</span>
      </li>`).join('');
  const hasStar = album.tracks.some(t => t.alsoOnAlbum);
  const collab = album.tracks.filter(t => t.credit && t.credit.toLowerCase() !== 'sunniva');
  return `
    <div class="rc-head">
      <div class="rc-logo" aria-label="sunniva">SUNNIVA</div>
      ${waveformSvg(album.id).replace('Arctic Monkeys waveform', 'waveform')}
    </div>

    <div class="rc-rule"></div>
    <div class="rc-cols"><span>QTY</span><span>ITEM</span><span>AMT</span></div>
    <div class="rc-rule dashed"></div>

    <ol class="rc-tracks">${rows}</ol>

    <div class="rc-rule dashed"></div>
    <div class="rc-totals">
      <div><span>TOTAL TRACKS</span><span>${album.tracks.length}</span></div>
      <div><span>TOTAL LENGTH</span><span>${albumRuntime(album)}</span></div>
    </div>
    <div class="rc-rule"></div>

    <div class="rc-meta">
      <div>${esc(album.id === 'singles' ? 'FIRST RELEASE' : 'DATE')}: ${esc(album.released)}</div>
      ${hasStar ? '<div>* ALSO ON THE ALBUM</div>' : ''}
      ${collab.length ? '<div>COLLABS CREDITED IN THE TRACK WINDOW</div>' : ''}
    </div>

    ${barcodeSvg(album.id)}
    <div class="rc-foot">${esc(album.title)}</div>
  `;
}
