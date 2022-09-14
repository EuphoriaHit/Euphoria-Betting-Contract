// SPDX-License-Identifier: MIT
pragma solidity >=0.8.10;

import "./LibBet.sol";

library LibMatch {
    struct Odds {
        LibBet.MatchResult matchResult;
        uint256 value;
    }
    struct MatchV2 {
        uint256 id;
        uint256 typeId;
        Odds[] odds;
        uint256 startTimestamp;
        bool isFinished;
    }

    bytes32 constant ODDS_TYPEHASH =
        keccak256("Odds(uint8 matchResult,uint256 value)");

    bytes32 constant MATCH_V2_TYPEHASH =
        keccak256(
            "MatchV2(uint256 id,uint256 typeId,Odds[] odds,uint256 startTimestamp,bool isFinished)Odds(uint8 matchResult,uint256 value)"
        );

    function hash(Odds calldata odds) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(ODDS_TYPEHASH, odds.matchResult, odds.value)
            );
    }

    function hash(Odds[] calldata odds)
        internal
        pure
        returns (bytes32[] memory)
    {
        bytes32[] memory odds_hashes = new bytes32[](odds.length);
        for (uint256 i = 0; i < odds.length; i++) {
            odds_hashes[i] = hash(odds[i]);
        }

        return odds_hashes;
    }

    function hash(MatchV2 calldata matchV2) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    MATCH_V2_TYPEHASH,
                    matchV2.id,
                    matchV2.typeId,
                    hash(matchV2.odds),
                    matchV2.startTimestamp,
                    matchV2.isFinished
                )
            );
    }
}
