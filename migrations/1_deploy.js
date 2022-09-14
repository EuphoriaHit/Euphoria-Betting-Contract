const { deployProxy, upgradeProxy, forceImport } = require("@openzeppelin/truffle-upgrades");
const EuphoriaBettingUpgradeable = artifacts.require("EuphoriaBettingUpgradeable");
const EuphoriaBettingUpgradeableV2 = artifacts.require("EuphoriaBettingUpgradeableV2");

module.exports = async function (deployer) {
  const betting = await deployProxy(EuphoriaBettingUpgradeable, [web3.utils.asciiToHex(""), [], [], [], []], { deployer, initializer: "__EuphoriaBetting_init", kind: "uups" });
  console.log("Deployed betting at", betting.address);

  // UPGRADE EXAMPLE
  // const bettingOld = await EuphoriaBettingUpgradeable.at("0x2118D0A02b53616Dc8f336Ffd57369e4633623D5")
  // await forceImport(bettingOld.address, EuphoriaBettingUpgradeable, { deployer, kind: "uups" })
  // const bettingNew = await upgradeProxy(bettingOld.address, EuphoriaBettingUpgradeableV2, { deployer, kind: "uups" });

  // console.log("Upgraded:", bettingNew.address);
};
