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

// recupera dados crus da BC e organiza nos atributos, 
// considerando a posição no array bruto em que chegaram.
// Todos são strings, e os options recebem casting pra Number.
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

// Esta função recebe a seed e verifica se será um hex de tamanho par
// Depois, devolve um array de bytes com metade do tamanho.
function hexStringToUint8Array(hexString: string): Uint8Array {
  // Ensure the hex string length is even
  if (hexString.length % 2 !== 0) {
    throw new Error("Hex string must have an even length");
  }

  // Convert the string into an array of bytes
  const byteArray = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < byteArray.length; i++) {
    const byte = hexString.substring(i * 2, i * 2 + 2); // a1 b2 c3 d4
    byteArray[i] = parseInt(byte, 16);
  }

  return byteArray; // isso se torna o meu keySeed
}

let keySeed = hexStringToUint8Array("abcddbe576b4818846aa77e82f4ed5fa78f92766b141f282d36703886d196df39322",); // Transforma a seed em um array de bytes
let gameKey = ethers.keccak256(keySeed); // chama a criptografia pra criar a chave do jogo.
const modifiedGameKey = gameKey.substring(2); // remove o prefixo "0x" do gameKey para ser usadono hash

// Função auxiliar que recebe a opção do joagador,
// Recebe (por padrão) a gameKey (vindo da criptografia)
// Devolve o hash
function buildCommit(option: number, key: string = modifiedGameKey) {
  let optionStr = option.toString(16); // converte a opção do player 1 para base 16

  // Percorre o hex para garantir que será par, adicionando um zero antes se necessário
  // Precisa ser par para formar duplas de caracteres sempre.
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

  // *********************** Começa os testes ************************

  // 01 - Teste de Criação
  it("should have created", async function () {
    let gameData = fetchGameData(await oddOrEven.gameData()); // Da um fetch no dados da BC
    expect(gameData.optionP2).to.equal(-1); // espera um retorno de option nao escolhida ainda por P2
  });

  // 02
  it("should init game", async function () {
    // conecta a instancia de p1
    const player1Instance = oddOrEven.connect(player1);
    // chama a função aux com opção 3 e recebe o hash de (op + hex garantido que é par)
    const { hash: hashOptionP1In } = buildCommit(3); // o retorno é keygame e o hash do P1, mas desestruturo e pego so o hash renomeado para hashOptionP1In
    let isOdd = false; // paridade ímpar

    // O P1 chama a função playerInit do contrato com a paridade, com o hash e com o valor padrão da transação
    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    // quando receber um retorno da BC vem toda a estrutura de dados de GameData no objeto gameData
    // extrai a opção do p1 e compara com o p1 IN
    let gameData = fetchGameData(await oddOrEven.gameData());
    // garante que o hash recebido P1In é o mesmo que esta na estrutura de dados
    expect(gameData.hashOptionP1).to.equal(hashOptionP1In);
  });

  // 03
  it("should NOT init game (Invalid Bid)", async function () {
    const player1Instance = oddOrEven.connect(player1); // reconecta usando o endereço do player 1
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await expect(
      player1Instance.playerInit(isOdd, hashOptionP1In, {
        value: DEFAULT_BID - 1n,
      }),
    ).to.be.revertedWith("Invalid Bid");
  });

  it("should NOT init game (Player1 already chose)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    await expect(
      player1Instance.playerInit(isOdd, hashOptionP1In, { value: DEFAULT_BID }),
    ).to.be.revertedWith("Player1 already chose");
  });

  it("should quit game", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceOwnerbefore = await ethers.provider.getBalance(owner.address);
    let balanceContractBefore = await ethers.provider.getBalance(oddOrEven);

    const tx = await player1Instance.quitGame();
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    // Retrieve gas used and gas price
    const gasUsed = receipt!.gasUsed; // BigNumber
    const gasPrice = tx.gasPrice; // BigNumber
    // Calculate the fee (gas used * gas price)
    const fee = gasUsed * gasPrice;

    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceOwnerafter = await ethers.provider.getBalance(owner.address);
    let balanceContractAfter = await ethers.provider.getBalance(oddOrEven);

    let gameData = fetchGameData(await oddOrEven.gameData());

    //Verificação da distribuição de saldo do contrato após o cancelamento
    expect(
      balanceOwnerafter -
        balanceOwnerbefore +
        (balanceP1after - balanceP1before + BigInt(fee)),
    ).to.equal(balanceContractBefore);
    //Verificação do saldo do dono do contrato
    expect(
      balanceContractBefore - (balanceP1after - balanceP1before + BigInt(fee)),
    ).to.equal(balanceOwnerafter - balanceOwnerbefore);
    //Verificação do jogo resetado
    expect(gameData.hashOptionP1).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("should NOT quit game (Accepted)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(4, { value: DEFAULT_BID });

    await expect(player1Instance.quitGame()).to.be.revertedWith(
      "Cant quit game after other player accpetance",
    );
  });

  it("should NOT quit game (Not Player 1)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    await expect(player2Instance.quitGame()).to.be.revertedWith(
      "Only player1 can quit the game",
    );
  });

  it("should accept game", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);

    let keygame: string = gameKey.substring(2, gameKey.length);
    let optionP1In: number = 3;
    let optionP1str = optionP1In.toString(16);

    while (optionP1str.length % 2 === 1) optionP1str = "0" + optionP1str;

    let hashOptionP1In = ethers.keccak256(
      hexStringToUint8Array(keygame + optionP1str),
    );

    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    let balanceOwnerbefore = await ethers.provider.getBalance(owner.address);
    let balanceContractBefore = await ethers.provider.getBalance(oddOrEven);

    await player2Instance.acceptGame(4, { value: DEFAULT_BID });

    let balanceOwnerafter = await ethers.provider.getBalance(owner.address);
    let balanceContractAfter = await ethers.provider.getBalance(oddOrEven);

    gameData = fetchGameData(await oddOrEven.gameData());

    //Verificação do saldo do dono do contrato
    expect(
      balanceOwnerafter - balanceOwnerbefore + balanceContractAfter,
    ).to.equal(2n * balanceContractBefore);
    //Verificação do jogo aceito
    expect(gameData.optionP2).to.equal(4);
  });
  
  it("should NOT accept game (Already Accepted)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(4, { value: DEFAULT_BID });

    const player3Instance = oddOrEven.connect(owner);

    // gameData = fetchGameData(await oddOrEven.gameData());
    // await ethers.provider.send("evm_setNextBlockTimestamp", [Number(gameData.nLockTime) + 1]);
    // await ethers.provider.send("evm_mine", []);

    await expect(
      player3Instance.acceptGame(5, { value: DEFAULT_BID }),
    ).to.be.revertedWith("Game Already Accepted");
  });

  it("should NOT accept game (Negative Option)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    await expect(
      player2Instance.acceptGame(-4, { value: DEFAULT_BID }),
    ).to.be.revertedWith("Cannot accept negative numbers");
  });

  it("should NOT accept game (Invalid Amount)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    await expect(
      player2Instance.acceptGame(4, { value: DEFAULT_BID + 1n }),
    ).to.be.revertedWith("Invalid amount");
  });

  // This check exists for BTC portability. On ETH, block timestamps always
  // increase, so block.timestamp == nLockTime can only occur in the same block
  // as playerInit — which network.create() does not allow without
  // allowBlocksWithSameTimestamp (not supported by the isolated EDR network).
  it.skip("should NOT accept game (Timestap == Nlocktime)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime),
    ]);

    await expect(
      player2Instance.acceptGame(4, { value: DEFAULT_BID }),
    ).to.be.revertedWith("TX locktime cant be lower than base locktime");
  });

  it("should NOT accept game (Timout Player 1)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(3);
    let isOdd = false;

    const latestBlock = await ethers.provider.getBlock("latest");
    //const latestTimestamp = latestBlock.timestamp;

    if (latestBlock) {
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        latestBlock.timestamp + 2,
      ]);
      await ethers.provider.send("evm_mine", []);
    }

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + Number(gameData.timeOut) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      player2Instance.acceptGame(4, { value: DEFAULT_BID }),
    ).to.be.revertedWith("Cannot accept after player 1 timeout");
  });

  it("should NOT result game (Not Accepted)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = 3;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      player1Instance.resultGame(hexStringToUint8Array(keygame), optionP1In),
    ).to.revertedWith("Cant verify result before player 2 accpetance");
  });

  it("should give victory to Player 1 ( 3 + 5 even)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = 3;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

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

    gameData = fetchGameData(await oddOrEven.gameData());

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  it("should give victory to Player 1 ( 3 + 4 odd)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = 3;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(4, { value: DEFAULT_BID });

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

    gameData = fetchGameData(await oddOrEven.gameData());

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  it("should give victory to Player 1 ( 2 + 4 even)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = 2;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = false;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(4, { value: DEFAULT_BID });

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

    gameData = fetchGameData(await oddOrEven.gameData());

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  it("should give victory to Player 1 ( 2 + 5 odd)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = 2;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

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

    gameData = fetchGameData(await oddOrEven.gameData());

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after > balanceP1before).to.equal(true);
    expect(balanceP2after == balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  it("should give victory to Player 2 (wrong p1 keygame)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = 2;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    await player1Instance.resultGame(
      hexStringToUint8Array(keygame.substring(0, keygame.length - 2) + "ab"),
      optionP1In,
    );

    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    gameData = fetchGameData(await oddOrEven.gameData());

    expect(balanceP1after <= balanceP1before).to.equal(true);
    expect(balanceP2after > balanceP2before).to.equal(true);
  });

  it("should give victory to Player 2 (wrong p1 option)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = 2;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    await player1Instance.resultGame(
      hexStringToUint8Array(keygame),
      optionP1In - 1,
    );

    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    gameData = fetchGameData(await oddOrEven.gameData());

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after <= balanceP1before).to.equal(true);
    expect(balanceP2after > balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  it("should give victory to Player 2 (negative p1 option)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const optionP1In = -2;
    const { keygame, hash: hashOptionP1In } = buildCommit(optionP1In);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

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

    gameData = fetchGameData(await oddOrEven.gameData());

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after <= balanceP1before).to.equal(true);
    expect(balanceP2after > balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal(gameKey);
  });

  it("should claim game", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(2);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

    gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.timeOutP2) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    let balanceP1before = await ethers.provider.getBalance(player1.address);
    let balanceP2before = await ethers.provider.getBalance(player2.address);
    let balanceContract = await ethers.provider.getBalance(oddOrEven);

    await player2Instance.claimGame();

    let balanceP1after = await ethers.provider.getBalance(player1.address);
    let balanceP2after = await ethers.provider.getBalance(player2.address);
    balanceContract = await ethers.provider.getBalance(oddOrEven);

    gameData = fetchGameData(await oddOrEven.gameData());

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(balanceP1after == balanceP1before).to.equal(true);
    expect(balanceP2after > balanceP2before).to.equal(true);
    expect(gameDataLast.keyGame).to.equal("0x");
  });

  it("should NOT claim game (Not Accepted)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(2);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await expect(player2Instance.claimGame()).to.be.revertedWith(
      "Only accepted game can be claimed",
    );
  });

  it("should NOT claim game (Timeout P2)", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(2);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

    gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.timeOutP2) - 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await expect(player2Instance.claimGame()).to.be.revertedWith(
      "Game can only be claimed afther Player 2 timeout",
    );
  });

  it("should Init game again", async function () {
    const player1Instance = oddOrEven.connect(player1);
    const player2Instance = oddOrEven.connect(player2);
    const { hash: hashOptionP1In } = buildCommit(2);
    let isOdd = true;

    await player1Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.nLockTime) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.acceptGame(5, { value: DEFAULT_BID });

    gameData = fetchGameData(await oddOrEven.gameData());

    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(gameData.timeOutP2) + 1,
    ]);
    await ethers.provider.send("evm_mine", []);

    await player2Instance.claimGame();

    await player2Instance.playerInit(isOdd, hashOptionP1In, {
      value: DEFAULT_BID,
    });

    let gameDataLast = fetchGameData(await oddOrEven.lastGameRecord());

    expect(gameDataLast.hashOptionP1).to.equal(hashOptionP1In);
  });
});
