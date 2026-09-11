import { APP_BUILT, APP_VERSION } from './version.ts';
import { canUpgrade, MAX_TIER, revealingTowerKinds, sellValue, towerStats, upgradeCost } from './tower.ts';
import type { Tower, TowerKind } from './tower.ts';
import { enemyStats, enemyTraits } from './enemy.ts';
import type { Enemy, EnemyTraits } from './enemy.ts';
import { countdownSeconds } from './wave.ts';
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
  // Reads as what the enemy is rather than as what it resists, same as the trait
  // itself: a player who has just watched their Scanner do nothing needs the word
  // for the rule, not a list of the towers it beats.
  (traits) => (traits.fixedMovement ? ['MOVEMENT', 'FIXED'] : null),
  (traits) => (traits.armor ? ['ARMOR', `-${traits.armor} PER HIT`] : null),
  // Labelled by what finds it rather than by what it beats, so it cannot be misread as
  // the IMMUNE row above, which names a tower for the opposite reason.
  (traits) =>
    traits.stealth
      ? ['SEEN BY', revealingTowerKinds().map((kind) => towerStats(kind).name).join(' / ')]
      : null,
];

export interface TowerPanel {
  /** The console's root box. Exposed so its owner can measure it - the console is
   *  anchored by a rule that needs its height, and that height changes with every
   *  collapse and every one of its four modes. */
  element: HTMLElement;
  update(target: PanelTarget, buildKind: TowerKind | null, cycles: number, preview: WavePreview | null): void;
  setRun(paused: boolean, speed: number): void;
  /**
   * Open the ABOUT reading, and tell it whether a newer build is waiting. A fifth mode
   * rather than a fifth box: the console is already the surface this game reads things
   * out on, and a second panel would be a second set of everything - collapse, anchoring,
   * dot leaders - to say three lines.
   */
  setAbout(open: boolean, updateReady: boolean): void;
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
  /** Let the waiting service worker through and reload onto it. Costs the current run. */
  onReload(): void;
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

  /**
   * The call, in the header, and only while the console is collapsed. Collapsed is the
   * state the run is actually played in - the board is what you are watching - and in it
   * the `CALL +8` row is behind a tap that opens a panel over the board you would be
   * calling the wave onto. This is the same reason pause and speed live up here.
   *
   * No confirm, unlike the spawn port's two taps. The rule that separates them is where
   * they are: a button in the chrome is a thing you went to press, and a tile on the
   * board is a thing your finger was already over. It shows no bonus for the same reason
   * the port shows none - there is one surface where that number fits, and expanding the
   * console is how you get to it.
   */
  const callHeadButton = document.createElement('button');
  callHeadButton.type = 'button';
  callHeadButton.className = 'panel-run panel-call-head';
  callHeadButton.textContent = '>>';
  callHeadButton.setAttribute('aria-label', 'Call the next wave');
  callHeadButton.hidden = true;
  callHeadButton.addEventListener('click', () => handlers.onCallWave());
  head.appendChild(callHeadButton);

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

  /**
   * The soundtrack credit, and the only link anywhere in the game.
   *
   * A row of its own under the grid rather than a sixth stat cell, for two reasons that
   * point the same way: the studio's name is wider than one of that grid's two 118px
   * columns, and this is the one line in the console that is a control rather than a
   * reading - it leaves the game. Everything else here reports on the run.
   *
   * The composer is the reason the game has a soundtrack at all, and the debt has been
   * open since the first delivery; see the credit section of
   * [Audio](../docs/Design/Audio.md) for what is owed and on what terms. The console is
   * where it lands because the console is the only surface the game has that is about
   * the game rather than about the board - and when ABOUT moves to the shell, this rides
   * along with it, because it is part of the reading and not part of the panel.
   */
  const credit = document.createElement('a');
  credit.className = 'stat panel-credit';
  credit.href = 'https://www.ancestorsoundworks.com.br';
  // Opens beside the game rather than over it: an installed PWA that navigates away from
  // itself has no back button to come home with, and a run would be lost to a credit.
  credit.target = '_blank';
  credit.rel = 'noopener noreferrer';
  credit.hidden = true;
  const creditLabel = document.createElement('span');
  creditLabel.className = 'stat-label';
  creditLabel.textContent = 'MUSIC';
  const creditValue = document.createElement('span');
  creditValue.className = 'stat-value';
  creditValue.textContent = 'ANCESTOR SOUNDWORKS';
  credit.append(creditLabel, creditValue);
  body.appendChild(credit);

  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  body.appendChild(actions);

  // The panel acts on whatever it is currently showing, so a button pressed after
  // the selection moved can't operate on a stale tower.
  let current: Tower | null = null;
  let collapsed = false;
  /** Last reading's answer to "is there a wave to call", so collapsing can re-ask it. */
  let callable = false;

  function syncHeadCall(): void {
    callHeadButton.hidden = !collapsed || !callable;
  }

  function applyCollapsed(): void {
    body.hidden = collapsed;
    syncHeadCall();
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

  // Only ever visible in the ABOUT reading, and only while a build is actually waiting.
  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.innerHTML = '<span>RELOAD</span><span></span>';
  reloadButton.hidden = true;
  reloadButton.addEventListener('click', () => handlers.onReload());
  actions.appendChild(reloadButton);

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
      // No `next` column: the ability does not scale with the tier, and a blank column
      // beside a row that never changes reads as a stat you have not bought yet.
      if (towerStats(tower.kind).reveals) setStat(2, 'REVEALS', 'STEALTH');
      clearStatsFrom(towerStats(tower.kind).reveals ? 3 : 2);
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
      let auraRow = 2;
      // The console exists so a piece says what it does before it is paid for, and this
      // is the one ability in the game that is worthless until the run needs it and
      // decisive the moment it does. Hiding it until purchase is the exact failure the
      // build preview was added to end.
      if (base.reveals) setStat(auraRow++, 'REVEALS', 'STEALTH');
      if (onPathOnly) setStat(auraRow++, 'PLACE', 'ON PATH');
      clearStatsFrom(auraRow);
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
    meta.textContent = preview.callable ? `IN ${countdownSeconds(preview.countdownMs)}s` : 'ON BOARD';
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
    // Same rule as the enemy panel's BREACH line: the ordinary case earns no row. Both
    // axes get one, because "tougher" and "faster" are different problems with different
    // answers - a tier, or a tower somewhere else - and the countdown is the only moment
    // the player can still act on knowing which one is coming.
    if (preview.scale.hp > 1 && row < STAT_COUNT) setStat(row++, 'HARDENED', `${preview.scale.hp}x`);
    if (preview.scale.speed > 1 && row < STAT_COUNT) setStat(row++, 'ACCELERATED', `${preview.scale.speed}x`);
    clearStatsFrom(row);
  }

  /**
   * What the game is, rather than what is happening in it - and the only reading here
   * that is not about the board. It carries the build, because a bug reported from a
   * phone that cannot name a commit is a bug nobody can chase, and it carries the update
   * state, because with `registerType: 'prompt'` a downloaded build waits rather than
   * seizing the page.
   *
   * **The reload is offered and never taken.** Reloading costs the run in progress, and
   * with overlapping waves there is no longer a gap between waves to slip one into. A
   * player who never presses it still gets the new build the next time the app is fully
   * closed and reopened, because a waiting worker activates once the last client is
   * gone - so the button is for the installed app that is resumed for weeks and never
   * restarted, which is the case that had no answer at all before.
   */
  function renderAbout(updateReady: boolean): void {
    title.textContent = 'ICE BREAKER';
    meta.textContent = updateReady ? 'UPDATE READY' : APP_VERSION;
    meta.classList.remove('panel-short');

    actions.hidden = !updateReady;
    reloadButton.hidden = !updateReady;
    credit.hidden = false;
    upgradeButton.hidden = true;
    overclockButton.hidden = true;
    sellButton.hidden = true;
    callButton.hidden = true;

    let row = 0;
    setStat(row++, 'VERSION', APP_VERSION);
    setStat(row++, 'BUILT', APP_BUILT);
    setStat(row++, 'UPDATE', updateReady ? 'READY' : 'UP TO DATE');
    clearStatsFrom(row);
  }

  // Same argument as the stats signature below, on the two values that change least
  // often in the whole console.
  let runStamp = '';

  // update() runs every frame off the render loop. Everything it writes is derived
  // from these few values, so a signature check keeps a still panel from churning
  // a dozen text nodes 60 times a second on the low-end phones the renderer worries about.
  let signature = '';

  let aboutOpen = false;
  let aboutUpdateReady = false;

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

      // Outside the stamp on purpose: the stamp exists to keep an unchanged panel from
      // redrawing, and the header's call button is not part of the panel it guards - it
      // has to keep up with the countdown ending whatever the body happens to be showing.
      callable = preview?.callable === true;
      syncHeadCall();

      // Cycles enter the stamp as a yes/no against the price, not as a number: all
      // a balance decides is whether one thing is affordable, so every balance on
      // the same side of that price is the same panel and shouldn't redraw it.
      let stamp: string;
      // First, and above the selection on purpose: ABOUT is a thing the player went and
      // opened, so it outranks whatever the board happened to have selected underneath.
      if (aboutOpen) {
        stamp = ['about', aboutUpdateReady ? 1 : 0].join('|');
      } else if (target?.kind === 'tower') {
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
      // Cleared here rather than in each of the four renderers that never show them:
      // only ABOUT ever turns them back on, so two lines before the dispatch cannot be
      // forgotten by whoever writes the sixth reading.
      reloadButton.hidden = true;
      credit.hidden = true;
      if (aboutOpen) renderAbout(aboutUpdateReady);
      else if (target?.kind === 'tower') renderSelected(target.tower, cycles);
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
    setAbout(open: boolean, updateReady: boolean): void {
      if (open === aboutOpen && updateReady === aboutUpdateReady) return;
      aboutOpen = open;
      aboutUpdateReady = updateReady;
      // The stamp guards a still panel from redrawing, and the mode changing underneath
      // it is exactly the case it cannot see: clearing it forces the next update through.
      signature = '';
    },

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
