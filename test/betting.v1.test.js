const Coin = artifacts.require("Coin");
const EuphoriaBettingUpgradeable = artifacts.require("EuphoriaBettingUpgradeable");
const EuphoriaBettingUpgradeableV2Test = artifacts.require("EuphoriaBettingUpgradeableV2Test");
const EuphoriaBettingUpgradeableV2 = artifacts.require("EuphoriaBettingUpgradeableV2");

const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const { deployProxy, upgradeProxy } = require("@openzeppelin/truffle-upgrades");

contract("Betting", async accounts => {
    let coin;
    let betting;

    const owner = accounts[0]
    const homeBettor = accounts[1]
    const awayBettor = accounts[2]
    const recipient = accounts[3]

    const HOME = 0
    const AWAY = 1
    const DRAW = 2

    const firstMatch = {
        id: 1,
        odds: [
            {
                matchResult: HOME,
                value: 200
            },
            {
                matchResult: AWAY,
                value: 150
            }
        ]
    }

    const secondMatch = {
        id: 2,
        odds: [
            {
                matchResult: HOME,
                value: 150
            },
            {
                matchResult: AWAY,
                value: 200
            }
        ]
    }

    const MINUTE = 60
    const HOUR = 60 * MINUTE

    const BALANCE_PAYMENT = 0
    const WALLET_PAYMENT = 1
    const WALLET_BALANCE_PAYMENT = 2

    getCurrentTimestampInSeconds = () => Date.now() / 1000 | 0

    async function playMatchWithTwoBettorsWithHOMEWinningTeam() {
        await coin.approve(betting.address, allowance, { from: awayBettor });
        away_bet = {
            bettor: awayBettor,
            matchId: firstMatch.id,
            betOn: betOnAway,
            asset: {
                addr: coin.address,
                amount: amount
            },
            salt: salt
        };

        await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });
        await betting.makeBet(away_bet, WALLET_BALANCE_PAYMENT, { from: awayBettor });

        firstMatch.startTimestamp = getCurrentTimestampInSeconds() - MINUTE;
        await betting.addMatches([firstMatch], { from: owner });

        merkleRoot = "0xb266e19caa8c9ffb2d30865237e16f1db1e6e88e87a677f341811639af88afe3";
        rewards = [{ bettor: homeBettor, tokens: [{ addr: coin.address, amount: 2000 }] }];
        commissions = [{ addr: coin.address, amount: 0 }]

        await betting.finishMatch(firstMatch.id, betOnHome, merkleRoot, rewards, commissions, { from: owner });
    }

    async function playMatchWithTwoBettorsWithHOMEWinningTeamWithCommission() {
        await coin.approve(betting.address, allowance, { from: awayBettor });
        away_bet = {
            bettor: awayBettor,
            matchId: firstMatch.id,
            betOn: betOnAway,
            asset: {
                addr: coin.address,
                amount: amount
            },
            salt: salt
        };

        await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });
        await betting.makeBet(away_bet, WALLET_BALANCE_PAYMENT, { from: awayBettor });

        firstMatch.startTimestamp = getCurrentTimestampInSeconds() - MINUTE;
        await betting.addMatches([firstMatch], { from: owner });

        merkleRoot = "0xb266e19caa8c9ffb2d30865237e16f1db1e6e88e87a677f341811639af88afe3";
        rewards = [{ bettor: homeBettor, tokens: [{ addr: coin.address, amount: 2000 }] }];
        commissions = [{ addr: coin.address, amount: 0 }]

        await betting.finishMatch(firstMatch.id, betOnHome, merkleRoot, rewards, commissions, { from: owner });
    }

    function sleep(milliseconds) {
        const date = Date.now();
        let currentDate = null;
        do {
            currentDate = Date.now();
        } while (currentDate - date < milliseconds);
    }

    beforeEach(async () => {
        coin = await Coin.new("Test", "TST", 15000, owner);
        await coin.transfer(homeBettor, 5000, { from: owner });
        await coin.transfer(awayBettor, 5000, { from: owner });

        betting = await deployProxy(EuphoriaBettingUpgradeable, [web3.utils.asciiToHex(""), [], [], [], []], { from: owner, initializer: "__EuphoriaBetting_init" });
    });

    describe("addMatches", () => {
        beforeEach(() => {
            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
            secondMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
        });
        it("should set correct id, odds and timestamp", async () => {
            await betting.addMatches([firstMatch, secondMatch], { from: owner });

            const firstContractMatch = await betting.getMatchData(firstMatch.id)
            const secondContractMatch = await betting.getMatchData(secondMatch.id)

            assert.equal(firstContractMatch.id, firstMatch.id);
            assert.equal(firstContractMatch.odds[0].matchResult, firstMatch.odds[0].matchResult);
            assert.equal(firstContractMatch.odds[0].value, firstMatch.odds[0].value);
            assert.equal(firstContractMatch.odds[1].matchResult, firstMatch.odds[1].matchResult);
            assert.equal(firstContractMatch.odds[1].value, firstMatch.odds[1].value);
            assert.equal(firstContractMatch.startTimestamp, firstMatch.startTimestamp);

            assert.equal(secondContractMatch.id, secondMatch.id);
            assert.equal(secondContractMatch.odds[0].matchResult, secondMatch.odds[0].matchResult);
            assert.equal(secondContractMatch.odds[0].value, secondMatch.odds[0].value);
            assert.equal(secondContractMatch.odds[1].matchResult, secondMatch.odds[1].matchResult);
            assert.equal(secondContractMatch.odds[1].value, secondMatch.odds[1].value);
            assert.equal(secondContractMatch.startTimestamp, secondMatch.startTimestamp);
        });

        it("should emit event 'MatchAddition'", async () => {
            const tx = await betting.addMatches([firstMatch, secondMatch], { from: owner });

            await truffleAssert.eventEmitted(tx, "MatchAddition", event => {
                return event.matches[0].id == firstMatch.id && event.matches[1].id == secondMatch.id;
            });
        });

        it("should revert when sender is not owner", async () => {
            await truffleAssert.reverts(betting.addMatches([firstMatch, secondMatch], { from: homeBettor }), "Ownable: caller is not the owner");
        });
    });

    describe("makeBet", () => {
        beforeEach(async () => {
            allowance = 1000;
            amount = 1000;
            betOnHome = 0;
            betOnAway = 1;
            salt = 1; // random

            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
            secondMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR

            await betting.addMatches([firstMatch], { from: owner });
            await coin.approve(betting.address, allowance, { from: homeBettor });
            bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: betOnHome,
                asset: {
                    addr: coin.address,
                    amount: amount
                },
                salt: salt
            };
        });

        it("should send Coin token from bettor to contract when bettor balance is zero (WALLET_BALANCE_PAYMENT)", async () => {
            bettorBalanceBeforeBetting = await coin.balanceOf(homeBettor);
            await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });
            bettorBalanceAfterBetting = await coin.balanceOf(homeBettor);

            assert.equal(bettorBalanceAfterBetting.toNumber(), bettorBalanceBeforeBetting.toNumber() - bet.asset.amount);
        });

        it("should send Coin token from bettor to contract when bettor balance is zero (WALLET_PAYMENT)", async () => {
            bettorBalanceBeforeBetting = await coin.balanceOf(homeBettor);
            await betting.makeBet(bet, WALLET_PAYMENT, { from: homeBettor });
            bettorBalanceAfterBetting = await coin.balanceOf(homeBettor);

            assert.equal(bettorBalanceAfterBetting.toNumber(), bettorBalanceBeforeBetting.toNumber() - bet.asset.amount);
        });

        it("should revert when bettor balance is lower than bet amount (BALANCE_PAYMENT)", async () => {
            bettorBalanceBeforeBetting = await coin.balanceOf(homeBettor);
            await truffleAssert.reverts(betting.makeBet(bet, BALANCE_PAYMENT, { from: homeBettor }), "Not enough funds in balance");
        });

        it("should decrease the bettor's balance if there are enough funds on the balance (WALLET_BALANCE_PAYMENT)", async () => {
            await playMatchWithTwoBettorsWithHOMEWinningTeam();
            await betting.addMatches([secondMatch], { from: owner });

            balanceBefore = await betting.balances(homeBettor, coin.address);
            bet.matchId = secondMatch.id;
            await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });
            balanceAfter = await betting.balances(homeBettor, coin.address);

            assert.equal(balanceAfter.toNumber(), balanceBefore.toNumber() - bet.asset.amount);
        });

        it("should decrease the bettor's balance if there are enough funds on the balance (BALANCE_PAYMENT)", async () => {
            await playMatchWithTwoBettorsWithHOMEWinningTeam();
            await betting.addMatches([secondMatch], { from: owner });

            balanceBefore = await betting.balances(homeBettor, coin.address);
            bet.matchId = secondMatch.id;
            await betting.makeBet(bet, BALANCE_PAYMENT, { from: homeBettor });
            balanceAfter = await betting.balances(homeBettor, coin.address);

            assert.equal(balanceAfter.toNumber(), balanceBefore.toNumber() - bet.asset.amount);
        });

        it("should decrease the bettor's balance if there are not enough funds on the balance and send left Coin from bettor to contact (WALLET_BALANCE_PAYMENT)", async () => {
            await playMatchWithTwoBettorsWithHOMEWinningTeam();
            await betting.addMatches([secondMatch], { from: owner });

            balanceBefore = await betting.balances(homeBettor, coin.address);
            coinBalanceBefore = await coin.balanceOf(homeBettor);

            bet.matchId = secondMatch.id;
            bet.asset.amount = balanceBefore.toNumber() + 100;
            await coin.approve(betting.address, 100, { from: homeBettor });
            await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });

            balanceAfter = await betting.balances(homeBettor, coin.address);
            coinBalanceAfter = await coin.balanceOf(homeBettor);

            assert.equal(balanceAfter.toNumber(), 0);
            assert.equal(coinBalanceAfter, coinBalanceBefore - 100);
        });

        it("should not decrease the bettor's balance, only send left Coin from bettor to contact (WALLET_PAYMENT)", async () => {
            await playMatchWithTwoBettorsWithHOMEWinningTeam();
            await betting.addMatches([secondMatch], { from: owner });

            balanceBefore = await betting.balances(homeBettor, coin.address);
            coinBalanceBefore = await coin.balanceOf(homeBettor);

            bet.matchId = secondMatch.id;
            bet.asset.amount = balanceBefore.toNumber() + 100;
            await coin.approve(betting.address, bet.asset.amount, { from: homeBettor });
            await betting.makeBet(bet, WALLET_PAYMENT, { from: homeBettor });

            balanceAfter = await betting.balances(homeBettor, coin.address);
            coinBalanceAfter = await coin.balanceOf(homeBettor);

            assert.equal(balanceAfter.toNumber(), balanceBefore.toNumber());
            assert.equal(coinBalanceAfter.toNumber(), coinBalanceBefore.toNumber() - bet.asset.amount);
        });

        it("should emit event 'Bet'", async () => {
            const tx = await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });

            truffleAssert.eventEmitted(tx, "Bet", event => {
                isBettorSame = event.bet.bettor == bet.bettor;
                isMatchIdSame = event.bet.matchId == bet.matchId;
                isBetOnSame = event.bet.betOn == bet.betOn;
                isERC20TokenSame = event.bet.ERC20Token == bet.ERC20Token;
                isAmountSame = event.bet.amount == bet.amount;
                isSaltSame = event.bet.salt == bet.salt;
                return isBettorSame && isMatchIdSame && isBetOnSame && isERC20TokenSame && isAmountSame && isSaltSame;
            });
        });

        it("should revert when bettor did not approve Coin to betting contract and if there are not enough funds on the balance", async () => {
            await coin.approve(betting.address, 0, { from: homeBettor });

            await truffleAssert.reverts(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }), "Insufficient allowance");
        });

        it("should revert when match is unavailable", async () => {
            firstMatch.startTimestamp = getCurrentTimestampInSeconds() - MINUTE;
            await betting.addMatches([firstMatch], { from: owner });

            await truffleAssert.reverts(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }), "Match is not available for betting");
        });

        it("should revert when field 'bettor' in bet is not sender address", async () => {
            bet.bettor = owner;

            await truffleAssert.reverts(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }), "Bettor must be message sender");
        });

        it("should revert bet that already been made", async () => {
            betHash = await betting.hashBet(bet);

            await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });
            isBetMade = await betting.bets(betHash);

            assert.equal(isBetMade, true);
            await truffleAssert.reverts(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }), "Bet has already been made");
        });

        it("should revert when 'amount' field in bet is lower than 1000", async () => {
            bet.asset.amount = 50;
            await truffleAssert.reverts(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }), "Bet amount must be equal or greater than 1000");
        });

        it("should fails when 'betOn' field in bet is greater than 2", async () => {
            bet.betOn = 3;
            await truffleAssert.fails(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }));

            bet.betOn = 10;
            await truffleAssert.fails(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }));
        })

        it("should fails when paymentType field in is greater than 2", async () => {
            let paymentTypeNumber = 3;
            await truffleAssert.fails(betting.makeBet(bet, paymentTypeNumber, { from: homeBettor }));

            paymentTypeNumber = 10;
            await truffleAssert.fails(betting.makeBet(bet, paymentTypeNumber, { from: homeBettor }));
        })

        it("should fails when token address field in bet is not address of token", async () => {
            bet.asset.addr = owner;
            await truffleAssert.fails(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }));
        });
    });

    describe("cancelMatches", () => {
        beforeEach(async () => {
            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
            secondMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR

            await betting.addMatches([firstMatch, secondMatch], { from: owner });

            betAmount = 1000
            await coin.approve(betting.address, betAmount, { from: homeBettor });
            homeBet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: 0,
                asset: {
                    addr: coin.address,
                    amount: betAmount,
                },
                salt: 1
            };
            await betting.makeBet(homeBet, WALLET_BALANCE_PAYMENT, { from: homeBettor });
        });

        it("should change match startTimestamp to block timestamp", async () => {
            const tx = await betting.cancelMatches([firstMatch.id, secondMatch.id], [], { from: owner });
            const block = await web3.eth.getBlock(tx.receipt.blockNumber);

            firstContractMatch = await betting.getMatchData(firstMatch.id);
            secondContractMatch = await betting.getMatchData(secondMatch.id);

            assert.equal(firstContractMatch.startTimestamp, block.timestamp);
            assert.equal(secondContractMatch.startTimestamp, block.timestamp);
        });

        it("should change bettor balance", async () => {
            await betting.cancelMatches([firstMatch.id, secondMatch.id], [{ bettor: homeBettor, tokens: [{ addr: coin.address, amount: betAmount }] }]);
            bettorBalance = await betting.balances(homeBettor, coin.address);

            assert.equal(bettorBalance.toNumber(), betAmount);
        });

        it("should emit event MatchCancel", async () => {
            const tx = await betting.cancelMatches([firstMatch.id, secondMatch.id], [{ bettor: homeBettor, tokens: [{ addr: coin.address, amount: betAmount }] }]);

            truffleAssert.eventEmitted(tx, "MatchCancel", event => {
                return event.matches[0] == firstMatch.id && event.matches[1] == secondMatch.id;
            });
        });
    });

    describe("finishMatch", () => {
        beforeEach(async () => {
            calculatedMerkleRoot = "0xb266e19caa8c9ffb2d30865237e16f1db1e6e88e87a677f341811639af88afe3";
            calculatedBettorReward = 100;
            rewards = [{ bettor: homeBettor, tokens: [{ addr: coin.address, amount: calculatedBettorReward }] }];
            commissions = [{ addr: coin.address, amount: 10 }];
        });

        it("should change merkleRoot", async () => {
            oldMerkleRoot = await betting.merkleRoot();
            await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            newMerkleRoot = await betting.merkleRoot();

            assert.notEqual(newMerkleRoot, oldMerkleRoot);
            assert.equal(newMerkleRoot, calculatedMerkleRoot);
        });

        it("should change bettor balance", async () => {
            oldBettorBalance = await betting.balances(homeBettor, coin.address);
            await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            newBettorBalance = await betting.balances(homeBettor, coin.address);

            assert.equal(newBettorBalance, calculatedBettorReward)
        });

        it("should increase contract commissionBalance", async () => {
            const commissionBalanceBefore = await betting.commissionBalance(coin.address);
            await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            const commissionBalanceAfter = await betting.commissionBalance(coin.address);

            assert.equal(commissionBalanceAfter.toNumber(), commissionBalanceBefore.toNumber() + 10)
        });

        it("should change isFinished field of match", async () => {
            const matchDataBefore = await betting.getMatchData(firstMatch.id);
            await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            const matchDataAfter = await betting.getMatchData(firstMatch.id);

            assert.equal(matchDataAfter.isFinished, true);
        });

        it("should emit 'MatchFinished' event", async () => {
            const tx = await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            truffleAssert.eventEmitted(tx, 'MatchFinished', event => {
                return event.matchId == firstMatch.id, event.result == HOME;
            });
        });

        it("should emit 'MerkleRootUpdated' event", async () => {
            const tx = await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            truffleAssert.eventEmitted(tx, 'MerkleRootUpdated', event => {
                return event.merkleRoot == calculatedMerkleRoot;
            });
        });

        it("should emit 'RewardsDistributed' event", async () => {
            const oldBettorBalance = await betting.balances(homeBettor, coin.address);
            const tx = await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            truffleAssert.eventEmitted(tx, 'RewardsDistributed', event => {
                isUpdatedBalancesValid = true;
                event.rewards.forEach(async bettorReward => {
                    bettorReward.tokens.forEach(async token => {
                        newBettorBalance = await betting.balances(bettorReward.bettor, token.addr);
                        if (newBettorBalance.toNumber() != oldBettorBalance.toNumber() + token.amount) {
                            isUpdatedBalancesValid = false;
                        };
                    });
                });

                return isUpdatedBalancesValid;
            });
        });

        it("should revert when match.isFinished is True", async () => {
            await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });
            await truffleAssert.reverts(betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner }), "Match already finished");
        });

        it("should revert when match is available", async () => {
            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
            secondMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR

            await betting.addMatches([firstMatch, secondMatch], { from: owner });
            await truffleAssert.reverts(betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner }), "Match is not started");
        });

        it("should revert when newMerkleRoot is equal old merkleRoot", async () => {
            calculatedMerkleRoot = await betting.merkleRoot();
            await truffleAssert.reverts(betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner }), "New merkleRoot must not be the same as the old one");
        });

        it("should revert when reward list is empty", async () => {
            rewards = [];
            await truffleAssert.reverts(betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner }), "Rewards must not be empty");
        });
    });

    describe("withdraw", () => {
        beforeEach(async () => {
            allowance = 1000;
            amount = 1000;
            betOnHome = 0;
            betOnAway = 1;
            salt = 1; // random

            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
            secondMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR

            await betting.addMatches([firstMatch], { from: owner });
            await coin.approve(betting.address, allowance, { from: homeBettor });
            bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: betOnHome,
                asset: {
                    addr: coin.address,
                    amount: amount,
                },
                salt: salt
            };

            await playMatchWithTwoBettorsWithHOMEWinningTeam();
        });

        it("should send Coin from contract to sender address", async () => {
            oldSenderCoinBalance = await coin.balanceOf(homeBettor);
            await betting.withdraw(coin.address, bet.asset.amount, { from: homeBettor });
            newSenderCoinBalance = await coin.balanceOf(homeBettor);

            assert.equal(newSenderCoinBalance.toNumber(), oldSenderCoinBalance.toNumber() + bet.asset.amount);
        });

        it("should decrease balance of sender address", async () => {
            oldBettorBalance = await betting.balances(homeBettor, coin.address);
            await betting.withdraw(coin.address, bet.asset.amount, { from: homeBettor });
            newBettorBalance = await betting.balances(homeBettor, coin.address);

            assert.equal(newBettorBalance.toNumber(), oldBettorBalance.toNumber() - bet.asset.amount);
        });

        it("should revert when balance of sender is lower than amount", async () => {
            amount = 10000;
            await truffleAssert.reverts(betting.withdraw(coin.address, amount, { from: homeBettor }), "Insufficient token amount");
        });
    });

    describe("addFunds", () => {
        beforeEach(async () => {
            amount = 100
            tokenAsset = {
                addr: coin.address,
                amount: amount
            }
            await coin.approve(betting.address, amount, { from: homeBettor });
        });
        it("should increase balance of tx sender", async () => {
            balanceBefore = await betting.balances(homeBettor, coin.address);
            await betting.addFunds(tokenAsset, { from: homeBettor });
            balanceAfter = await betting.balances(homeBettor, coin.address);

            assert.equal(balanceAfter.toNumber(), balanceBefore.toNumber() + amount);

        });
        it("should revert when sender did not approve Coin to betting contract", async () => {
            await coin.approve(betting.address, 0, { from: homeBettor });
            await truffleAssert.reverts(betting.addFunds(tokenAsset, { from: homeBettor }), "Insufficient allowance");
        });
        it("should fails when token address field in bet is not address of token", async () => {
            tokenAsset.addr = owner;
            await truffleAssert.fails(betting.addFunds(tokenAsset, { from: homeBettor }));
        });
    });

    describe("hashBet", () => {
        beforeEach(async () => {
            allowance = 1000;
            amount = 1000;
            betOnHome = 0;
            betOnAway = 1;
            salt = 1; // random

            bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: betOnHome,
                asset: {
                    addr: coin.address,
                    amount: amount
                },
                salt: salt
            };
        });

        it("should return same hash when giving same bet data", async () => {
            betHash1 = await betting.hashBet(bet);

            same_bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: 0,
                asset: {
                    addr: coin.address,
                    amount: 1000
                },
                salt: 1
            };

            betHash2 = await betting.hashBet(same_bet);

            assert.equal(betHash2, betHash1);
        });

        it("should return different hash when giving different bet data", async () => {

            other_bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: betOnHome,
                asset: {
                    addr: coin.address,
                    amount: amount
                },
                salt: salt + 1
            };

            betHash1 = await betting.hashBet(bet);
            betHash2 = await betting.hashBet(other_bet);

            assert.notEqual(betHash2, betHash1);
        });
    });

    describe("transferCommission", () => {
        beforeEach(async () => {
            allowance = 1000;
            amount = 1000;
            betOnHome = 0;
            betOnAway = 1;
            salt = 1; // random

            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + 2

            await betting.addMatches([firstMatch], { from: owner });
            await coin.approve(betting.address, allowance, { from: homeBettor });
            bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: betOnHome,
                asset: {
                    addr: coin.address,
                    amount: amount
                },
                salt: salt
            };

            await coin.approve(betting.address, allowance, { from: awayBettor });
            away_bet = {
                bettor: awayBettor,
                matchId: firstMatch.id,
                betOn: betOnAway,
                asset: {
                    addr: coin.address,
                    amount: amount
                },
                salt: salt
            };

            await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });
            await betting.makeBet(away_bet, WALLET_BALANCE_PAYMENT, { from: awayBettor });

            calculatedMerkleRoot = "0xb266e19caa8c9ffb2d30865237e16f1db1e6e88e87a677f341811639af88afe3";
            calculatedBettorReward = 1980;
            rewards = [{ bettor: homeBettor, tokens: [{ addr: coin.address, amount: calculatedBettorReward }] }];
            commissions = [{ addr: coin.address, amount: 20 }];

            sleep(2000);
            await coin.approve(betting.address, 0, { from: awayBettor }); // need for updating time in ganache
            await betting.finishMatch(firstMatch.id, HOME, calculatedMerkleRoot, rewards, commissions, { from: owner });

            commissionBalance = await betting.commissionBalance(coin.address);

            assetToTransfer = {
                addr: coin.address,
                amount: commissionBalance.toNumber()
            }
        });

        it("should send amount of tokens to recipient", async () => {
            oldRecipientBalance = await coin.balanceOf(recipient);

            await betting.transferCommission(recipient, [assetToTransfer], { from: owner });
            newRecipientBalance = await coin.balanceOf(recipient);

            assert.equal(newRecipientBalance.toNumber(), oldRecipientBalance.toNumber() + commissionBalance.toNumber())
        });

        it("should decrease commissionBalance", async () => {
            const commissionBalanceBefore = await betting.commissionBalance(coin.address);
            await betting.transferCommission(recipient, [assetToTransfer], { from: owner });
            const commissionBalanceAfter = await betting.commissionBalance(coin.address);

            assert.equal(commissionBalanceAfter.toNumber(), commissionBalanceBefore.toNumber() - commissionBalance)
        });

        it("should revert when sender is not owner", async () => {
            await truffleAssert.reverts(betting.transferCommission(recipient, [assetToTransfer], { from: homeBettor }), "Ownable: caller is not the owner");
        });
    });

    describe("upgrade proxy test", () => {
        beforeEach(async () => {
            upgradedBetting = await upgradeProxy(betting.address, EuphoriaBettingUpgradeableV2Test, { kind: "uups" });

            NEW_MATCH_RESULT = 3
        });
        it("should add newMethod to contract", async () => {
            value = await upgradedBetting.newMethod();

            assert.equal(10, value.toNumber());
        });

        it("should add new matchResult for bet", async () => {
            allowance = 1000;
            amount = 1000;
            betOnHome = 0;
            betOnAway = 1;
            salt = 1; // random

            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
            firstMatch.odds.push({
                matchResult: NEW_MATCH_RESULT,
                value: 110
            })
            await betting.addMatches([firstMatch], { from: owner });
            await coin.approve(betting.address, allowance, { from: homeBettor });
            bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: NEW_MATCH_RESULT,
                asset: {
                    addr: coin.address,
                    amount: amount
                },
                salt: salt
            };

            const tx = await betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor });

            truffleAssert.eventEmitted(tx, "Bet", event => {
                isBettorSame = event.bet.bettor == bet.bettor;
                isMatchIdSame = event.bet.matchId == bet.matchId;
                isBetOnSame = event.bet.betOn == bet.betOn;
                isERC20TokenSame = event.bet.ERC20Token == bet.ERC20Token;
                isAmountSame = event.bet.amount == bet.amount;
                isSaltSame = event.bet.salt == bet.salt;
                return isBettorSame && isMatchIdSame && isBetOnSame && isERC20TokenSame && isAmountSame && isSaltSame;
            });
        });
    });

    describe("pause", () => {
        beforeEach(async () => {
            await betting.pause({ from: owner });

            allowance = 1000;
            amount = 1000;
            betOnHome = 0;
            betOnAway = 1;
            salt = 1; // random

            firstMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR
            secondMatch.startTimestamp = getCurrentTimestampInSeconds() + HOUR

            bet = {
                bettor: homeBettor,
                matchId: firstMatch.id,
                betOn: betOnHome,
                asset: {
                    addr: coin.address,
                    amount: amount
                },
                salt: salt
            };
        });
        it("should revert other transactions when contract is paused", async () => {
            await truffleAssert.reverts(betting.addMatches([firstMatch, secondMatch], { from: owner }), "Pausable: paused");
            await truffleAssert.reverts(betting.makeBet(bet, WALLET_BALANCE_PAYMENT, { from: homeBettor }), "Pausable: paused");
        });
    });

    describe("EuphoriaBettingUpgradeableV2 new additional addRewards method", () => {
        beforeEach(async () => {
            upgradedBetting = await upgradeProxy(betting.address, EuphoriaBettingUpgradeableV2, { kind: "uups", unsafeSkipStorageCheck: true }); // unsafeSkipStorageCheck: true
            await coin.approve(betting.address, 1500, { from: owner });
            awayBettorReward = 500;
            homeBettorReward = 1000;
            rewards = [{ bettor: homeBettor, tokens: [{ addr: coin.address, amount: homeBettorReward }] }, { bettor: awayBettor, tokens: [{ addr: coin.address, amount: awayBettorReward }] }];
        });

        it("should transfer rewards tokens to contract", async () => {
            contractBalanceBeforeBetting = await coin.balanceOf(betting.address);
            await upgradedBetting.addRewards(rewards, { from: owner });
            contractBalanceAfterBetting = await coin.balanceOf(betting.address);

            assert.equal(contractBalanceAfterBetting.toNumber(), contractBalanceBeforeBetting.toNumber() + homeBettorReward + awayBettorReward);
        });
        it("should update reward receivers' balance", async () => {
            homeBettorBalanceBefore = await betting.balances(homeBettor, coin.address);
            awayBettorBalanceBefore = await betting.balances(awayBettor, coin.address);
            await upgradedBetting.addRewards(rewards, { from: owner });
            homeBettorBalanceAfter = await betting.balances(homeBettor, coin.address);
            awayBettorBalanceAfter = await betting.balances(awayBettor, coin.address);

            assert.equal(homeBettorBalanceAfter.toNumber(), homeBettorBalanceBefore.toNumber() + homeBettorReward);
            assert.equal(awayBettorBalanceAfter.toNumber(), awayBettorBalanceBefore.toNumber() + awayBettorReward);
        });
        it("should revert when sender is not owner", async () => {
            await truffleAssert.reverts(upgradedBetting.addRewards(rewards, { from: homeBettor }), "Ownable: caller is not the owner");
        });

        it("should add new field to contract", async () => {
            let matchData = await upgradedBetting.getMatchDataV2(1);
            balanceBefore = await upgradedBetting.balances(homeBettor, coin.address);
            await upgradedBetting.addFunds(tokenAsset, { from: homeBettor });
            balanceAfter = await upgradedBetting.balances(homeBettor, coin.address);
            console.log("BALANCE 2: " + balanceBefore.toNumber() + ", " + balanceAfter.toNumber())
        });
    });
});
