function snapshot(tabs, active, split, groups) {
  const regular = tabs.filter((t) => !t.private);
  return {
    version: 1,
    tabs: regular.map((t) => ({
      id: t.id,
      url: /^https?:\/\//.test(t.url) ? t.url : "",
      title: t.title,
      group: t.group || "",
      volume: t.volume ?? 1,
      muted: !!t.muted,
    })),
    active: regular.some((t) => t.id === active) ? active : regular.at(-1)?.id,
    split: split.filter((id) => regular.some((t) => t.id === id)),
    groups,
  };
}
function paneBounds(ids, width, height) {
  const count = ids.length,
    columns = count <= 3 ? count : Math.ceil(Math.sqrt(count)),
    rows = Math.ceil(count / columns);
  if (!count) return [];
  const gap = 6,
    area = height - 110,
    cellW = (width - gap * (columns + 1)) / columns,
    cellH = (area - gap * (rows + 1)) / rows;
  return ids.map((id, i) => ({
    id,
    x: Math.round(gap + (i % columns) * (cellW + gap)),
    y: Math.round(58 + gap + Math.floor(i / columns) * (cellH + gap)),
    width: Math.floor(cellW),
    height: Math.floor(cellH),
  }));
}
module.exports = { snapshot, paneBounds };
