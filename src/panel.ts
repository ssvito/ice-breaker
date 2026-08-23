import { canUpgrade, MAX_TIER, sellValue, towerStats, upgradeCost } from './tower.ts';
import type { Tower } from './tower.ts';

/**
 * Info panel for the selected tower. DOM rather than canvas for the same reason
 * the v1 toolbar is: real elements get native touch handling and disabled states
 * for free, and canvas hit-testing bought nothing when it was tried.
 */
export interface TowerPanel {
  update(tower: Tower | null, cycles: number): void;
}

export interface TowerPanelHandlers {
  onSell(tower: Tower): void;
  onUpgrade(tower: Tower): void;
  onOverclock(tower: Tower): void;
}

const ROW_COUNT = 3;

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

  const tierLine = document.createElement('div');
  tierLine.className = 'panel-tier';
  root.appendChild(tierLine);

  const stats = document.createElement('div');
  stats.className = 'panel-stats';
  root.appendChild(stats);

  // Fixed rows built once and rewritten in place: rebuilding the DOM every frame
  // would throw away the buttons (and any in-flight tap) that later steps add here.
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

  return {
    update(tower: Tower | null, cycles: number): void {
      current = tower;
      root.hidden = tower === null;
      if (!tower) return;

      const cost = upgradeCost(tower);
      const next = canUpgrade(tower) ? towerStats(tower.kind, tower.tier + 1) : null;

      title.textContent = towerStats(tower.kind).name;
      tierLine.textContent = `TIER ${tower.tier}/${MAX_TIER}`;
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
        setRow(2, '', '');
        return;
      }

      setRow(0, 'DAMAGE', String(tower.damage), next ? String(next.damage) : '');
      setRow(1, 'RANGE', tower.range.toFixed(1), next ? next.range.toFixed(1) : '');
      setRow(2, 'RATE', rateText(tower.fireIntervalMs), next ? rateText(next.fireIntervalMs) : '');
    },
  };
}
