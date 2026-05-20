/* Family Tree SVG Renderer using D3 zoom/pan */

const CARD = { w: 160, h: 76, rx: 8 };
const GAP  = { h: 36, v: 90, spouse: 10 };

class FamilyTreeRenderer {
  constructor(svgEl, onNodeClick) {
    this.svg = d3.select(svgEl);
    this.onNodeClick = onNodeClick;
    this.people = [];
    this.positions = {};

    // Zoom behaviour
    this.zoom = d3.zoom().scaleExtent([0.15, 3]).on('zoom', (e) => {
      this.g.attr('transform', e.transform);
    });
    this.svg.call(this.zoom);

    // Single <g> that moves/scales
    this.g = this.svg.append('g').attr('class', 'tree-root');

    // Arrow markers for links
    const defs = this.svg.append('defs');
    defs.append('filter').attr('id', 'card-shadow')
      .append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 3)
      .attr('flood-color', '#00000030');
  }

  render(people) {
    this.people = people;
    this.g.selectAll('*').remove();

    if (!people.length) return;

    const { positions, coupleLines, childLines } = this._layout(people);
    this.positions = positions;

    this._drawLinks(coupleLines, childLines);
    this._drawCards(people, positions);
    this._centerView();
  }

  _layout(people) {
    const byId = {};
    people.forEach(p => byId[p.id] = p);

    const childrenOf = {}, parentsOf = {}, couples = {};
    people.forEach(p => { childrenOf[p.id] = []; parentsOf[p.id] = []; });
    people.forEach(p => {
      if (p.father_id && byId[p.father_id]) {
        childrenOf[p.father_id].push(p.id);
        parentsOf[p.id].push(p.father_id);
      }
      if (p.mother_id && byId[p.mother_id]) {
        childrenOf[p.mother_id].push(p.id);
        parentsOf[p.id].push(p.mother_id);
      }
      if (p.father_id && p.mother_id && byId[p.father_id] && byId[p.mother_id]) {
        couples[p.father_id] = p.mother_id;
        couples[p.mother_id] = p.father_id;
      }
    });

    // ── Generation assignment (max-depth BFS — no visited set so deeper paths win) ──
    const gen = {};
    const roots = people.filter(p => parentsOf[p.id].length === 0);
    const queue = roots.map(p => ({ id: p.id, g: 0 }));
    while (queue.length) {
      const { id, g } = queue.shift();
      if (gen[id] !== undefined && gen[id] >= g) continue; // already at same/deeper level
      gen[id] = g;
      childrenOf[id].forEach(cid => queue.push({ id: cid, g: g + 1 }));
    }
    people.forEach(p => { if (gen[p.id] === undefined) gen[p.id] = 0; });

    // ── Group into generations, sort siblings together ──
    const byGen = {};
    people.forEach(p => { const g = gen[p.id]; (byGen[g] = byGen[g] || []).push(p); });
    const genNums = Object.keys(byGen).map(Number).sort((a, b) => a - b);

    genNums.forEach(g => {
      byGen[g].sort((a, b) => {
        const aKey = [a.father_id || 0, a.mother_id || 0].sort().join('-');
        const bKey = [b.father_id || 0, b.mother_id || 0].sort().join('-');
        return aKey.localeCompare(bKey);
      });
    });

    // ── Build couple/single units per generation ──
    const genUnits = {};
    genNums.forEach(g => {
      const placed = new Set();
      genUnits[g] = [];
      byGen[g].forEach(p => {
        if (placed.has(p.id)) return;
        placed.add(p.id);
        const spouseId = couples[p.id];
        const members = [p];
        if (spouseId && byId[spouseId] && byGen[g].find(q => q.id === spouseId) && !placed.has(spouseId)) {
          placed.add(spouseId);
          members.push(byId[spouseId]);
        }
        const allChildren = new Set();
        members.forEach(m => childrenOf[m.id].forEach(cid => allChildren.add(cid)));
        genUnits[g].push({ members, children: [...allChildren] });
      });
    });

    const unitW = u => u.members.length * CARD.w + (u.members.length - 1) * GAP.spouse;
    const rowY  = g => genNums.indexOf(g) * (CARD.h + GAP.v);

    // ── Initial left-to-right layout ──
    const positions = {};
    const unitMid   = new Map(); // unit → current midX

    genNums.forEach(g => {
      const y = rowY(g);
      let x = 0;
      genUnits[g].forEach(unit => {
        const w = unitW(unit);
        unitMid.set(unit, x + w / 2);
        unit.members.forEach((p, i) => {
          positions[p.id] = { x: x + i * (CARD.w + GAP.spouse), y, cx: x + i * (CARD.w + GAP.spouse) + CARD.w / 2 };
        });
        x += w + GAP.h;
      });
    });

    // ── Bottom-up adjustment: center each unit above its children ──
    [...genNums].reverse().forEach(g => {
      const units = genUnits[g];

      units.forEach(unit => {
        const cxs = unit.children.filter(cid => positions[cid]).map(cid => positions[cid].cx);
        if (!cxs.length) return;
        const targetMid = cxs.reduce((s, c) => s + c, 0) / cxs.length;
        const shift = targetMid - unitMid.get(unit);
        if (Math.abs(shift) < 0.5) return;
        unit.members.forEach(p => { positions[p.id].x += shift; positions[p.id].cx += shift; });
        unitMid.set(unit, unitMid.get(unit) + shift);
      });

      // Resolve overlaps left→right
      const sorted = [...units].sort((a, b) => positions[a.members[0].id].x - positions[b.members[0].id].x);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], curr = sorted[i];
        const minX = positions[prev.members[prev.members.length - 1].id].x + CARD.w + GAP.h;
        const currX = positions[curr.members[0].id].x;
        if (currX < minX) {
          const shift = minX - currX;
          curr.members.forEach(p => { positions[p.id].x += shift; positions[p.id].cx += shift; });
          unitMid.set(curr, unitMid.get(curr) + shift);
        }
      }
    });

    // ── Build line data ──
    const coupleLines = [], childLines = [];

    genNums.forEach(g => {
      const y = rowY(g);
      genUnits[g].forEach(unit => {
        const mid = unitMid.get(unit);

        if (unit.members.length === 2) {
          const cx1 = positions[unit.members[0].id].cx;
          const cx2 = positions[unit.members[1].id].cx;
          coupleLines.push({ x1: cx1, y1: y + CARD.h / 2, x2: cx2, y2: y + CARD.h / 2 });
        }

        const validChildren = unit.children.filter(cid => positions[cid]);
        if (!validChildren.length) return;

        // Group children by their row in case generations differ
        const byRow = {};
        validChildren.forEach(cid => {
          const cy = positions[cid].y;
          (byRow[cy] = byRow[cy] || []).push(positions[cid].cx);
        });

        Object.entries(byRow).forEach(([childYStr, childCxs]) => {
          const childY = parseFloat(childYStr);
          const midY   = (y + CARD.h + childY) / 2;
          // Horizontal bar always spans from parent drop to outermost child
          const hMin   = Math.min(mid, ...childCxs);
          const hMax   = Math.max(mid, ...childCxs);
          childLines.push({ parentX: mid, parentY: y + CARD.h, hMin, hMax, midY, childY, childCxs });
        });
      });
    });

    return { positions, coupleLines, childLines };
  }

  _drawLinks(coupleLines, childLines) {
    const linkG = this.g.append('g').attr('class', 'links');

    linkG.selectAll('.couple-line')
      .data(coupleLines).join('line')
      .attr('class', 'couple-line')
      .attr('x1', d => d.x1).attr('y1', d => d.y1)
      .attr('x2', d => d.x2).attr('y2', d => d.y2);

    childLines.forEach(d => {
      // Drop from parent midpoint to horizontal junction
      linkG.append('line').attr('class', 'child-vline')
        .attr('x1', d.parentX).attr('y1', d.parentY)
        .attr('x2', d.parentX).attr('y2', d.midY);

      // Horizontal bar — always drawn, always includes parentX and all children
      linkG.append('line').attr('class', 'child-hline')
        .attr('x1', d.hMin).attr('y1', d.midY)
        .attr('x2', d.hMax).attr('y2', d.midY);

      // Drop from junction to each child
      d.childCxs.forEach(cx => {
        linkG.append('line').attr('class', 'child-vline')
          .attr('x1', cx).attr('y1', d.midY)
          .attr('x2', cx).attr('y2', d.childY);
      });
    });
  }

  _drawCards(people, positions) {
    const lang = currentLang;
    const cardG = this.g.append('g').attr('class', 'cards');

    const node = cardG.selectAll('.person-node')
      .data(people.filter(p => positions[p.id]))
      .join('g')
      .attr('class', d => `person-node gender-${d.gender}`)
      .attr('transform', d => {
        const pos = positions[d.id];
        return `translate(${pos.x},${pos.y})`;
      })
      .style('cursor', 'pointer')
      .on('click', (e, d) => { e.stopPropagation(); this.onNodeClick && this.onNodeClick(d); });

    // Card background
    node.append('rect')
      .attr('class', 'card-bg')
      .attr('width', CARD.w).attr('height', CARD.h)
      .attr('rx', CARD.rx).attr('ry', CARD.rx)
      .attr('filter', 'url(#card-shadow)');

    // Gender accent bar on left
    node.append('rect')
      .attr('class', 'card-accent')
      .attr('width', 5).attr('height', CARD.h)
      .attr('rx', CARD.rx).attr('ry', CARD.rx);

    // Name
    node.append('text')
      .attr('class', 'card-name')
      .attr('x', CARD.w / 2).attr('y', 28)
      .attr('text-anchor', 'middle')
      .text(d => d.first_name);

    node.append('text')
      .attr('class', 'card-surname')
      .attr('x', CARD.w / 2).attr('y', 44)
      .attr('text-anchor', 'middle')
      .text(d => d.last_name.toUpperCase());

    // Dates line
    node.append('text')
      .attr('class', 'card-dates')
      .attr('x', CARD.w / 2).attr('y', 62)
      .attr('text-anchor', 'middle')
      .text(d => {
        const b = d.birth_year ? `${t('born')} ${d.birth_year}` : '';
        const dd = d.death_year ? `${t('died')} ${d.death_year}` : (!d.birth_year ? '' : t('alive'));
        return [b, dd].filter(Boolean).join('  ·  ');
      });

    // Death overlay band
    node.filter(d => !!d.death_year)
      .append('rect')
      .attr('class', 'deceased-overlay')
      .attr('width', CARD.w).attr('height', CARD.h)
      .attr('rx', CARD.rx).attr('ry', CARD.rx);

    // Hover tooltip hint
    node.append('title').text(d => `${d.first_name} ${d.last_name}`);
  }

  _centerView() {
    const svgEl  = this.svg.node();
    const svgW   = svgEl.clientWidth  || 800;
    const svgH   = svgEl.clientHeight || 600;
    const gEl    = this.g.node();
    const bbox   = gEl.getBBox();

    if (!bbox.width) return;

    const scale  = Math.min(0.9, Math.min(svgW / (bbox.width + 80), svgH / (bbox.height + 80)));
    const tx     = svgW / 2 - scale * (bbox.x + bbox.width / 2);
    const ty     = 40 - scale * bbox.y;

    this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  zoomBy(factor) {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, factor);
  }

  resetView() {
    this._centerView();
  }
}
