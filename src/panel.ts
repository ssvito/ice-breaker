import { canUpgrade, MAX_TIER, sellValue, towerStats, upgradeCost } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';
import { enemyStats, getSplitKinds, immuneTowerKind } from './enemy.ts';
import type { Enemy } from './enemy.ts';

/**
 * Stats readout, styled as a console the mainframe is printing to. Shows whatever
 * is selected - a placed tower or an enemy on the board - and with nothing selected
 * falls back to the tower about to be built. Both fallbacks exist for the same
 * reason: the game was withholding what its pieces do until you had paid, or died,
 * to find out, and a portfolio visitor gives it about thirty seconds.
 *
 * DOM rather than canvas for the same reason the v1 toolbar is: real elements get
 * native touch handling, focus, and disabled states for free.
 */
export type PanelTarget = { kind: 'tower'; tower: Tower } | { kind: 'enemy'; enemy: Enemy } | null;

export interface TowerPanel {
  update(target: PanelTarget, buildKind: TowerKind, cycles: number): void;
  setCollapsed(value: boolean): void;
  hide(): void;
}

export interface TowerPanelHandlers {
  onSell(tower: Tower): void;
  onUpgrade(tower: Tower): void;
  onOverclock(tower: Tower): void;
}

// Attack towers fill three (damage, range, rate) and build mode adds the placement rule.
const STAT_COUNT = 4;

function slowText(multiplier: number): string {
  return `${Math.round((1 - multiplier) * 100)}%`;
}

function rateText(fireIntervalMs: number): string {
  return `${(1000 / fireIntervalMs).toFixed(1)}/s`;
}

export function createTowerPanel(handlers: TowerPanelHandlers, dock: HTMLElement): TowerPanel {
  const root = document.createElement('div');
  root.className = 'panel';
  root.hidden = true;

  // The whole header bar is the collapse control: a 44px tap target costs nothing
  // here, where a small [-] in the corner would be the one thing on screen that
  // needs a precise tap.
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'panel-head';

  const title = document.createElement('span');
  title.className = 'panel-title';
  head.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'panel-meta';
  head.appendChild(meta);

  const caret = document.createElement('span');
  caret.className = 'panel-caret';
  head.appendChild(caret);
  root.appendChild(head);

  const body = document.createElement('div');
  body.className = 'panel-body';
  root.appendChild(body);

  const statList = document.createElement('div');
  statList.className = 'panel-stats';
  body.appendChild(statList);

  // Fixed cells built once and rewritten in place: rebuilding the DOM every frame
  // would throw away the buttons, and any tap in flight on them.
  const cells = Array.from({ length: STAT_COUNT }, () => {
    const cell = document.createElement('div');
    cell.className = 'stat';
    const label = document.createElement('span');
    label.className = 'stat-label';
    const value = document.createElement('span');
    value.className = 'stat-value';
    const next = document.createElement('span');
    next.className = 'stat-next';
    cell.append(label, value, next);
    statList.appendChild(cell);
    return { cell, label, value, next };
  });

  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  body.appendChild(actions);

  // The panel acts on whatever it is currently showing, so a button pressed after
  // the selection moved can't operate on a stale tower.
  let current: Tower | null = null;
  let collapsed = false;

  function applyCollapsed(): void {
    body.hidden = collapsed;
    caret.textContent = collapsed ? '[+]' : '[-]';
    head.setAttribute('aria-expanded', String(!collapsed));
  }

  head.addEventListener('click', () => {
    collapsed = !collapsed;
    applyCollapsed();
  });
  applyCollapsed();

  const upgradeButton = document.createElement('button');
  upgradeButton.type = 'button';
  upgradeButton.innerHTML = '<span>UP</span><span></span>';
  upgradeButton.addEventListener('click', () => {
    if (current) handlers.onUpgrade(current);
  });
  actions.appendChild(upgradeButton);

  const overclockButton = document.createElement('button');
  overclockButton.type = 'button';
  overclockButton.innerHTML = '<span>OC</span><span>Q</span>';
  overclockButton.addEventListener('click', () => {
    if (current) handlers.onOverclock(current);
  });
  actions.appendChild(overclockButton);

  const sellButton = document.createElement('button');
  sellButton.type = 'button';
  sellButton.innerHTML = '<span>SELL</span><span></span>';
  sellButton.addEventListener('click', () => {
    if (current) handlers.onSell(current);
  });
  actions.appendChild(sellButton);

  dock.prepend(root);

  function setStat(index: number, label: string, value: string, next = ''): void {
    const slot = cells[index];
    slot.label.textContent = label;
    slot.value.textContent = value;
    // The next tier's value trails the current one so the upgrade price has
    // something concrete to argue against.
    slot.next.textContent = next === '' ? '' : `> ${next}`;
    slot.cell.hidden = label === '';
  }

  function clearStatsFrom(index: number): void {
    for (let i = index; i < STAT_COUNT; i++) setStat(i, '', '');
  }

  function renderSelected(tower: Tower, cycles: number): void {
    const cost = upgradeCost(tower);
    const next = canUpgrade(tower) ? towerStats(tower.kind, tower.tier + 1) : null;

    title.textContent = towerStats(tower.kind).name;
    meta.textContent = `TIER ${tower.tier}/${MAX_TIER}`;
    meta.classList.remove('panel-short');

    actions.hidden = false;
    sellButton.lastElementChild!.textContent = `+${sellValue(tower)}`;
    upgradeButton.firstElementChild!.textContent = next ? 'UP' : 'MAX';
    upgradeButton.lastElementChild!.textContent = cost === null ? '' : String(cost);
    upgradeButton.disabled = cost === null || cycles < cost;
    // Aura towers have no Overclock at all, so the button is absent rather than
    // permanently greyed out.
    overclockButton.hidden = tower.overclock === undefined;
    overclockButton.disabled = tower.overclock?.state !== 'idle';
    overclockButton.classList.toggle('armed', tower.overclock?.state === 'boosted');

    if (tower.slowMultiplier !== undefined) {
      // Auras have no damage or fire rate; show the slow as the cut it applies.
      setStat(0, 'SLOW', slowText(tower.slowMultiplier), next ? slowText(next.slowMultiplier!) : '');
      setStat(1, 'RANGE', tower.range.toFixed(1), next ? next.range.toFixed(1) : '');
      clearStatsFrom(2);
      return;
    }

    setStat(0, 'DAMAGE', String(tower.damage), next ? String(next.damage) : '');
    setStat(1, 'RANGE', tower.range.toFixed(1), next ? next.range.toFixed(1) : '');
    setStat(2, 'RATE', rateText(tower.fireIntervalMs), next ? rateText(next.fireIntervalMs) : '');
    clearStatsFrom(3);
  }

  function renderBuild(kind: TowerKind, cycles: number): void {
    const base = towerStats(kind);

    title.textContent = base.name;
    meta.textContent = `COST ${base.cost}`;
    meta.classList.toggle('panel-short', cycles < base.cost);

    // Nothing to act on yet - a tower is built by tapping the board.
    actions.hidden = true;

    // Only the exception earns a line. Three of four towers go off-path, so saying
    // so on all of them is noise that buries the one rule worth reading: Honeypot
    // is on-path only, otherwise discoverable just by getting an unexplained red tile.
    const onPathOnly = base.placement === 'onPath';

    if (base.slowMultiplier !== undefined) {
      setStat(0, 'SLOW', slowText(base.slowMultiplier));
      setStat(1, 'RANGE', base.range.toFixed(1));
      if (onPathOnly) setStat(2, 'PLACE', 'ON PATH');
      clearStatsFrom(onPathOnly ? 3 : 2);
      return;
    }

    setStat(0, 'DAMAGE', String(base.damage));
    setStat(1, 'RANGE', base.range.toFixed(1));
    setStat(2, 'RATE', rateText(base.fireIntervalMs));
    if (onPathOnly) setStat(3, 'PLACE', 'ON PATH');
    clearStatsFrom(onPathOnly ? 4 : 3);
  }

  function renderEnemy(enemy: Enemy): void {
    const stats = enemyStats(enemy.kind);
    const immune = immuneTowerKind(enemy.kind);
    const splits = getSplitKinds(enemy.kind);

    title.textContent = stats.name;
    // HP lives in the header so it stays readable with the console collapsed - it is
    // the one number that changes while you watch.
    meta.textContent = `HP ${enemy.hp}/${enemy.maxHp}`;
    meta.classList.toggle('panel-short', enemy.hp <= enemy.maxHp / 3);

    // Nothing to do to an enemy but shoot it, and that is the towers' job.
    actions.hidden = true;

    setStat(0, 'SPEED', enemy.speed.toFixed(1));
    setStat(1, 'BOUNTY', String(enemy.reward));
    let row = 2;
    if (immune) setStat(row++, 'IMMUNE', towerStats(immune).name);
    if (splits) setStat(row++, 'SPLITS', `${splits.length}x ${enemyStats(splits[0]).name}`);
    clearStatsFrom(row);
  }

  // update() runs every frame off the render loop. Everything it writes is derived
  // from these few values, so a signature check keeps a still panel from churning
  // a dozen text nodes 60 times a second on the low-end phones the renderer worries about.
  let signature = '';

  return {
    update(target: PanelTarget, buildKind: TowerKind, cycles: number): void {
      const tower = target?.kind === 'tower' ? target.tower : null;
      current = tower;

      // Cycles enter the stamp as a yes/no against the price, not as a number: all
      // a balance decides is whether one thing is affordable, so every balance on
      // the same side of that price is the same panel and shouldn't redraw it.
      let stamp: string;
      if (target?.kind === 'tower') {
        const cost = upgradeCost(target.tower);
        stamp = [
          'tower',
          target.tower.x,
          target.tower.y,
          target.tower.tier,
          target.tower.invested,
          target.tower.overclock?.state ?? '-',
          cost !== null && cycles >= cost ? 1 : 0,
        ].join('|');
      } else if (target?.kind === 'enemy') {
        // Kind and HP fully determine what an enemy panel shows, and unlike the tower
        // panel there is no button here acting on the thing, so two enemies that read
        // the same really are the same panel.
        stamp = ['enemy', target.enemy.kind, target.enemy.hp].join('|');
      } else {
        stamp = ['build', buildKind, cycles >= towerStats(buildKind).cost ? 1 : 0].join('|');
      }
      if (stamp === signature) return;
      signature = stamp;

      root.hidden = false;
      if (target?.kind === 'tower') renderSelected(target.tower, cycles);
      else if (target?.kind === 'enemy') renderEnemy(target.enemy);
      else renderBuild(buildKind, cycles);
    },

    setCollapsed(value: boolean): void {
      if (collapsed === value) return;
      collapsed = value;
      applyCollapsed();
    },

    hide(): void {
      root.hidden = true;
      // Force a redraw when the panel comes back: the signature it was last showing
      // may no longer describe anything. Collapsed state survives on purpose - it is
      // the player's preference, not part of what is being displayed.
      signature = '';
    },
  };
}
