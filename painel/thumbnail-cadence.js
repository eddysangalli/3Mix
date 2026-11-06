// Thumbnail-only cadence. No production video settings are changed.
function thumbnailIntervalMs(numerator, denominator, skipEvery) {
  if (!Number.isInteger(numerator) || numerator <= 0 || !Number.isInteger(denominator) || denominator <= 0) throw new Error('Invalid video rate');
  if (!Number.isInteger(skipEvery) || (skipEvery !== 0 && skipEvery < 2) || skipEvery > 120) throw new Error('Invalid thumbnail skip');
  return 1000 * denominator / numerator * (skipEvery === 0 ? 1 : skipEvery / (skipEvery - 1));
}
// One outstanding screenshot; choose oldest visible input to prevent starvation.
function nextThumbnail(names, last, now, interval) {
  let selected = null, oldest = Infinity;
  for (const name of new Set(names)) {
    const at = last.get(name) ?? -Infinity;
    if (now - at >= interval && (selected === null || at < oldest)) { selected = name; oldest = at; }
  }
  return selected;
}

window.ThreeMixThumbnailCadence = { thumbnailIntervalMs, nextThumbnail };
