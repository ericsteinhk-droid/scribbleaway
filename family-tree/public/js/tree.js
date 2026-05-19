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

    // Build parent→children and child→parents maps
    const childrenOf = {};
    const parentsOf  = {};
    const couples    = {}; // id → spouse id (inferred from shared children)

    people.forEach(p => {
      childrenOf[p.id] = childrenOf[p.id] || [];
      parentsOf[p.id]  = parentsOf[p.id]  || [];
    });

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

    // Assign generation via BFS from roots
    const gen = {};
    const roots = people.filter(p => parentsOf[p.id].length === 0);
    const queue = roots.map(p => ({ id: p.id, g: 0 }));
    const visited = new Set();

    while (queue.length) {
      const { id, g } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      if (gen[id] === undefined || g > gen[id]) gen[id] = g;
      childrenOf[id].forEach(cid => {
        if (!visited.has(cid)) queue.push({ id: cid, g: g + 1 });
      });
    }
    // Catch disconnected nodes
    people.forEach(p => { if (gen[p.id] === undefined) gen[p.id] = 0; });

    // Group by generation
    const byGen = {};
    people.forEach(p => {
      const g = gen[p.id];
      (byGen[g] = byGen[g] || []).push(p);
    });

    // Sort generations
    const genNums = Object.keys(byGen).map(Number).sort((a, b) => a - b);

    // Build couple units per generation
    const positions = {};
    const coupleLines = [];
    const childLines  = [];

    genNums.forEach((g, rowIdx) => {
      const row = byGen[g];
      const placed = new Set();
      const units  = []; // [{members: [p,...], coupleKey}]

      row.forEach(p => {
        if (placed.has(p.id)) return;
        placed.add(p.id);
        const spouseId = couples[p.id];
        const spouse = spouseId ? byId[spouseId] : null;
        if (spouse && row.includes(spouse) && !placed.has(spouse.id)) {
          placed.add(spouse.id);
          units.push({ members: [p, spouse] });
        } else {
          units.push({ members: [p] });
        }
      });

      // Total row width
      const unitWidths = units.map(u => u.members.length * CARD.w + (u.members.length - 1) * GAP.spouse);
      const rowW = unitWidths.reduce((s, w) => s + w, 0) + (units.length - 1) * GAP.h;
      let x = -rowW / 2;
      const y = rowIdx * (CARD.h + GAP.v);

      units.forEach((unit, ui) => {
        const uw = unitWidths[ui];
        unit.members.forEach((p, mi) => {
          positions[p.id] = {
            x: x + mi * (CARD.w + GAP.spouse),
            y,
            cx: x + mi * (CARD.w + GAP.spouse) + CARD.w / 2,
            cy: y + CARD.h / 2,
            gen: g
          };
        });
        // Couple line midpoint
        if (unit.members.length === 2) {
          const p1 = positions[unit.members[0].id];
          const p2 = positions[unit.members[1].id];
          unit.midX = (p1.cx + p2.cx) / 2;
          unit.midY = p1.cy;
          coupleLines.push({ x1: p1.cx, y1: p1.cy, x2: p2.cx, y2: p2.cy });
        } else {
          unit.midX = positions[unit.members[0].id].cx;
          unit.midY = positions[unit.members[0].id].cy;
        }
        unit.bottomMidX = unit.midX;
        unit.bottomMidY = y + CARD.h;
        x += uw + GAP.h;
      });

      // Store units for link drawing
      byGen[g]._units = units;
    });

    // Draw parent → child lines
    genNums.forEach(g => {
      const units = (byGen[g] || [])._units || [];
      units.forEach(unit => {
        const allChildren = new Set();
        unit.members.forEach(p => childrenOf[p.id].forEach(cid => allChildren.add(cid)));
        if (!allChildren.size) return;

        const childPos = [...allChildren].filter(cid => positions[cid]).map(cid => positions[cid]);
        if (!childPos.length) return;

        const childMinX = Math.min(...childPos.map(p => p.cx));
        const childMaxX = Math.max(...childPos.map(p => p.cx));
        const childY    = childPos[0].y; // all on same row

        const parentMidX = unit.bottomMidX;
        const parentBotY = unit.bottomMidY;
        const midY = (parentBotY + childY) / 2;

        childLines.push({
          parentX: parentMidX, parentY: parentBotY,
          childMinX, childMaxX, childY, midY,
          childXs: childPos.map(p => p.cx)
        });
      });
    });

    return { positions, coupleLines, childLines };
  }

  _drawLinks(coupleLines, childLines) {
    const linkG = this.g.append('g').attr('class', 'links');

    // Couple lines (horizontal, dashed)
    linkG.selectAll('.couple-line')
      .data(coupleLines)
      .join('line')
      .attr('class', 'couple-line')
      .attr('x1', d => d.x1).attr('y1', d => d.y1)
      .attr('x2', d => d.x2).attr('y2', d => d.y2);

    // Parent–child connections
    childLines.forEach(d => {
      // Vertical drop from parent
      linkG.append('line').attr('class', 'child-vline')
        .attr('x1', d.parentX).attr('y1', d.parentY)
        .attr('x2', d.parentX).attr('y2', d.midY);

      // Horizontal bar across children
      if (d.childXs.length > 1) {
        linkG.append('line').attr('class', 'child-hline')
          .attr('x1', d.childMinX).attr('y1', d.midY)
          .attr('x2', d.childMaxX).attr('y2', d.midY);
      }

      // Drop to each child
      d.childXs.forEach(cx => {
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
