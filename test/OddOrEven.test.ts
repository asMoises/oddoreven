import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

// Cria a estrutura de dados de uma partida
type GameData = {
  hashOptionP1: string; // Hash of Player 1's option
  timeOut: string; // Timeout duration in seconds (uint64)
  timeOutP1: string; // Player 1 timeout timestamp (uint256)
  timeOutP2: string; // Player 2 timeout timestamp (uint256)
  nLockTime: string; // Lock time for the game (uint256)
  isOdd: boolean; // Whether the game is Odd/Even (bool)
  player1: string; // Player 1's address (address)
  player2: string; // Player 2's address (address)
  optionP2: number; // Player 2's option (int8)
  optionP1: number; // Player 1's option (int8)
  keyGame: string; // Player 1's keygame
};

// Função que vai recuperar dados crus da BC e organiza-los em atributos.
function fetchGameData(rawGameData: any) {
  const gameData: GameData = {
    hashOptionP1: rawGameData[0],
    timeOut: rawGameData[1],
    timeOutP1: rawGameData[2],
    timeOutP2: rawGameData[3],
    nLockTime: rawGameData[4],
    isOdd: rawGameData[5],
    player1: rawGameData[6],
    player2: rawGameData[7],
    optionP1: Number(rawGameData[8]),
    optionP2: Number(rawGameData[9]),
    keyGame: rawGameData[10],
  };
  return gameData;
}

let keySeed = hexStringToUint8Array("abcddbe576b4818846aa77e82f4ed5fa78f92766b141f282d36703886d196df39322",); // Transforma a seed em um array de bytes
let gameKey = ethers.keccak256(keySeed); // chama a criptografia pra criar a chave do jogo.
const modifiedGameKey = gameKey.substring(2); // remove o prefixo "0x" do gameKey para ser usado no hash

// Esta função recebe a seed e verifica se será um hex de tamanho par, depois, devolve um array de bytes com metade do tamanho.
function hexStringToUint8Array(hexString: string): Uint8Array {
  if (hexString.length % 2 !== 0) {
    throw new Error("Hex string must have an even length");
  }

  // Converte a string em um array de bytes
  const byteArray = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < byteArray.length; i++) {
    const byte = hexString.substring(i * 2, i * 2 + 2); // a1 b2 c3 d4
    byteArray[i] = parseInt(byte, 16);
  }

  return byteArray; // isso se torna o meu keySeed
}


// Função auxiliar que recebe a opção do joagador, recebe (por padrão) a gameKey (vindo da criptografia) e devolve o hash
function buildCommit(option: number, key: string = modifiedGameKey) {
  let optionStr = option.toString(16); // converte a opção do player 1 para base 16

  // Percorre o hex para garantir que será par, adicionando um zero antes se necessário
  while (optionStr.length % 2 === 1) optionStr = "0" + optionStr;

  const hash = ethers.keccak256(
    hexStringToUint8Array(
      modifiedGameKey + optionStr,
    ),
  );
  return { keygame: modifiedGameKey, hash };
}

const DEFAULT_BID = ethers.parseEther("0.01");

describe("OddOrEven", function () {
  let oddOrEven: any; // opção escolhida
  let owner: any; // endereço do owner
  let player1: any; // endereço P1
  let player2: any; // endereço P2

  beforeEach(async () => {
    // endereça os participantes com os endereços de testes
    [owner, player1, player2] = await ethers.getSigners();
    // faz deploy na rede.
    oddOrEven = await ethers.deployContract("OddOrEven");
  });

  // ───── Helpers ─────

  // Conecta as instâncias de player1 e player2 ao contrato
  function connectPlayers() {
    return {
      player1Instance: oddOrEven.connect(player1),
      player2Instance: oddOrEven.connect(player2),
    };
  }

  // Faz buildCommit e chama playerInit com os parâmetros fornecidos.
  // Retorna o hash e o keygame para uso nos testes subsequentes.
  async function initGame(
    player1Instance: any,
    option: number = 3,
    isOdd: boolean = false,
  ) {
    const { hash: hashOptionP1In, keygame } = buildCommit(option);
    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });
    return { hashOptionP1In, keygame };
  }

  // Avança o timestamp da blockchain para além do nLockTime e chama acceptGame.
  async function advanceTimeAndAccept(
    player2Instance: any,
    optionP2: number = 4,
  ) {
    const gameData = fetchGameData(await oddOrEven.gameData());
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);
    await player2Instance.acceptGame(optionP2, { value: DEFAULT_BID });
  }

  // *********************** Começa os testes ************************
  // O jogo sempre é reiniciado!

  // 01 - Teste de Criação
  it("should have created", async function () {
    let gameData = fetchGameData(await oddOrEven.gameData()); // Da um fetch no dados da BC
    expect(gameData.optionP2).to.equal(-1); // espera um retorno de option nao escolhida ainda por P2
  });

  // 02
  it("should init game", async function () {
    const { player1Instance } = connectPlayers();
    const { hashOptionP1In } = await initGame(player1Instance);
    let gameData = fetchGameData(await oddOrEven.gameData());

    expect(gameData.hashOptionP1).to.equal(hashOptionP1In);
  });

  // 03
  it("should NOT init game (Invalid Bid)", async function () {
    const { player1Instance } = connectPlayers();
    const { hash: hashOptionP1In } = buildCommit(3);

    await expect(
      player1Instance.playerInit(false, hashOptionP1In, {
        value: DEFAULT_BID - 1n, // nao deve iniciar por estar menor que o valor padrão
      }),
    ).to.be.revertedWith("Invalid Bid");
  });

  // 04
  it("should NOT init game (Player1 already chose)", async function () {
    const { player1Instance } = connectPlayers();
    const { hashOptionP1In } = await initGame(player1Instance);

    await expect(
      player1Instance.playerInit(false, hashOptionP1In, { value: DEFAULT_BID }), // Segunda vez que playerInit é chamada, o construtor setou 0 na primeira, mas depois disso passa a ser -1, ja foi chamada
    ).to.be.revertedWith("Player1 already chose");
  });

  //  05
  // Validar o cenário onde o Jogador 1 (P1) desiste da partida antes que qualquer outro jogador a aceite,
  // garantindo que o dinheiro apostado retorne corretamente para os envolvidos e o estado do contrato inteligente seja resetado.
  it("should quit game", async function () {
    const { player1Instance } = connectPlayers();
    await initGame(player1Instance);

    // atribui saldos para ter o bkp
    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceOwnerbefore = await ethers.provider.getBalance(owner.address);
    let balanceContractBefore = await ethers.provider.getBalance(oddOrEven);

    // Calcula o gas utilizado (pega o gas * o preço dele para ter em wei o custo)
    const tx = await player1Instance.quitGame(); // busca o transaction response das transações de quitGame
    const receipt = await tx.wait(); // quando a transação for colocada em um bloco, ja podemos consultar o gás usado
    const gasUsed = receipt!.gasUsed; // BigNumber do gas usado
    const gasPrice = tx.gasPrice; // BigNumber preço do gas usado
    const fee = gasUsed * gasPrice; // gas * preço = wei

    // atribui saldos posteriores a transação
    let balanceP1after = await ethers.provider.getBalance(player1.address); // vem do endereço de p1
    let balanceOwnerafter = await ethers.provider.getBalance(owner.address); // vem do endereço do owner
    let balanceContractAfter = await ethers.provider.getBalance(oddOrEven); // vem do endereço do contrato na rede

    // consulta a transação após finalizada para verificações
    let gameData = fetchGameData(await oddOrEven.gameData());

    // owner(posterio - anterior) + p1(posterior - anterior + gas) == saldo total do contrato
    expect(
      balanceOwnerafter -
        balanceOwnerbefore +
        (balanceP1after - balanceP1before + BigInt(fee)),
    ).to.equal(balanceContractBefore);

    //Verificação do saldo do dono do contrato
    // se eu pegar todo o saldo do contrato e subtrair os valores de player1, o que sobrar deve ser o valor do owner.
    // contrato(antes) - P1(após - antes + gas) == Owner (após - antes)
    expect(
      balanceContractBefore - (balanceP1after - balanceP1before + BigInt(fee)),
    ).to.equal(balanceOwnerafter - balanceOwnerbefore);

    //Verificação do jogo resetado
    expect(gameData.hashOptionP1).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  // 06
  it("should NOT quit game (Accepted)", async function () {
    const { player1Instance, player2Instance } = connectPlayers(); // conecta os players
    await initGame(player1Instance); // incia com p2
    await advanceTimeAndAccept(player2Instance); // avança o bloco e p2 joga

    // não deixa p1 terminar pq p2 ja jogou
    await expect(player1Instance.quitGame()).to.be.revertedWith(
      "Cant quit game after other player accpetance",
    );
  });

  // 07
  it("should NOT quit game (Not Player 1)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance);

    // o danado do p2 tenta encerrar, mas ele nao pode.
    await expect(player2Instance.quitGame()).to.be.revertedWith(
      "Only player1 can quit the game",
    );
  });

  // 08
  it("should accept game", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance);

    let balanceOwnerbefore = await ethers.provider.getBalance(owner.address);
    let balanceContractBefore = await ethers.provider.getBalance(oddOrEven);

    await advanceTimeAndAccept(player2Instance);

    let balanceOwnerafter = await ethers.provider.getBalance(owner.address);
    let balanceContractAfter = await ethers.provider.getBalance(oddOrEven);

    let gameData = fetchGameData(await oddOrEven.gameData());

    // Tudo correu bem, então o jogo acontece.
    expect(
      // Verificação do saldo do dono do contrato
      balanceOwnerafter - balanceOwnerbefore + balanceContractAfter,
    ).to.equal(2n * balanceContractBefore);
    //Verificação do jogo aceito
    expect(gameData.optionP2).to.equal(4);
  });

  // 09
  it("should NOT accept game (Already Accepted)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance);
    await advanceTimeAndAccept(player2Instance);

    // após conectar os players e ambos jogarem, o enbdereço de owner é usado para tentar jogar também.
    // Poderia ser qualquer outro endereço na rede, usei o owner por conveniência aqui.
    const player3Instance = oddOrEven.connect(owner);
    await expect(
      player3Instance.acceptGame(5, { value: DEFAULT_BID }),
    ).to.be.revertedWith("Game Already Accepted"); // deve dar erro: o jogo ja foi iniciado.
  });

  // 10
  it("should NOT accept game (Negative Option)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance);

    // nem avancei o bloco pq ja sabia que daria erro ao jogar numero negativo.
    await expect(
      player2Instance.acceptGame(-4, { value: DEFAULT_BID }),
    ).to.be.revertedWith("Cannot accept negative numbers");
  });

  // 11
  it("should NOT accept game (Invalid Amount)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance);

    // Nem avancei o bloco pois ja sabia que darie erro por aposta divergente do padrão "DEFAULT_BID + 1"
    await expect(
      player2Instance.acceptGame(4, { value: DEFAULT_BID + 1n }),
    ).to.be.revertedWith("Invalid amount");
  });

  // This check exists for BTC portability. On ETH, block timestamps always
  // increase, so block.timestamp == nLockTime can only occur in the same block
  // as playerInit — which network.create() does not allow without
  // allowBlocksWithSameTimestamp (not supported by the isolated EDR network).
  // 12
  it.skip("should NOT accept game (Timestap == Nlocktime)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance);

    let gameData = fetchGameData(await oddOrEven.gameData());
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime),
    ]);

    await expect(
      player2Instance.acceptGame(4, { value: DEFAULT_BID }),
    ).to.be.revertedWith("TX locktime cant be lower than base locktime");
  });

  // 13
  it("should NOT accept game (Timout Player 1)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    const { hash: hashOptionP1In } = buildCommit(3);

    // Avança o tempo antes do playerInit para criar uma condição de timeout
    const latestBlock = await ethers.provider.getBlock("latest");
    if (latestBlock) {
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        latestBlock.timestamp + 2,
      ]);
      await ethers.provider.send("evm_mine", []);
    }
    // inicio o jogo
    await player1Instance.playerInit(false, hashOptionP1In, {
      value: DEFAULT_BID,
    });
    // recupero os dados
    let gameData = fetchGameData(await oddOrEven.gameData());
    // atualizo o timestamp do proximo bloco
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + Number(gameData.timeOut) + 1,
    ]);
    // minera em branco, so pra validar o timestamp definido
    await ethers.provider.send("evm_mine", []);

    // após a simulação de timeout, o jogador 2 tenta aceitar e nao conseguie.
    await expect(
      player2Instance.acceptGame(4, { value: DEFAULT_BID }),
    ).to.be.revertedWith("Cannot accept after player 1 timeout");
  });

  // 14
  it("should NOT result game (Not Accepted)", async function () {
    // setup do jogo de novo
    const { player1Instance } = connectPlayers();
    const optionP1In = 3;
    const { keygame } = await initGame(player1Instance, optionP1In);

    // reucpera os dados do início do jogo
    let gameData = fetchGameData(await oddOrEven.gameData());

    // Avança o tempo da BC
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    // impede que o numero do jogador 1 seja mostrado antes do aceite e jogada do jogador 2.
    // isso impede que o jogador um seja hackeado pelo jogador 2 ou qlqr outro endereço
    await expect(
      player1Instance.resultGame(hexStringToUint8Array(keygame), optionP1In),
    ).to.revertedWith("Cant verify result before player 2 accpetance");
  });

  // --- do 15 ao 18 vamos testar a vitória de P1 e P2 para ímpar e par ---
  // 15
  it("should give victory to Player 1 ( 3 + 5 even)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    const optionP1In = 3;
    const { keygame } = await initGame(player1Instance, optionP1In, false); // false aqui representa que o player 1 quer par, jogando 3
    await advanceTimeAndAccept(player2Instance, 5);

    // insere os saldos atuais para bkp
    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    // mostra  o resultado do jogo
    await player1Instance.resultGame(
      hexStringToUint8Array(keygame),
      optionP1In,
    );

    // pega os novos saldos após resultGame executar as transferências
    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    // Pega tbm os dados da BC
    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    // compara saldos anteriores com os novos em cenários distintos que façam sentido com o final do contrato.
    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  // 16
  it("should give victory to Player 1 ( 3 + 4 odd)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    const optionP1In = 3;
    const { keygame } = await initGame(player1Instance, optionP1In, true); // true aqui representa que o player 1 quer ímpar, jogando 3

    // acelera o tempo da BC e P2 joga 4
    await advanceTimeAndAccept(player2Instance, 4);

    // pega os saldos antes da transação
    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    // mostra o resultado do jogo
    await player1Instance.resultGame(
      hexStringToUint8Array(keygame),
      optionP1In,
    );

    // pega os saldos após o jogo
    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    // recupera os dados atuais da BC
    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    // compara saldos anteriores com os novos em cenários distintos que façam sentido com o final do contrato.
    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  // 17
  it("should give victory to Player 1 ( 2 + 4 even)", async function () {
    // Setup
    const { player1Instance, player2Instance } = connectPlayers();
    const optionP1In = 2;
    const { keygame } = await initGame(player1Instance, optionP1In, false); // P1 continua querendo par, mas agora jogou 2

    // acelera o tempo e P2 joga 4
    await advanceTimeAndAccept(player2Instance, 4); // 4 + 2 =  6 (par)

    // saldos previos
    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    // mostra o jogo
    await player1Instance.resultGame(
      hexStringToUint8Array(keygame),
      optionP1In,
    );

    // Saldos posteriores.
    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    // atualização de dados vindos da BC
    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    // compara saldos anteriores com os novos em cenários distintos que façam sentido com o final do contrato.
    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  // 18
  it("should give victory to Player 1 ( 2 + 5 odd)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    const optionP1In = 2;
    const { keygame } = await initGame(player1Instance, optionP1In, true);
    await advanceTimeAndAccept(player2Instance, 5);

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    await player1Instance.resultGame(
      hexStringToUint8Array(keygame),
      optionP1In,
    );

    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });
  // ------------------------ 4 possibilidades testadas --------------------------

  // 19
  it("should give victory to Player 2 (wrong p1 keygame)", async function () {
    // Setup, jogadas de P1 e P2
    const { player1Instance, player2Instance } = connectPlayers();
    const optionP1In = 2;
    const { keygame } = await initGame(player1Instance, optionP1In, true);
    await advanceTimeAndAccept(player2Instance, 5);

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    // Resultado com manipulação da chave de P1 trocando 2 bytes finais por "ab"
    // O result game idenitifca a falha e coloca todo o saldo para P2 como punição a P1 informando sua chave errada
    await player1Instance.resultGame(
      hexStringToUint8Array(keygame.substring(0, keygame.length - 2) + "ab"),
      optionP1In,
    );

    // Saldos após o jogo
    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    let gameData = fetchGameData(await oddOrEven.gameData()); // mantive seguindo o que estava no projeto, mas nao usada neste teste

    // compara saldos anteriores com os novos em cenários distintos que façam sentido com o final do contrato.
    expect(balanceP1after <= balanceP1before).to.equal(true); // para comprovar isso, espera-se que o saldo final de P1 seja menor que o anterior
    expect(balanceP2after > balanceP2before).to.equal(true); // e o saldo final de P2 seja maior que o inicial.
  });

  // 20
  it("should give victory to Player 2 (wrong p1 option)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    const optionP1In = 2;
    const { keygame } = await initGame(player1Instance, optionP1In, true);
    await advanceTimeAndAccept(player2Instance, 5);

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    await player1Instance.resultGame(
      hexStringToUint8Array(keygame),
      optionP1In - 1, // aqui esta a pegadinha para forçar o erro, alterando a opção original em -1
    ); // o resultgame vai dar o saldo total ao P2

    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    // compara saldos anteriores com os novos em cenários distintos que façam sentido com o final do contrato.
    expect(balanceP1after <= balanceP1before).to.equal(true);
    expect(balanceP2after > balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  // 21
  it("should give victory to Player 2 (negative p1 option)", async function () {
    // setapu com falha
    const { player1Instance, player2Instance } = connectPlayers();
    const optionP1In = -2; // aqui temos um número negativo que vai falhar o jogo para pagar o P2
    const { keygame } = await initGame(player1Instance, optionP1In, true);
    await advanceTimeAndAccept(player2Instance, 5);

    // bkp de saldos
    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    // apresenta o resultado
    await player1Instance.resultGame(
      hexStringToUint8Array(keygame),
      optionP1In,
    );

    // atualização de saldos
    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    // compara saldos anteriores com os novos em cenários distintos que façam sentido com o final do contrato.
    expect(balanceP1after <= balanceP1before).to.equal(true);
    expect(balanceP2after > balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  // 22
  it("should claim game", async function () {
    // setup
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance, 2, true);
    await advanceTimeAndAccept(player2Instance, 5);

    let gameData = fetchGameData(await oddOrEven.gameData());
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.timeOutP2) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    // após o tempo limite de P1 para chamar o resultGame, o P2 pode reclamar a vitória por WO
    await player2Instance.claimGame();

    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    // compara saldos anteriores com os novos em cenários distintos que façam sentido com o final do contrato.
    expect(balanceP1after == balanceP1before).to.equal(true);
    expect(balanceP2after > balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal("0x");
  });

  // 23
  it("should NOT claim game (Not Accepted)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance, 2, true);

    let gameData = fetchGameData(await oddOrEven.gameData());
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    // O P2 tentar pedir a vitória sem antes ter jogado (aceitado o jogo)
    await expect(player2Instance.claimGame()).to.be.revertedWith(
      "Only accepted game can be claimed",
    );
  });

  // 24
  it("should NOT claim game (Timeout P2)", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    await initGame(player1Instance, 2, true);
    await advanceTimeAndAccept(player2Instance, 5);

    let gameData = fetchGameData(await oddOrEven.gameData());
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.timeOutP2) - 1, // esse menos 1 altera o timeout de P2 e ele perde o direito de pedir vitória por WO
    ]);
    await ethers.provider.send("evm_mine", []);


    await expect(player2Instance.claimGame()).to.be.revertedWith(
      "Game can only be claimed afther Player 2 timeout",
    );
  });

  // 25
  it("should Init game again", async function () {
    const { player1Instance, player2Instance } = connectPlayers();
    const { hashOptionP1In } = await initGame(player1Instance, 2, true);
    await advanceTimeAndAccept(player2Instance, 5);

    let gameData = fetchGameData(await oddOrEven.gameData());
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.timeOutP2) + 1, // força o timeout de P1 para dar WO
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.claimGame(); // P2 pede a vitória

    // teste para o endereço de P2 poder iniciar o contrato novamente, agora se tornando o P1
    await player2Instance.playerInit(true, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord()); // salva nessa variável o estado do jogo anterior.
    
    expect(gameDataLast.hashOptionP1).to.equal(hashOptionP1In);
  });
});
