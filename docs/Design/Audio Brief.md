# Audio Brief

Part of [Design](./Design.md). The delivery spec handed to the composer. Written in Portuguese because that is the language it is sent in; the surrounding docs stay in English.

Background on the constraints behind these numbers is in the vault note `Áudio em PWA`.

---

## O jogo, em duas linhas

Tower defense de navegador ("ICE Breaker": defender um mainframe corporativo de malware), estética terminal/PCB, verde de fósforo e magenta. Joga em <https://ssvito.github.io/ice-breaker/>. Uma partida dura de seis a oito minutos e tem dez ondas, com uma respirada na 6 e um chefe na 10.

## O que muda em relação a compor uma faixa

A trilha **não é uma faixa que toca do começo ao fim**. São camadas que ligam e desligam sozinhas conforme a pressão do jogo, e o jogo decide quais estão tocando a cada momento. Isso tem uma consequência que é composicional, não técnica:

> Cada camada precisa funcionar **sozinha** e em **qualquer combinação** com as outras.

É diferente de um mix normal, onde as partes só fazem sentido juntas. Aqui não existe "essa linha só funciona quando a bateria entra", porque a bateria pode não entrar.

Duas regras que caem daí:

- **As camadas são cumulativas, não exclusivas.** A camada 4 entra *por cima* das outras três, não no lugar delas. Não escreva uma parte de onda pesada assumindo que a parte calma parou.
- **Harmonia e tônica moram na camada que nunca desliga.** Se o baixo que define o acorde está numa camada opcional, o jogo fica sem chão metade do tempo.

## As quatro camadas

| # | Nome | Entra quando | O que carrega |
|---|---|---|---|
| 1 | **BED** | sempre ligada | pad/ambiente, define tonalidade e harmonia. É o que toca sozinho no intervalo entre ondas |
| 2 | **PULSE** | uma onda está no tabuleiro | percussão, pulso, movimento |
| 3 | **DRIVE** | onda 7 em diante | baixo, arpejo, tensão - a partir da 7 os inimigos ganham multiplicador de HP |
| 4 | **ALERT** | onda 10 (chefe) ou core em perigo | lead, dissonância, a coisa que avisa que deu ruim |

As trocas são **crossfade de 1 a 2 segundos**, e podem cair no compasso seguinte em vez de cair no meio - me diz o BPM e eu alinho a troca à grade. Consequência prática: evite parte que dependa de entrar exatamente na cabeça do compasso para fazer sentido, porque ela pode entrar subindo.

## Entrega

| Item | Especificação |
|---|---|
| Formato | **WAV, 48 kHz, 24-bit** |
| Arquivos | um por camada, quatro no total |
| Duração | **30 a 45 segundos**, em loop. Escolha os compassos e o BPM que caem nessa janela |
| Comprimento | as quatro camadas com **exatamente o mesmo número de amostras** |
| Início | todas começam na amostra 0 do compasso 1, sem offset, sem silêncio na frente |
| Fades | nenhum. Sem fade in, sem fade out, sem normalize no export |
| Estéreo | manda tudo em estéreo; eu decido no encode o que vira mono (baixo e percussão provavelmente, pad não) |

Não manda MP3 nem faixa masterizada. Eu comprimo aqui, a partir dos WAV, e reencodar de material já comprimido empilha duas gerações de perda.

### As três armadilhas de bounce

Essas três são o que faz stem chegar quebrado, e são todas invisíveis dentro do DAW:

1. **A cauda do loop.** Reverb e delay do fim da volta somem quando o arquivo acaba, e aí a emenda estala a cada 40 segundos. O jeito certo: duplica a região para tocar duas vezes seguidas e **exporta só a segunda volta**. A cauda da primeira já está soando dentro dela, então a emenda fecha.
2. **Send compartilhado.** Se o reverb está num bus que várias camadas alimentam, desligar uma camada no jogo deixa a cauda dela tocando pela camada que sobrou. Cada camada precisa vir **com o próprio efeito impresso dentro dela**, autocontida.
3. **Cadeia de master ligada.** Compressor e limiter de master somam diferente quando cada camada passa por eles separadamente. Exporta com o master **bypassado**, pós-fader.

### Headroom

O jogo tem os próprios sons por cima (tiro, impacto, kill, klaxon) e um limiter no final da cadeia. Se a música chegar no volume de streaming, ela ocupa o teto sozinha e o limiter começa a bombear toda vez que uma onda entra.

- As quatro camadas **somadas** devem picar em torno de **-6 dBTP**, não em -0,1.
- Alvo de -18 LUFS integrado na soma. É mais baixo que master de streaming de propósito.

## Orçamento de tamanho, e o que custa esticar

O jogo inteiro pesa 81KB, e ~15KB comprimido pela rede. Qualquer trilha é maior que ele - isso está aceito. O que não dá para ignorar é a memória: cada camada decodificada custa ~11MB por minuto em mono, ~22MB em estéreo, e o celular segura as quatro.

O que o alvo de 30-45s compra: 4 camadas ficam em torno de 480KB baixados e ~30MB de RAM. Se quiser mais material:

| Pedido | Custo |
|---|---|
| Loop de 60s em vez de 40s | +50% em download e RAM |
| Seção A/B (o dobro do material, alternando) | dobra os dois |
| Uma quinta camada | +25% |
| BED mais longa que as outras (múltiplo exato: 80s de BED, 40s do resto) | variação percebida por +25%, e é o melhor negócio da tabela |

Nenhuma dessas está vetada. Só quero decidir sabendo o preço.

## SFX, se ele quiser

A divisão que faz sentido: **síntese para o que repete, produção para o que acontece uma vez.**

Tiro e impacto tocam doze vezes por segundo e vão ser gerados em código, porque precisam variar a cada disparo para não virar metralhadora. O que vale ser composto é o que acontece uma vez por partida e carrega identidade:

- klaxon de onda
- entrada do chefe (onda 10)
- breach do core
- fim de jogo, vitória e derrota

Para esses: WAV 48kHz mono, curtos, sem fade, sem cauda pendurada. E se ele topar fazer os repetitivos também, aí são **3 variações de cada**, não uma - a variação é o que resolve o efeito metralhadora na origem.

## Crédito e licença

O repositório é público e o jogo está no ar como peça de portfólio. Antes de entrar código: combinar como ele quer ser creditado, e sob que licença a trilha vai junto. Isso vira uma linha no README e no `about` do jogo.

## Checklist de entrega

- [ ] 4 WAV, 48kHz/24-bit, mesma contagem de amostras
- [ ] exportados da segunda volta, emenda fechada
- [ ] cada camada autocontida, sem send compartilhado
- [ ] master bypassado
- [ ] soma picando ~-6 dBTP
- [ ] BPM e número de compassos anotados
- [ ] cada camada ouvida sozinha, e as quatro combinações cumulativas ouvidas
