import { canUpgrade, MAX_TIER, sellValue, towerStats, upgradeCost } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';
import { enemyStats, enemyTraits } from './enemy.ts';
import type { Enemy, EnemyTraits } from './enemy.ts';
import type { WavePreview } from './wave.ts';

/**
 * Stats readout, styled as a console the mainframe is printing to. Four modes on
 * one surface, in priority order: the selected tower, the selected enemy, the wave
 * being counted down to, and the tower about to be built. They all exist for the
 * same reason: the game was withholding what its pieces do until you had paid, or
 * died, to find out, and a portfolio visitor gives it about thirty seconds.
 *
 * DOM rather than canvas for the same reason the v1 toolbar is: real elements get
 * native touch handling, focus, and disabled states for free.
 */
export type PanelTarget = { kind: 'tower'; tower: Tower } | { kind: 'enemy'; enemy: Enemy } | null;

/**
 * One reader per trait in `EnemyTraits`, in the order the rows read. A reader returns
 * null for a kind that does not have its trait, and **the ordinary enemy earns no rows
 * at all** - same rule as the BREACH line above it, where a cost of 1 is what everything
 * costs and so is not worth printing.
 *
 * A table rather than a run of `if`s inside `renderEnemy`, because a behavior added to
 * `enemy.ts` should land in the console as one line in one place, next to the other
 * lines that do the same job, rather than as another branch threaded through the row
 * counter. The counter is what made the old shape fragile: every branch had to remember
 * to advance it.
 */
const TRAIT_ROWS: ((traits: EnemyTraits) => [label: string, value: string] | null)[] = [
  (traits) => (traits.immuneTo ? ['IMMUNE', towerStats(traits.immuneTo).name] : null),
  (traits) =>
    traits.splitsInto
      ? ['SPLITS', `${traits.splitsInto.length}x ${enemyStats(traits.splitsInto[0]).name}`]
      : null,
];

export interface TowerPanel {
  /** The console's root box. Exposed so its owner can measure it - the console is
   *  anchored by a rule that needs its height, and that height changes with every
   *  collapse and every one of its four modes. */
  element: HTMLElement;
  update(target: PanelTarget, buildKind: TowerKind | null, cycles: number, preview: WavePreview | null): void;
  setRun(paused: boolean, speed: number): void;
  setCollapsed(value: boolean): void;
  hide(): void;
}

export interface TowerPanelHandlers {
  onSell(tower: Tower): void;
  onUpgrade(tower: Tower): void;
  onOverclock(tower: Tower): void;
  onTogglePause(): void;
  onToggleSpeed(): void;
  onCallWave(): void;
}

// Four for a tower in build mode (damage, range, rate, placement); five because a
// wave preview can carry three kinds and the toughness line with them.
const STAT_COUNT = 5;

function slowText(multiplier: number): string {
  return `${Math.round((1 - multiplier) * 100)}%`;
}

function rateText(fireIntervalMs: number): string {
  return `${(1000 / fireIntervalMs).toFixed(1)}/s`;
}

export function createTowerPanel(handlers: TowerPanelHandlers, host: HTMLElement): TowerPanel {
  const root = document.createElement('div');
  root.className = 'panel';
  root.hidden = true;

  // The header is a bar of controls now: everything left of the run buttons is one
  // collapse target, because a small [-] in the corner would be the one thing on
  // screen needing a precise tap.
  const head = document.createElement('div');
  head.className = 'panel-head';

  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.className = 'panel-collapse';
  head.appendChild(collapseButton);

  const title = document.createElement('span');
  title.className = 'panel-title';
  collapseButton.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'panel-meta';
  collapseButton.appendChild(meta);

  const caret = document.createElement('span');
  caret.className = 'panel-caret';
  collapseButton.appendChild(caret);

  // Pause and speed live in the header, not the body, so they survive collapsing:
  // a paused game whose only way back is to expand a console first would be a bug
  // wearing a preference as a disguise. They belong to the console rather than the
  // build menu because they say something about the run, and the run is what the
  // console reads out.
  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.className = 'panel-run';
  pauseButton.addEventListener('click', () => handlers.onTogglePause());
  head.appendChild(pauseButton);

  const speedButton = document.createElement('button');
  speedButton.type = 'button';
  speedButton.className = 'panel-run';
  speedButton.addEventListener('click', () => handlers.onToggleSpeed());
  head.appendChild(speedButton);

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
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
  }

  collapseButton.addEventListener('click', () => {
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

  // Lives in the same row as UP/OC/SELL and is the only thing in it during a wave
  // preview: the actions row is "what can be done to the thing on screen", and the
  // thing on screen is a wave that has not arrived yet.
  const callButton = document.createElement('button');
  callButton.type = 'button';
  callButton.innerHTML = '<span>CALL</span><span></span>';
  callButton.addEventListener('click', () => handlers.onCallWave());
  actions.appendChild(callButton);

  const sellButton = document.createElement('button');
  sellButton.type = 'button';
  sellButton.innerHTML = '<span>SELL</span><span></span>';
  sellButton.addEventListener('click', () => {
    if (current) handlers.onSell(current);
  });
  actions.appendChild(sellButton);

  host.appendChild(root);

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
    callButton.hidden = true;
    sellButton.hidden = false;
    upgradeButton.hidden = false;
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
    const traits = enemyTraits(enemy.kind);

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
    // Only worth a row when it is not the ordinary 1: the boss costing the whole
    // core is a rule, and an unwritten rule is the thing the console exists to end.
    if (stats.coreDamage > 1) setStat(row++, 'BREACH', `${stats.coreDamage} HP`);
    for (const readTrait of TRAIT_ROWS) {
      const line = readTrait(traits);
      if (line) setStat(row++, line[0], line[1]);
    }
    clearStatsFrom(row);
  }

  function renderWave(preview: WavePreview): void {
    title.textContent = `WAVE ${preview.number}/${preview.total}`;
    // Seconds, not milliseconds: the console is a readout, not a stopwatch, and a
    // number changing sixty times a second is a number nobody reads.
    meta.textContent = preview.callable ? `IN ${Math.ceil(preview.countdownMs / 1000)}s` : 'ON BOARD';
    meta.classList.remove('panel-short');

    // The one thing there is to do to a wave that has not arrived: bring it
    // forward and get paid for the seconds nobody spends waiting. A wave already
    // walking the trace is a reading with nothing to decide, so the row goes.
    actions.hidden = !preview.callable;
    callButton.hidden = !preview.callable;
    callButton.lastElementChild!.textContent = `+${preview.earlyBonus}`;
    upgradeButton.hidden = true;
    overclockButton.hidden = true;
    sellButton.hidden = true;

    let row = 0;
    for (const entry of preview.composition) {
      if (row >= STAT_COUNT) break;
      setStat(row++, enemyStats(entry.kind).name, `x${entry.count}`);
    }
    // Same rule as the enemy panel's BREACH line: the ordinary case earns no row.
    if (preview.hpScale > 1 && row < STAT_COUNT) setStat(row++, 'HARDENED', `${preview.hpScale}x`);
    clearStatsFrom(row);
  }

  // Same argument as the stats signature below, on the two values that change least
  // often in the whole console.
  let runStamp = '';

  // update() runs every frame off the render loop. Everything it writes is derived
  // from these few values, so a signature check keeps a still panel from churning
  // a dozen text nodes 60 times a second on the low-end phones the renderer worries about.
  let signature = '';

  /** Off. The signature is cleared so whatever comes back redraws from scratch. */
  function hidePanel(): void {
    root.hidden = true;
    signature = '';
  }

  return {
    element: root,

    update(target: PanelTarget, buildKind: TowerKind | null, cycles: number, preview: WavePreview | null): void {
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
      } else if (preview) {
        // The countdown is the only thing here that moves, and it is read to the
        // second, so the panel redraws once a second instead of every frame.
        stamp = ['wave', preview.number, preview.callable ? Math.ceil(preview.countdownMs / 1000) : 'live'].join('|');
      } else if (buildKind) {
        stamp = ['build', buildKind, cycles >= towerStats(buildKind).cost ? 1 : 0].join('|');
      } else {
        // Nothing selected, nothing being built and no wave to read: there is no
        // console to show. In practice the wave always fills this, so it is a guard
        // rather than a fifth mode.
        hidePanel();
        return;
      }
      if (stamp === signature) return;
      signature = stamp;

      root.hidden = false;
      if (target?.kind === 'tower') renderSelected(target.tower, cycles);
      else if (target?.kind === 'enemy') renderEnemy(target.enemy);
      else if (preview) renderWave(preview);
      else if (buildKind) renderBuild(buildKind, cycles);
    },

    /**
     * The pause button shows the action, not the state - everyone reads a play
     * glyph as "start this" - while the speed button shows the state, because
     * "2x" is a reading and its alternative has no glyph. Both light amber when
     * they are the reason the run isn't behaving normally.
     */
    setRun(paused: boolean, speed: number): void {
      const stamp = `${paused}|${speed}`;
      if (stamp === runStamp) return;
      runStamp = stamp;

      pauseButton.textContent = paused ? '>' : '||';
      pauseButton.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      pauseButton.classList.toggle('armed', paused);

      speedButton.textContent = `${speed}x`;
      speedButton.setAttribute('aria-label', `Speed ${speed}x`);
      speedButton.classList.toggle('armed', speed > 1);
    },

    setCollapsed(value: boolean): void {
      if (collapsed === value) return;
      collapsed = value;
      applyCollapsed();
    },

    // Collapsed state survives hiding on purpose - it is the player's preference,
    // not part of what is being displayed.
    hide: hidePanel,
  };
}
