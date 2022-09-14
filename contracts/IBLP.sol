// SPDX-License-Identifier: MIT
pragma solidity >=0.8.10;

interface IBLP {
    function injectRewards(uint256 amount, uint256 leftovers) external;

    function lendTokens(uint256 amount) external;
}
