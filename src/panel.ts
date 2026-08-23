import { towerStats } from './tower.ts';
import type { Tower } from './tower.ts';

/**
 * Info panel for the selected tower. DOM rather than canvas for the same reason
 * the v1 toolbar is: real elements get native touch handling and disabled states
 * for free, and canvas hit-testing bought nothing when it was tried.
 */
export interface TowerPanel {
  update(tower: Tower | null): void;
}

const ROW_COUNT = 3;

export function createTowerPanel(): TowerPanel {
  const root = document.createElement('div');
  root.className = 'panel';
  root.hidden = true;

  const title = document.createElement('div');
  title.className = 'panel-title';
  root.appendChild(title);

  const stats = document.createElement('div');
  stats.className = 'panel-stats';
  root.appendChild(stats);

  // Fixed rows built once and rewritten in place: rebuilding the DOM every frame
  // would throw away the buttons (and any in-flight tap) that later steps add here.
  const rows = Array.from({ length: ROW_COUNT }, () => {
    const label = document.createElement('span');
    const value = document.createElement('span');
    value.className = 'panel-value';
    stats.append(label, value);
    return { label, value };
  });

  document.body.appendChild(root);

  function setRow(index: number, label: string, value: string): void {
    rows[index].label.textContent = label;
    rows[index].value.textContent = value;
    rows[index].label.hidden = label === '';
    rows[index].value.hidden = label === '';
  }

  return {
    update(tower: Tower | null): void {
      root.hidden = tower === null;
      if (!tower) return;

      title.textContent = towerStats(tower.kind).name;

      if (tower.slowMultiplier !== undefined) {
        // Auras have no damage or fire rate; show the slow as the cut it applies.
        setRow(0, 'SLOW', `${Math.round((1 - tower.slowMultiplier) * 100)}%`);
        setRow(1, 'RANGE', tower.range.toFixed(1));
        setRow(2, '', '');
        return;
      }

      setRow(0, 'DAMAGE', String(tower.damage));
      setRow(1, 'RANGE', tower.range.toFixed(1));
      setRow(2, 'RATE', `${(1000 / tower.fireIntervalMs).toFixed(1)}/s`);
    },
  };
}
