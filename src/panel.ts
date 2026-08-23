import { canUpgrade, MAX_TIER, sellValue, towerStats, upgradeCost } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';

/**
 * Stats panel. Shows the selected tower when there is one, and otherwise the tower
 * about to be built - the four kinds are opaque until you have paid for one, and a
 * portfolio visitor gives the game about thirty seconds to explain itself.
 *
 * DOM rather than canvas for the same reason the v1 toolbar is: real elements get
 * native touch handling and disabled states for free, and canvas hit-testing bought
 * nothing when it was tried.
 */
export interface TowerPanel {
  update(tower: Tower | null, buildKind: TowerKind, cycles: number): void;
  hide(): void;
}

export interface TowerPanelHandlers {
  onSell(tower: Tower): void;
  onUpgrade(tower: Tower): void;
  onOverclock(tower: Tower): void;
}

// Attack towers fill three (damage, range, rate) and build mode adds the placement rule.
const ROW_COUNT = 4;

function slowText(multiplier: number): string {
  return `${Math.round((1 - multiplier) * 100)}%`;
}

function rateText(fireIntervalMs: number): string {
  return `${(1000 / fireIntervalMs).toFixed(1)}/s`;
}

export function createTowerPanel(handlers: TowerPanelHandlers): TowerPanel {
  const root = document.createElement('div');
  root.className = 'panel';
  root.hidden = true;

  const title = document.createElement('div');
  title.className = 'panel-title';
  root.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'panel-subtitle';
  root.appendChild(subtitle);

  const stats = document.createElement('div');
  stats.className = 'panel-stats';
  root.appendChild(stats);

  // Fixed rows built once and rewritten in place: rebuilding the DOM every frame
  // would throw away the buttons, and any tap in flight on them.
  const rows = Array.from({ length: ROW_COUNT }, () => {
    const label = document.createElement('span');
    const value = document.createElement('span');
    const next = document.createElement('span');
    value.className = 'panel-value';
    next.className = 'panel-next';
    stats.append(label, value, next);
    return { label, value, next };
  });

  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  root.appendChild(actions);

  // The panel acts on whatever it is currently showing, so a button pressed after
  // the selection moved can't operate on a stale tower.
  let current: Tower | null = null;

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

  document.body.appendChild(root);

  function setRow(index: number, label: string, value: string, next = ''): void {
    const row = rows[index];
    row.label.textContent = label;
    row.value.textContent = value;
    // The next tier's value sits in its own column so the upgrade price has
    // something concrete to argue against.
    row.next.textContent = next === '' ? '' : `> ${next}`;
    row.label.hidden = label === '';
    row.value.hidden = label === '';
    row.next.hidden = label === '';
  }

  function clearRowsFrom(index: number): void {
    for (let i = index; i < ROW_COUNT; i++) setRow(i, '', '');
  }

  function renderSelected(tower: Tower, cycles: number): void {
    const cost = upgradeCost(tower);
    const next = canUpgrade(tower) ? towerStats(tower.kind, tower.tier + 1) : null;

    title.textContent = towerStats(tower.kind).name;
    subtitle.textContent = `TIER ${tower.tier}/${MAX_TIER}`;
    subtitle.classList.remove('panel-short');

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
      setRow(0, 'SLOW', slowText(tower.slowMultiplier), next ? slowText(next.slowMultiplier!) : '');
      setRow(1, 'RANGE', tower.range.toFixed(1), next ? next.range.toFixed(1) : '');
      clearRowsFrom(2);
      return;
    }

    setRow(0, 'DAMAGE', String(tower.damage), next ? String(next.damage) : '');
    setRow(1, 'RANGE', tower.range.toFixed(1), next ? next.range.toFixed(1) : '');
    setRow(2, 'RATE', rateText(tower.fireIntervalMs), next ? rateText(next.fireIntervalMs) : '');
    clearRowsFrom(3);
  }

  function renderBuild(kind: TowerKind, cycles: number): void {
    const base = towerStats(kind);

    title.textContent = base.name;
    subtitle.textContent = `COST ${base.cost}`;
    subtitle.classList.toggle('panel-short', cycles < base.cost);

    // Nothing to act on yet - a tower is built by tapping the board.
    actions.hidden = true;

    // The placement rule only shows here. Honeypot being on-path only is otherwise
    // discoverable just by trying to place it and getting a red tile.
    const placement = base.placement === 'onPath' ? 'ON PATH' : 'OFF PATH';

    if (base.slowMultiplier !== undefined) {
      setRow(0, 'SLOW', slowText(base.slowMultiplier));
      setRow(1, 'RANGE', base.range.toFixed(1));
      setRow(2, 'PLACE', placement);
      clearRowsFrom(3);
      return;
    }

    setRow(0, 'DAMAGE', String(base.damage));
    setRow(1, 'RANGE', base.range.toFixed(1));
    setRow(2, 'RATE', rateText(base.fireIntervalMs));
    setRow(3, 'PLACE', placement);
  }

  // update() runs every frame off the render loop. Everything it writes is derived
  // from these few values, so a signature check keeps a still panel from churning
  // a dozen text nodes 60 times a second on the low-end phones the renderer worries about.
  let signature = '';

  return {
    update(tower: Tower | null, buildKind: TowerKind, cycles: number): void {
      current = tower;

      // Cycles enter the stamp as a yes/no against the price, not as a number: all
      // a balance decides is whether one thing is affordable, so every balance on
      // the same side of that price is the same panel and shouldn't redraw it.
      let stamp: string;
      if (tower) {
        const cost = upgradeCost(tower);
        stamp = [
          tower.x,
          tower.y,
          tower.tier,
          tower.invested,
          tower.overclock?.state ?? '-',
          cost !== null && cycles >= cost ? 1 : 0,
        ].join('|');
      } else {
        stamp = ['build', buildKind, cycles >= towerStats(buildKind).cost ? 1 : 0].join('|');
      }
      if (stamp === signature) return;
      signature = stamp;

      root.hidden = false;
      if (tower) renderSelected(tower, cycles);
      else renderBuild(buildKind, cycles);
    },

    hide(): void {
      root.hidden = true;
      // Force a redraw when the panel comes back: the signature it was last showing
      // may no longer describe anything.
      signature = '';
    },
  };
}
