// SPDX-License-Identifier: MIT
pragma solidity >=0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LibBetV2.sol";

contract EuphoriaBettingUpgradeableV2Test is
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    enum PaymentType {
        BALANCE,
        WALLET,
        WALLET_BALANCE
    }
    struct Odds {
        LibBetV2.MatchResult matchResult;
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
        LibBetV2.TokenAsset[] tokens;
    }

    bytes32 public merkleRoot;
    mapping(uint256 => Match) private matches;
    mapping(address => mapping(address => uint256)) public balances;
    mapping(bytes32 => bool) public bets;

    mapping(address => uint256) public commissionBalance;

    event Bet(LibBetV2.Bet bet, uint256 odds);
    event MatchAddition(Match[] matches);
    event MatchCancel(uint256[] matches);

    event MatchFinished(uint256 matchId, LibBetV2.MatchResult result);
    event RewardsDistributed(Reward[] rewards);
    event MerkleRootUpdated(bytes32 merkleRoot);
    event CommissionBalanceUpdatedBy(LibBetV2.TokenAsset[] commissions);

    event Withdrawal(address bettor, address token, uint256 amount);

    function __EuphoriaBetting_init(
        bytes32 _merkleRoot,
        Match[] calldata _matches,
        Reward[] calldata _balances,
        LibBetV2.Bet[] calldata _bets,
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
        Match[] calldata _matches,
        Reward[] calldata _balances,
        LibBetV2.Bet[] calldata _bets,
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

    function makeBet(LibBetV2.Bet calldata bet, PaymentType paymentType)
        external
        whenNotPaused
    {
        require(
            matches[bet.matchId].startTimestamp > block.timestamp,
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
            require(
                bettorToken.allowance(msg.sender, address(this)) >=
                    bet.asset.amount,
                "Insufficient allowance"
            );
            bettorToken.transferFrom(
                msg.sender,
                address(this),
                bet.asset.amount
            );
        } else if (paymentType == PaymentType.WALLET_BALANCE) {
            if (bettorBalance < bet.asset.amount) {
                IERC20 bettorToken = IERC20(bet.asset.addr);
                require(
                    bettorToken.allowance(msg.sender, address(this)) >=
                        bet.asset.amount - bettorBalance,
                    "Insufficient allowance"
                );

                bettorToken.transferFrom(
                    msg.sender,
                    address(this),
                    bet.asset.amount - bettorBalance
                );
                balances[msg.sender][bet.asset.addr] = 0;
            } else {
                balances[msg.sender][bet.asset.addr] -= bet.asset.amount;
            }
        }

        uint256 odds = getOdds(bet);

        bets[betHash] = true;

        emit Bet(bet, odds);
    }

    function finishMatch(
        uint256 matchId,
        LibBetV2.MatchResult result,
        bytes32 newMerkleRoot,
        Reward[] calldata rewards,
        LibBetV2.TokenAsset[] calldata commissions
    ) external onlyOwner whenNotPaused {
        require(
            matches[matchId].startTimestamp <= block.timestamp,
            "Match is not started"
        );
        require(!matches[matchId].isFinished, "Match already finished");

        setMatchStatusFinished(matchId);
        setMerkleRoot(newMerkleRoot);
        distributeRewards(rewards);
        updateCommissionBalance(commissions);

        emit MatchFinished(matchId, result);
    }

    function cancelMatches(
        uint256[] calldata match_ids,
        Reward[] calldata rewards
    ) external onlyOwner whenNotPaused {
        require(match_ids.length > 0, "Length of matches must not be zero");
        for (uint256 i; i < match_ids.length; i++) {
            matches[match_ids[i]].startTimestamp = block.timestamp;
        }

        if (rewards.length > 0) {
            distributeRewards(rewards);
        }

        emit MatchCancel(match_ids);
    }

    function addFunds(LibBetV2.TokenAsset memory asset) external whenNotPaused {
        IERC20 token = IERC20(asset.addr);
        require(
            token.allowance(msg.sender, address(this)) >= asset.amount,
            "Insufficient allowance"
        );

        token.transferFrom(msg.sender, address(this), asset.amount);
        balances[msg.sender][asset.addr] += asset.amount;
    }

    function withdraw(address token, uint256 amount) external whenNotPaused {
        require(
            balances[msg.sender][token] >= amount,
            "Insufficient token amount"
        );

        IERC20(token).transfer(msg.sender, amount);
        balances[msg.sender][token] -= amount;

        emit Withdrawal(msg.sender, token, amount);
    }

    function transferCommission(
        address recipient,
        LibBetV2.TokenAsset[] calldata assets
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

    function getMatchData(uint256 matchId)
        external
        view
        returns (Match memory)
    {
        return matches[matchId];
    }

    function addMatches(Match[] calldata _matches)
        public
        onlyOwner
        whenNotPaused
    {
        for (uint256 i; i < _matches.length; i++) {
            matches[_matches[i].id] = _matches[i];
        }

        emit MatchAddition(_matches);
    }

    function getOdds(LibBetV2.Bet calldata bet)
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

    function hashBet(LibBetV2.Bet calldata bet) public pure returns (bytes32) {
        return LibBetV2.hash(bet);
    }

    function setMatchStatusFinished(uint256 matchId) internal {
        matches[matchId].isFinished = true;
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
            LibBetV2.TokenAsset memory token = reward.tokens[i];
            balances[reward.bettor][token.addr] += token.amount;
        }
    }

    function updateCommissionBalance(LibBetV2.TokenAsset[] calldata commissions)
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
        LibBetV2.Bet[] calldata _bets,
        uint256[] calldata _betsOdds
    ) internal onlyInitializing {
        for (uint256 i; i < _bets.length; i++) {
            emit Bet(_bets[i], _betsOdds[i]);
        }
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    function newMethod() external pure returns (uint256) {
        return 10;
    }

    uint256[50] private __gap;
}
