# Difficulty

Post-v1.5 ideas about how hard the run is. Part of [Idea Bank](./Idea%20Bank.md), which is where these lived as one bullet each until the category outgrew the line. Brainstormed 2026-08-28, unprioritized, nothing chosen.

The trigger was player feedback that the ten-wave curve is too easy, and agreement with it. What follows is the reading the harness gave when that feedback was checked against it, and the directions that came out of the reading - not a plan.

## What the harness says, and why it disagrees

Run against the seven declared layouts, the curve does not look easy at all. Four of the seven breach the core, and `focused` - a real build, played well - only survives at 2/5 with three leaks on the books.

```
LOADOUT   RESULT          CORE  LEAK  EARNED  BANKED
bare      CORE BREACHED      0     5       0     100
starter   CORE BREACHED      0     5     202     237
spread    CORE BREACHED      0     5     270     185
focused   SYSTEM SECURED     2     3     392     177
turret    CORE BREACHED      0     5     287      37
veteran   SYSTEM SECURED     5     0     409     164
rush      SYSTEM SECURED     5     0     486     241
```

**The harness and the players are not disagreeing - they are measuring different things**, and naming the gap is most of what this note is for.

The layouts that lose are bad builds, and they lose by staying bad: `spread` thins itself across four kinds, `turret` banks through the middle of the curve for a tier-3 AES Turret it reaches at wave 8, `starter` never upgrades at all. A build order is a commitment made before wave 1 and never revised. A person watching a leak does the one thing the harness cannot: change their mind. Every human run converges toward `veteran`, and `veteran` finishes 5/5 with zero leaks.

**And every simulated run is weaker than a real one, because the harness never uses Overclock.** `triggerOverclock` is called from `main.ts` and from nowhere else; `game.ts` ticks the timer down and nothing in `balance.ts` ever starts it. So the numbers above are a floor on player capability, not a measurement of it, and the fire-rate ability a player leans on in exactly the moments the curve is trying to be hard is absent from every row.

## Four reasons it plays easy

**The economy stops binding halfway.** `veteran` ends with 164 Cycles unspent and `rush` with 241. The curve pays 409 over the 100 it starts with, and a winning run only ever *needs* about 345 of it. [Run Structure](../Design/Run%20Structure.md) sized the payout so that topping out some towers is reachable and topping out all of them is not, and that decision is real at wave 3 and dead by wave 8 - past the midpoint the player is not choosing, they are watching. The gate `tests/wave.test.ts` holds is the gap between what a run earns and what the full ladder costs, which is a statement about the *ceiling*; nothing gates the surplus a winning run is sitting on when it ends.

**Difficulty has exactly one knob, and it is the wrong one.** `hpScale` is the only lever waves 7-10 pull. HP is also the axis an upgraded board beats by construction: damage per tier climbs faster than the multiplier does, so a late wave is the wave-4 problem with bigger numbers rather than a different problem. The note in `wave.ts` that introduced it was right that counts could not carry difficulty, because counts are also the bounty. It does not follow that HP is the only thing left.

**Nothing accumulates against the player.** The countdown starts when the board *clears*, so every wave opens on a full board with nothing owed. A wave that went badly costs core HP and then costs nothing else. There is no state that carries, which means there is no such thing as falling behind - only losing.

**A leak is cheap.** Five core HP, and almost everything costs one. `focused` leaks three times and still reads `SYSTEM SECURED`. The Zero-Day's three, added late in v1.3 precisely so a leaking run cannot walk into the boss and survive, is the only place in ten waves where a mistake is priced like one.

## Directions

### Pressure that is not HP

- **Overlapping waves** - start the countdown when a wave finishes *spawning* rather than when the board clears. Already filed in [Idea Bank](./Idea%20Bank.md) as one of the two candidate costs for the early call, and rejected there as out of scope mid-milestone because it retunes the whole curve. It is the largest single change available: it makes concurrency the difficulty axis instead of HP, and it turns a leak into a debt, because the stragglers you failed to kill are still walking when the next wave opens. It also gives the early call the mechanical cost that note says it is missing.
- **Armor - flat damage reduction per hit, instead of more HP.** `hpScale` rewards whatever the player already built; armor changes *what is correct*. One point of reduction erases the Firewall Node's chip damage and makes the AES Turret's 4-11 per shot the answer, which is a counterplay decision rather than a bigger number.
- **Speed scaling on late waves.** `hpScale` moves HP and deliberately nothing else. Speed is the other half: it shortens time-in-range, so it attacks coverage and placement rather than DPS, and it makes the IDS Scanner and Honeypot slow auras matter more the deeper the run goes.
- **Enemies that attack towers** - the EMP unit already filed under new enemy behaviors. The first mechanic that would make the board impermanent, which is a category of pressure the game has never had.

### An economy that keeps binding

- **Repair the core with Cycles.** Gives the late surplus a sink, and prices a leak in something other than a number that only matters at zero.
- **Upkeep per tower per wave.** Punishes the wide board, which is exactly the build the curve currently fails to punish - `spread` loses to bad targeting, not to its own cost.
- **Flatten the late payout** so waves 8-10 fund almost nothing and you fight with the board you built. Simpler than upkeep and aimed at the same surplus.
- **A tier 4**, expensive enough that one tower reaches it, which restores the "some, not all" decision at the top of the curve rather than only in the middle.

### Structure

- **Endless after wave 10**, already filed, and held out of v1.3 on the grounds that it measures a run against a standard the milestone was still building. The standard exists now. It is also the honest answer to "I finished it and it was easy": it converts the complaint from a balance bug into a score.
- **Difficulty modes** - one multiplier set over `hpScale`, starting core and payout. The cheapest thing on this page, and openly a knob rather than a design.
- **Fifteen waves with a second act**, each kind reintroduced carrying a modifier.

### Enemies that demand an answer

Six kinds today, and only two of them ask for a different answer rather than more of the same one: Ransomware splits, and the Zero-Day is immune to AES Turrets. The rest are HP and speed variations on "shoot it". The kinds already filed - stealth, healer, shielded, EMP - each add a real question. One more worth adding to that list: **a kind immune to slow**, which would punish the IDS/Honeypot build the way the Zero-Day punishes the all-turret build. The immunity table in `enemy.ts` is keyed per tower kind and would take it as-is.

### The instrument

Before tuning anything, the harness cannot currently express the complaint.

- **Margin, not verdict.** It reports won or lost. What is missing is how much harder the wave would have to be before a layout takes its first leak - bisect `hpScale` per layout and report the multiplier at which it breaks. That number is the feedback, quantified, and it is the one thing here that makes every other item on the page measurable instead of arguable.
- **Overclock in the sim**, even under a dumb policy (fire it whenever it is off cooldown and something is in range). Without it every measurement underestimates the player, and the ability is worth most in exactly the moments the curve is trying to be hard.
- **An adaptive layout** - one that reinvests by rule rather than by a fixed order, so the harness has at least one row that behaves like a person who changes their mind.

## If one thread gets picked

The instrument first, because it is cheap and because tuning without it is the vibes-based balancing the harness was built in v1.3 to end. Then overlapping waves plus one economy sink. Those two are already filed, they change the *shape* of a run rather than its numbers, and between them they answer three of the four reasons above. `hpScale` keeps existing; it stops being the only tool.

## Decided since

Both questions this page left open were answered on 2026-08-30, and neither by this page: **v1.6** is the milestone, and the answer to "too easy" is **the curve** rather than a mode, on the v1.3 precedent that you tune a thing before offering variants of it. What the milestone took from here is three of the four reasons above - the single wrong knob, nothing accumulating, and six kinds that ask two questions - plus the instrument, which it puts first for the reason this page argues. What it left is the economy sink, deliberately, because v1.6 already moves the two things a sink would be tuned against. See [Roadmap](../Roadmap.md).

The rest of this page stands as written: it is the reading that produced those choices, and the directions it lists that were not picked are not rejected, only unscheduled.

E o instrumento que esta página pediu existe desde 2026-08-30: `npm run balance -- --margin` bisseca um multiplicador de HP da run inteira e reporta, por layout, em quanto a curva teria que ficar mais difícil para o board sangrar e para ele morrer. Duas coisas que a página não previu vieram junto. **A margem precisa de um número de wave do lado dela** - um multiplicador da run inteira acha o elo mais fraco, e o primeiro elo mais fraco encontrado foi a wave 2, num degrau de arredondamento do Worm de 3 HP, não a curva tardia que a bisseção parecia estar medindo. E **o `focused` perde no piso da faixa de busca**, o que mede o muro do ROOTKIT como absoluto e não como íngreme: é a linha que agora argumenta melhor do que qualquer prosa a favor do *layout adaptativo* que esta página listou e ninguém agendou - uma linha que muda de ideia é a única que separaria "esse board é ruim" de "esse board é bom e a ordem de compra é burra".

O Overclock na simulação continua fora, então tudo acima segue sendo piso e não medida.
E em **2026-09-12** três direções desta página foram ranqueadas no banco, em [The sequence](./Idea%20Bank.md#the-sequence-ranked-2026-09-12). O **Overclock no sim** entra no item 1 junto com o replay determinístico, e a leitura que o promoveu é desta página virada do avesso: o relatório pós-run que a categoria Legibility arquivou como legibilidade é na verdade o *outro lado do instrumento*, porque ele mede a run que usa Overclock e muda de ideia - exatamente as duas coisas que esta nota diz que o harness nunca faz. O **layout adaptativo** perde por causa disso a justificativa principal, já que ele existia como proxy de "uma linha que muda de ideia" e uma run humana gravada não é proxy; sobra para ele o trabalho de *gate de regressão*, que o replay não consegue fazer porque um replay é escopado à curva que o produziu - a lição do `CURVE_ID` do v1.7 um andar acima. E o **sink de economia** é o item 3, atrás da pergunta do Roster, com uma condição escrita junto: se o relatório mostrar run real terminando com mais sobra do que os 164 do `veteran`, ele passa na frente.

E em **2026-09-12**, mais tarde no mesmo dia, a quarta razão desta página foi **medida contra uma run humana e não sobreviveu**. A economia que "para de apertar na metade" foi lida com `npm run balance -- --run`, que replaya uma run gravada dentro do harness: no RECURSION 02, a run que o jogador ganhou termina com **64 no banco contra os 62 do `veteran`** - e desce a **5 Cycles na wave 6**, gastando 89% de tudo que passa pela mão dela. Os 164 desta nota são leitura da curva de dez waves, e o v1.6 já os tinha movido para 62 sem que a condição fosse atualizada.

E a tabela inteira lida junto inverte o sinal: quem banca mais é `starter` com 196, `spread` com 136 e `rush` com 79, e os três arrombam o core. **Sobra mede principalmente quando a run parou de conseguir gastar.** O sink de economia continua no item 3 e não fura a fila.

O que a mesma leitura achou e esta página deveria ter previsto: **a chamada adiantada é um dial e o harness só sabe girar ele até o fim.** O `rush` pega 117 de bônus e morre em 1:04; o humano pega 68 - uns 58% - e ganha com o core intacto em 2:08, porque chama com uns cinco segundos sobrando em vez de no instante em que o port acende. A leitura antiga do `rush` continua de pé e ganha a metade que faltava: `callWavesEarly: boolean` não consegue expressar a posição em que gente de verdade joga.
