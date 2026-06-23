// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import "./Keccak256Utils.sol";

/**
 * @title Contract Odd or Even Peer-to-Peer
 * @author Carlos Augusto de Moraes Cruz && Moisés Silva
 * @notice Provably Fair Gameplay - On-Chain Verification - Timeout Mechanism
 */
contract OddOrEven{

    // Struct to group all game-related fields
    struct GameData {
        bytes32 hashOptionP1;   // Hash of Player 1's option
        uint64 timeOut;        // Timeout duration in seconds
        uint256 timeOutP1;     // Player 1 timeout timestamp
        uint256 timeOutP2;     // Player 2 timeout timestamp
        uint256 nLockTime;     // Lock time for the game
        bool isOdd;            // Whether the game is Odd/Even
        address player1;       // Player 1's address
        address player2;       // Player 2's address
        int8 optionP1;         // Player 1's option
        int8 optionP2;         // Player 2's option
        bytes keyGame;         // Player 1's keyGame
    }

    GameData public gameData; // Instance of the struct
    GameData public lastGameRecord; // Keep the state of the last game until the end of the next

    address payable public immutable owner; // Immutable owner field
    uint256 public bidMin = 0.01 ether; // Valor mínimo para aposta. Se for aumentado (e pode ser), o player 2 precisa cobrir, pois, o bid passa a ser o novo valor.
    uint8 public commission = 1;      // Commission percentage. O criador do contrato ganha 1% sobre esse valor.

    constructor(){
        owner = payable (msg.sender);
        gameData.hashOptionP1 = 0; //hash da opcao do jogador 1
        gameData.timeOut = 60 * 20; // 20 min;
        gameData.timeOutP1 = 0; // Duração do lance do jogador 1, depois dele, o jogador 2 não pode mais aceitar o desafio, e o jogador 1 pode reivindicar a vitória ou cancelar o jogo;
        gameData.timeOutP2 = 0; // Tempo que o contrat espera para que o jogador 1 responda depois do jogador 2 aceitar o desafio, depois disso o jogador 2 pode reivindicar a vitória;
        gameData.nLockTime = 0; // Anti fraude na rede btc, portabilidade. 
        gameData.isOdd = true; //EVEN or ODD, only player 1 chooses
        gameData.player1 = address(0);
        gameData.player2 = address(0);
        gameData.optionP2 = -1; // Número escolhido pelo jogador 2.   
        gameData.optionP1 = -1; // Número escolhido pelo jogador 1, só é revelado no final do jogo, para evitar que o jogador 2 possa escolher um número que garanta a vitória.
        gameData.keyGame = new bytes(0); // Chave que valida o número escolhido pelo jogador 1. 

        lastGameRecord = gameData;
    }

    // Novo valor minimo de aposta
    function setBid(uint256 newBid) external{
        require(msg.sender == owner, "You do not have permission");
        require (gameData.hashOptionP1 == 0, "You can not change the comission with a game in progress");
        bidMin = newBid;
    }

    // Nova comissão da plataforma
    function setComission(uint8 newComission) external{
        require(msg.sender == owner, "You do not have permission");
        require (gameData.hashOptionP1 == 0, "You can not change the comission with a game in progress");
        commission = newComission;
    }

    // Após finalizar o jogo, o reset deve ser chamado. 
    // O estado da ultima partida fica registrado em lastGameRecord
    function resetGameFields() private{

        lastGameRecord = gameData; // mantem o estado do último jogo para consulta;

        gameData.hashOptionP1 = 0; //hash da opcao do jogador 1
        gameData.player1 = address(0);
        gameData.player2 = address(0);
        gameData.optionP2 = -1;
        gameData.optionP1 = -1;
        gameData.keyGame = new bytes(0);

        /** 
            Caso nao retorne o valor minimo para aposta, o valor da aposta casada pelo 
            jogador 1 continua sendo o valor minimo para a próxima partida, 
            até que o dono do contrato altere esse valor. 
        */
        // bidMin = 0.01 ether; 
    }

    /**
     * Inicio de uma partida;
     * 
     * O hashOptionP1In informado pelo jogador um deve ser proviniente 
     * de uma chave de 32 bytes e mais um valor OptionP1 int8 positivo.
     * 
     * Caso OptionP1 seja negativo o resultado levará a vitória altomático do jogador 2
     * no momento que o resultado do jogo for informado  
     *
     * O jogador 1 deve estar atento à temporização do jogo para evitar ficar sem tempo hábil 
     * para responder antes que o resultado seja reivindicado pelo jogador 2.
     *  
     */
    function playerInit (bool isOddIn, bytes32 hashOptionP1In) public payable {

        // Valida as condições para iniciar o jogo: valor mínimo da aposta, e se o jogador 1 já escolheu uma opção para a partida atual.
        require (msg.value >= bidMin, "Invalid Bid");
        require (gameData.hashOptionP1 == 0, "Player1 already chose"); // opção e o hash do jogador (par ou ímpar + a key).

        bidMin = msg.value; // o minimo agora é o valor casado pelo jogador 1. Oplayer 2 precisa igualar ou cobrir.

        gameData.isOdd = isOddIn;
        gameData.hashOptionP1 = hashOptionP1In;
        gameData.player1 = msg.sender;

        gameData.nLockTime = block.timestamp; // O timesatmp do bloco que esta sendo processado.
        gameData.timeOutP1 = gameData.nLockTime + gameData.timeOut; // Tempo do bloco atual mais 20 minutos.
        gameData.timeOutP2 = gameData.timeOutP1; // essa liknha garante que o timeout do player 2 seja a mesma do player 1 ate que o jogo seja iniciado.
    }

     /**
     * O jogador 1 pode cancelar o jogo a qualquer momento, enquanto o desafio não for aceito;
     * 
     * Depois de aceito, o jogo não pode mais ser cancelado;
     * 
     * No caso de um jogo ainda não aceito, o jogador 1 deve ficar atento na seguinte temporização do jogo
     * para evitar ficar sem tempo hábil para responder antes que o resultado seja reivindicado pelo jogador 2.
     * 
     */
    function quitGame() public {
        // o jogo so pode  ser finalizado aqui se ninguem aparecer para jogar (player 2), ou o 
        // player 1 desistir antes dos 20 minutos de espera, ou seja, antes do timeout do player 1.

        // valida as condições acima.
        require(gameData.optionP2 == -1, "Cant quit game after other player accpetance");
        require(msg.sender == gameData.player1, "Only player1 can quit the game");

        // Devolve o saldo ao player 1 (menos o perc do owner).
        address contractAddress = address(this); 
        payable(
            gameData.player1).transfer(  // player 1 recebe do contranto
                (contractAddress.balance / 100) * (100 - commission) // o valor calculado
        );

        // exemplo: payable(endereço_destino).transfer(endereço_origem)

        // Paga o perc. ao owner pelo uso do contrato.
        owner.transfer(contractAddress.balance); // pega o resto que sobrar no contrato.
        resetGameFields();
    }

    /**
     * Qualquer usuário pode aceitar o desafio de durante o tempo de espera do jogador 1
     * 
     * O valor da aposta casada pelo jogador 2 será o mesmo valor oferecido pelo jogador 1
     * 
     */
    function acceptGame (int8 optionP2In) public payable { // o option é a paridade escolhida pelo player 2 (hash = numero + key).
        require (gameData.optionP2 == -1, 'Game Already Accepted' );
        require (optionP2In > -1, 'Cannot accept negative numbers' ); // a paridade escolhida pelo jogador 2 deve ser um número positivo, caso contrário, o resultado do jogo levará a vitória automática do jogador 1.
        require (msg.value == bidMin, "Invalid amount");
        
        //Não existe zero confims no ETH então block.timestamp > gameData.nLockTime
        require (block.timestamp > gameData.nLockTime, "TX locktime cant be lower than base locktime"); // no btc isso é uma previsão, no eth não funciona. Está aqui apenas para compatibilidade
        require (block.timestamp <= gameData.timeOutP1, "Cannot accept after player 1 timeout"); // O jogo não é mais aceito se passar o período definido no construtor (20 min).

        owner.transfer((address(this).balance / 100) * commission);//pagamento da comissão ao dono do contrato instantaneamente.

        gameData.player2 = msg.sender; // atribui o endereço do jogador 2
        gameData.timeOutP2 = block.timestamp + ( 2 * gameData.timeOut ); // atribui o tempo do jogador 2 (20 min + o momento atual do jogador 1, isso pode varias de 20 a 40 min para o jogador 2).
        gameData.optionP2 = optionP2In; // atribui a paridade do jogador 2
    }

    /**
     * Este metodo apresenta o resultado do desfio depois que o jogador 2 aceitou o jogo
     * Apenas jogador 1 pode chamar este metodo;
     * 
     * optionP1In não pode ser menor que zero
     *  
     */
    function resultGame (bytes memory keygame, int8 optionP1In) public payable {
        // apenas o jogador 1 chama esse metodo.
        // o jogador 2 ganha se o 1 nao apresentar o resultado.
        // o jogador 1 ganha so se o hash estiver batendo com o hash inicial e dentro do timeout.

        require (msg.sender == gameData.player1, "You cannot result a game");
        // o jogador 1 nao pode esperar acabar o tempo do jogador 2 para requisitar a vitoria, caso tenha vencido. senao ele perde.
        require(gameData.optionP2 > -1, "Cant verify result before player 2 accpetance");
        uint8 oddness = gameData.isOdd ? 1: 0; // estrutura ternária para verificar se a paridade do jogador 1, se par ou impar.

        gameData.keyGame = keygame;
        gameData.optionP1 = optionP1In;

        if(
            (keccak256(Keccak256Utils.appendByteToBytes(keygame, optionP1In)) == gameData.hashOptionP1) // aqui defino se jogador um apresenta a mesma paridade que definou inicialmente. 
            && (uint8(optionP1In + gameData.optionP2) % 2 == oddness)  // aqui é onde a soma das paridades define se é par ou impar
            && (optionP1In > -1) // aqui verifico se a entrada 1 nao é negativa
        ){

            payable(gameData.player1).transfer(address(this).balance);
        }
        else{
            payable(gameData.player2).transfer(address(this).balance);
        }

        resetGameFields();
    }

    /*
     * Se o jogador 1 não responder até o time-out do jogador 2, então este método pode ser acionado
     *   
     */
    function claimGame () public {
        require (gameData.optionP2 > -1, 'Only accepted game can be claimed' );
        require (block.timestamp > gameData.timeOutP2, "Game can only be claimed afther Player 2 timeout");
        payable(gameData.player2).transfer(address(this).balance);
        resetGameFields();
    }   
}