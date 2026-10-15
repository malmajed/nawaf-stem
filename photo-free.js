// A projection for transport/rendering; original local and server records stay intact.
function withoutPhotos(value) {
  if (Array.isArray(value)) return value.filter(x => !x || x.type !== 'photo').map(withoutPhotos);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.keys(value).forEach(key => {
    if (!['photo', 'photos', 'thumb', 'img'].includes(key)) result[key] = withoutPhotos(value[key]);
  });
  return result;
}

function preserveStoredPhotos(previous, incoming) {
  const next = withoutPhotos(incoming);
  if (previous.photos) next.photos = previous.photos;
  if (next.sets && previous.sets) next.sets.forEach(set => {
    const old = previous.sets.find(x => x.id === set.id);
    if (old && old.img) set.img = old.img;
  });
  const history = (previous.log || []).filter(x => x.type === 'photo');
  if (history.length) next.log = (next.log || []).concat(history).sort((a, b) => a.t - b.t);
  return next;
}
