// SPDX-License-Identifier: MIT
pragma solidity >=0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "./libraries/LibBet.sol";
import "./libraries/LibMatch.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract EuphoriaBettingUpgradeableV2 is
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    using ECDSAUpgradeable for bytes32;
    using SafeERC20Upgradeable for IERC20;

    enum PaymentType {
        BALANCE,
        WALLET,
        WALLET_BALANCE
    }
    struct Odds {
        LibBet.MatchResult matchResult;
        uint256 value;
    }
    struct Match {
        uint256 id;
        Odds[] odds;
        uint256 startTimestamp;
        bool isFinished;
    }
    struct Reward {
        address bettor;
        LibBet.TokenAsset[] tokens;
    }

    bytes32 public merkleRoot;
    mapping(uint256 => Match) private matches; // Deprecated: Has used in V1 version
    mapping(address => mapping(address => uint256)) public balances;
    mapping(bytes32 => bool) public bets;

    mapping(address => uint256) public commissionBalance;
    mapping(uint256 => mapping(uint256 => LibMatch.MatchV2)) private matchesV2;

    event Bet(LibBet.Bet bet, uint256 odds); // Deprecated: Has used in V1 version
    event MatchAddition(Match[] matches); // Deprecated: Has used in V1 version
    event MatchCancel(uint256[] matches); // Deprecated: Has used in V1 version

    event BetV2(LibBet.BetV2 bet, uint256 odds);
    event MatchAdditionV2(LibMatch.MatchV2[] matches);
    event MatchAdditionSingle(LibMatch.MatchV2 newMatch);
    event MatchCancelV2(uint256[] matchesTypes, uint256[] matches);
    event MatchFinishedV2(
        uint256 matchTypeId,
        uint256 matchId,
        LibBet.MatchResult result
    );

    event MatchFinished(uint256 matchId, LibBet.MatchResult result); // Deprecated: Has used in V1 version
    event RewardsDistributed(Reward[] rewards);
    event MerkleRootUpdated(bytes32 merkleRoot);

    event Withdrawal(address bettor, address token, uint256 amount);

    function __EuphoriaBetting_init(
        bytes32 _merkleRoot,
        LibMatch.MatchV2[] calldata _matches,
        Reward[] calldata _balances,
        LibBet.BetV2[] calldata _bets,
        uint256[] calldata _betsOdds
    ) external initializer {
        __Ownable_init();
        __Pausable_init();
        __EuphoriaBetting_init_unchained(
            _merkleRoot,
            _matches,
            _balances,
            _bets,
            _betsOdds
        );
    }

    function __EuphoriaBetting_init_unchained(
        bytes32 _merkleRoot,
        LibMatch.MatchV2[] calldata _matches,
        Reward[] calldata _balances,
        LibBet.BetV2[] calldata _bets,
        uint256[] calldata _betsOdds
    ) internal onlyInitializing {
        require(
            _bets.length == _betsOdds.length,
            "Length of bets and betsOdds must be equal"
        );
        if (merkleRoot != _merkleRoot) {
            setMerkleRoot(_merkleRoot);
        }
        addMatches(_matches);
        if (_balances.length > 0) {
            distributeRewards(_balances);
        }
        emitBetEvents(_bets, _betsOdds);
    }

    function makeBet(LibBet.BetV2 calldata bet, PaymentType paymentType)
        external
        whenNotPaused
    {
        require(
            matchesV2[bet.matchTypeId][bet.matchId].startTimestamp >
                block.timestamp,
            "Match is not available for betting"
        );
        require(bet.bettor == msg.sender, "Bettor must be message sender");

        bytes32 betHash = hashBet(bet);
        require(!bets[betHash], "Bet has already been made");

        require(
            bet.asset.amount >= 1000,
            "Bet amount must be equal or greater than 1000"
        );

        uint256 bettorBalance = balances[msg.sender][bet.asset.addr];

        if (paymentType == PaymentType.BALANCE) {
            require(
                bettorBalance >= bet.asset.amount,
                "Not enough funds in balance"
            );
            balances[msg.sender][bet.asset.addr] -= bet.asset.amount;
        } else if (paymentType == PaymentType.WALLET) {
            IERC20 bettorToken = IERC20(bet.asset.addr);
            bettorToken.transferFrom(
                msg.sender,
                address(this),
                bet.asset.amount
            );
        } else if (paymentType == PaymentType.WALLET_BALANCE) {
            if (bettorBalance < bet.asset.amount) {
                IERC20 bettorToken = IERC20(bet.asset.addr);

                balances[msg.sender][bet.asset.addr] = 0;
                bettorToken.transferFrom(
                    msg.sender,
                    address(this),
                    bet.asset.amount - bettorBalance
                );
            } else {
                balances[msg.sender][bet.asset.addr] -= bet.asset.amount;
            }
        }

        uint256 odds = getOdds(bet);

        bets[betHash] = true;

        emit BetV2(bet, odds);
    }

    function makeBetWithSignature(
        LibBet.BetV2 calldata bet,
        PaymentType paymentType,
        LibMatch.MatchV2 calldata newMatch,
        bytes calldata signature
    ) external whenNotPaused {
        require(
            newMatch.startTimestamp > block.timestamp,
            "Match is not available for betting"
        );
        require(bet.bettor == msg.sender, "Bettor must be message sender");
        bytes32 betHash = hashBet(bet);
        require(!bets[betHash], "Bet has already been made");
        require(
            bet.asset.amount >= 1000,
            "Bet amount must be equal or greater than 1000"
        );

        addMatch(newMatch, signature);

        uint256 bettorBalance = balances[msg.sender][bet.asset.addr];

        if (paymentType == PaymentType.BALANCE) {
            require(
                bettorBalance >= bet.asset.amount,
                "Not enough funds in balance"
            );
            balances[msg.sender][bet.asset.addr] -= bet.asset.amount;
        } else if (paymentType == PaymentType.WALLET) {
            IERC20 bettorToken = IERC20(bet.asset.addr);
            bettorToken.transferFrom(
                msg.sender,
                address(this),
                bet.asset.amount
            );
        } else if (paymentType == PaymentType.WALLET_BALANCE) {
            if (bettorBalance < bet.asset.amount) {
                IERC20 bettorToken = IERC20(bet.asset.addr);

                balances[msg.sender][bet.asset.addr] = 0;
                bettorToken.transferFrom(
                    msg.sender,
                    address(this),
                    bet.asset.amount - bettorBalance
                );
            } else {
                balances[msg.sender][bet.asset.addr] -= bet.asset.amount;
            }
        }

        uint256 odds = getOdds(bet);

        bets[betHash] = true;

        emit BetV2(bet, odds);
    }

    function finishMatch(
        uint256 matchTypeId,
        uint256 matchId,
        LibBet.MatchResult result,
        bytes32 newMerkleRoot,
        Reward[] calldata rewards,
        LibBet.TokenAsset[] calldata commissions
    ) external onlyOwner whenNotPaused {
        require(
            matchesV2[matchTypeId][matchId].startTimestamp <= block.timestamp,
            "Match is not started"
        );
        require(
            !matchesV2[matchTypeId][matchId].isFinished,
            "Match already finished"
        );

        setMatchStatusFinished(matchTypeId, matchId);
        setMerkleRoot(newMerkleRoot);
        distributeRewards(rewards);
        updateCommissionBalance(commissions);

        emit MatchFinishedV2(matchTypeId, matchId, result);
    }

    function cancelMatches(
        uint256[] calldata matchTypeIds,
        uint256[] calldata matchIds,
        Reward[] calldata rewards
    ) external onlyOwner whenNotPaused {
        require(matchIds.length > 0, "Length of matches must not be zero");
        require(
            matchTypeIds.length == matchIds.length,
            "Length of match typeIds and ids must be the same"
        );
        for (uint256 i; i < matchIds.length; i++) {
            matchesV2[matchTypeIds[i]][matchIds[i]].startTimestamp = block
                .timestamp;
        }

        if (rewards.length > 0) {
            distributeRewards(rewards);
        }

        emit MatchCancelV2(matchTypeIds, matchIds);
    }

    function addFunds(LibBet.TokenAsset memory asset) external whenNotPaused {
        IERC20 token = IERC20(asset.addr);
        balances[msg.sender][asset.addr] += asset.amount;
        token.transferFrom(msg.sender, address(this), asset.amount);
    }

    function addRewards(Reward[] calldata rewards)
        external
        onlyOwner
        whenNotPaused
    {
        for (uint256 i; i < rewards.length; i++) {
            for (uint256 j; j < rewards[i].tokens.length; j++) {
                IERC20 token = IERC20(rewards[i].tokens[j].addr);
                token.transferFrom(
                    msg.sender,
                    address(this),
                    rewards[i].tokens[j].amount
                );
            }
        }
        distributeRewards(rewards);
    }

    function withdraw(address token, uint256 amount) external whenNotPaused {
        require(
            balances[msg.sender][token] >= amount,
            "Insufficient token amount"
        );

        balances[msg.sender][token] -= amount;
        IERC20(token).transfer(msg.sender, amount);

        emit Withdrawal(msg.sender, token, amount);
    }

    function transferCommission(
        address recipient,
        LibBet.TokenAsset[] calldata assets
    ) external onlyOwner whenNotPaused {
        for (uint256 i; i < assets.length; i++) {
            IERC20(assets[i].addr).transfer(recipient, assets[i].amount);
            commissionBalance[assets[i].addr] -= assets[i].amount;
        }
    }

    function verifyMerkleRoot(bytes32[] calldata proof, bytes32 leaf)
        external
        view
        returns (bool)
    {
        return MerkleProof.verify(proof, merkleRoot, leaf);
    }

    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    // Deprecated: Has used in V1 version
    function getMatchData(uint256 matchId)
        external
        view
        returns (Match memory)
    {
        return matches[matchId];
    }

    function getMatchDataV2(uint256 matchTypeId, uint256 matchId)
        external
        view
        returns (LibMatch.MatchV2 memory)
    {
        return matchesV2[matchTypeId][matchId];
    }

    function getMatchDataV2Hash(LibMatch.MatchV2 calldata _match)
        external
        pure
        returns (bytes32)
    {
        return LibMatch.hash(_match);
    }

    function addMatches(LibMatch.MatchV2[] calldata _matches)
        public
        onlyOwner
        whenNotPaused
    {
        for (uint256 i; i < _matches.length; i++) {
            matchesV2[_matches[i].typeId][_matches[i].id] = _matches[i];
        }

        emit MatchAdditionV2(_matches);
    }

    function addMatch(
        LibMatch.MatchV2 calldata newMatch,
        bytes calldata signature
    ) public whenNotPaused {
        bytes32 matchHash = LibMatch.hash(newMatch);
        require(
            isAdminSignatureValid(matchHash, signature),
            "Signature is not valid"
        );
        matchesV2[newMatch.typeId][newMatch.id] = newMatch;

        emit MatchAdditionSingle(newMatch);
    }

    // Deprecated: Has used in V1 version
    function getOdds(LibBet.Bet calldata bet)
        internal
        view
        returns (uint256 odds)
    {
        Match storage matchData = matches[bet.matchId];

        bool isBetOnInMatchOdds = false;
        for (uint256 i; i < matchData.odds.length; i++) {
            if (bet.betOn == matchData.odds[i].matchResult) {
                odds = matchData.odds[i].value;
                isBetOnInMatchOdds = true;
                break;
            }
        }

        require(isBetOnInMatchOdds, "Match has not odds for bet.betOn result");
    }

    function getOdds(LibBet.BetV2 calldata bet)
        internal
        view
        returns (uint256 odds)
    {
        LibMatch.MatchV2 storage matchData = matchesV2[bet.matchTypeId][
            bet.matchId
        ];

        bool isBetOnInMatchOdds = false;
        for (uint256 i; i < matchData.odds.length; i++) {
            if (bet.betOn == matchData.odds[i].matchResult) {
                odds = matchData.odds[i].value;
                isBetOnInMatchOdds = true;
                break;
            }
        }

        require(isBetOnInMatchOdds, "Match has not odds for bet.betOn result");
    }

    function hashBet(LibBet.Bet calldata bet) public pure returns (bytes32) {
        return LibBet.hash(bet);
    }

    function hashBet(LibBet.BetV2 calldata bet) public pure returns (bytes32) {
        return LibBet.hash(bet);
    }

    function isAdminSignatureValid(bytes32 hash, bytes calldata signature)
        internal
        view
        returns (bool)
    {
        return owner() == hash.toEthSignedMessageHash().recover(signature);
    }

    function setMatchStatusFinished(uint256 matchTypeId, uint256 matchId)
        internal
    {
        matchesV2[matchTypeId][matchId].isFinished = true;
    }

    function distributeRewards(Reward[] calldata rewards) internal {
        require(rewards.length > 0, "Rewards must not be empty");
        for (uint256 i; i < rewards.length; i++) {
            processReward(rewards[i]);
        }

        emit RewardsDistributed(rewards);
    }

    function processReward(Reward calldata reward) internal {
        for (uint256 i; i < reward.tokens.length; i++) {
            LibBet.TokenAsset memory token = reward.tokens[i];
            balances[reward.bettor][token.addr] += token.amount;
        }
    }

    function updateCommissionBalance(LibBet.TokenAsset[] calldata commissions)
        internal
    {
        for (uint256 i; i < commissions.length; i++) {
            commissionBalance[commissions[i].addr] += commissions[i].amount;
        }
    }

    function setMerkleRoot(bytes32 newMerkleRoot) internal {
        require(
            newMerkleRoot != merkleRoot,
            "New merkleRoot must not be the same as the old one"
        );
        merkleRoot = newMerkleRoot;

        emit MerkleRootUpdated(merkleRoot);
    }

    function emitBetEvents(
        LibBet.BetV2[] calldata _bets,
        uint256[] calldata _betsOdds
    ) internal onlyInitializing {
        for (uint256 i; i < _bets.length; i++) {
            emit BetV2(_bets[i], _betsOdds[i]);
        }
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    uint256[49] private __gap;
}
