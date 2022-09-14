const Coin = artifacts.require("Coin");
const EuphoriaBettingUpgradeable = artifacts.require("EuphoriaBettingUpgradeable");
const EuphoriaBettingUpgradeableV2 = artifacts.require("EuphoriaBettingUpgradeableV2");

const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const { deployProxy, upgradeProxy } = require("@openzeppelin/truffle-upgrades");

contract("BettingV2", async accounts => {
    const owner = accounts[0];
    const firstUser = accounts[1];
    const secondUser = accounts[2];

    const MINIMAL_BET_AMOUNT = 1000;
    const MatchResult = {
        HOME: 0,
        AWAY: 1,
        DRAW: 2
    }
    const MatchTypeId = {
        FOOTBALL: 1000,
        TENNIS: 2000,
        ESPORTS: 3000
    }

    const WALLET_BALANCE_PAYMENT = 2

    const MINUTE = 60

    var bettingV2;
    var coin;

    getCurrentTimestampInSeconds = () => Date.now() / 1000 | 0

    beforeEach(async () => {
        coin = await Coin.new("Test", "TST", 15000, owner);
        await coin.transfer(firstUser, 5000, { from: owner });
        await coin.transfer(secondUser, 5000, { from: owner });

        bettingV2 = await deployProxy(EuphoriaBettingUpgradeableV2, [web3.utils.asciiToHex(""), [], [], [], []], { from: owner, initializer: "__EuphoriaBetting_init" });
    });
    describe("upgrade from V1 version", () => {
        let bettingV1;
        let matchId;
        let matchTypeId = MatchTypeId.FOOTBALL;
        beforeEach(async () => {
            matchId = 1;
            bettingV1 = await deployProxy(EuphoriaBettingUpgradeable, [web3.utils.asciiToHex(""), [], [], [], []], { from: owner, initializer: "__EuphoriaBetting_init" });
        });
        it("should add new field 'matchesV2'", async () => {
            assert.throws(() => { bettingV1.getMatchDataV2(matchId); }, "bettingV1.getMatchDataV2 is not a function");
            let upgradedBetting = await upgradeProxy(bettingV1.address, EuphoriaBettingUpgradeableV2, { kind: "uups", unsafeSkipStorageCheck: true });
            assert.equal(upgradedBetting.address, bettingV1.address);
            let matchV2Data = await upgradedBetting.getMatchDataV2(matchTypeId, matchId);
            assert.containsAllKeys(matchV2Data, ["id", "typeId", "odds", "startTimestamp", "isFinished"]);
        });
        it("should not break storage layout", async () => {
            let tokenAsset = { addr: coin.address, amount: MINIMAL_BET_AMOUNT };
            await coin.approve(bettingV1.address, tokenAsset.amount, { from: firstUser });
            await bettingV1.addFunds(tokenAsset, { from: firstUser });

            let firstUserBalance = await bettingV1.balances(firstUser, coin.address);
            assert.equal(firstUserBalance.toNumber(), tokenAsset.amount);

            let upgradedBetting = await upgradeProxy(bettingV1.address, EuphoriaBettingUpgradeableV2, { kind: "uups", unsafeSkipStorageCheck: true });
            let firstUserBalanceAfterUpgrade = await upgradedBetting.balances(firstUser, coin.address);
            assert.equal(firstUserBalanceAfterUpgrade.toNumber(), tokenAsset.amount);
        });
    });
    describe("makeBet with signature", () => {
        let signature;
        let newMatchV2Data = { id: 1, typeId: MatchTypeId.FOOTBALL, odds: [{ matchResult: MatchResult.AWAY, value: 150 }], startTimestamp: 1, isFinished: false, salt: 1 };
        let betV2;
        beforeEach(async () => {
            newMatchV2Data.startTimestamp = getCurrentTimestampInSeconds() + MINUTE;
            let matchHash = await bettingV2.getMatchDataV2Hash(newMatchV2Data);
            signature = await web3.eth.sign(matchHash, owner);

            betV2 = {
                bettor: firstUser,
                matchId: newMatchV2Data.id,
                matchTypeId: newMatchV2Data.typeId,
                betOn: MatchResult.AWAY,
                asset: {
                    addr: coin.address,
                    amount: MINIMAL_BET_AMOUNT
                },
                salt: 1
            };

            await coin.approve(bettingV2.address, betV2.asset.amount, { from: firstUser });
            await coin.approve(bettingV2.address, betV2.asset.amount, { from: secondUser });
        });
        it("should open match", async () => {
            await bettingV2.makeBetWithSignature(betV2, WALLET_BALANCE_PAYMENT, newMatchV2Data, signature, { from: firstUser });
            let matchV2Data = await bettingV2.getMatchDataV2(betV2.matchTypeId, betV2.matchId);

            assert.deepEqual(
                [matchV2Data.id, matchV2Data.typeId, matchV2Data.odds[0].matchResult, matchV2Data.odds[0].value, matchV2Data.startTimestamp, matchV2Data.isFinished],
                [newMatchV2Data.id.toString(), newMatchV2Data.typeId.toString(), newMatchV2Data.odds[0].matchResult.toString(), newMatchV2Data.odds[0].value.toString(), newMatchV2Data.startTimestamp.toString(), newMatchV2Data.isFinished]
            );
        });
        it("should emit event 'MatchAdditionSingle'", async () => {
            let tx = await bettingV2.makeBetWithSignature(betV2, WALLET_BALANCE_PAYMENT, newMatchV2Data, signature, { from: firstUser });

            truffleAssert.eventEmitted(tx, "MatchAdditionSingle", event => {
                let isIdSame = event.newMatch.id == newMatchV2Data.id;
                let isTypeIdSame = event.newMatch.typeId == newMatchV2Data.typeId;
                let isOddsSame = event.newMatch.odds[0].matchResult == newMatchV2Data.odds[0].matchResult && event.newMatch.odds[0].value == newMatchV2Data.odds[0].value;
                let isStartTimestampSame = event.newMatch.startTimestamp == newMatchV2Data.startTimestamp;
                let isFinished = event.newMatch.isFinished == newMatchV2Data.isFinished;

                return isIdSame && isTypeIdSame && isOddsSame && isStartTimestampSame && isFinished;
            });
        });
        it("should emit event 'BetV2'", async () => {
            let tx = await bettingV2.makeBetWithSignature(betV2, WALLET_BALANCE_PAYMENT, newMatchV2Data, signature, { from: firstUser });

            truffleAssert.eventEmitted(tx, "BetV2", event => {
                let isBettorSame = event.bet.bettor == betV2.bettor;
                let isMatchIdSame = event.bet.matchId == betV2.matchId;
                let isMatchTypeIdSame = event.bet.matchTypeId == betV2.matchTypeId;
                let isBetOnSame = event.bet.betOn == betV2.betOn;
                let isERC20TokenSame = event.bet.ERC20Token == betV2.ERC20Token;
                let isAmountSame = event.bet.amount == betV2.amount;
                let isSaltSame = event.bet.salt == betV2.salt;
                return isBettorSame && isMatchIdSame && isMatchTypeIdSame && isBetOnSame && isERC20TokenSame && isAmountSame && isSaltSame;
            });
        });
        it("should revert if admin signature is not valid", async () => {
            let otherMatchV2Data = newMatchV2Data;
            otherMatchV2Data.id = 2;

            let matchHash = await bettingV2.getMatchDataV2Hash(otherMatchV2Data);
            let otherSignature = await web3.eth.sign(matchHash, owner);

            truffleAssert.reverts(bettingV2.makeBetWithSignature(betV2, WALLET_BALANCE_PAYMENT, newMatchV2Data, otherSignature), "sdf");
        });
    });
});