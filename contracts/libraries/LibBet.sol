// SPDX-License-Identifier: MIT
pragma solidity >=0.8.10;

library LibBet {
    enum MatchResult {
        HOME,
        AWAY,
        DRAW
    }

    struct TokenAsset {
        address addr;
        uint256 amount;
    }

    struct Bet {
        address bettor;
        uint256 matchId;
        MatchResult betOn;
        TokenAsset asset;
        uint256 salt;
    }

    struct BetV2 {
        address bettor;
        uint256 matchId;
        uint256 matchTypeId;
        MatchResult betOn;
        TokenAsset asset;
        uint256 salt;
    }

    bytes32 constant TOKEN_ASSET_TYPE_TYPEHASH =
        keccak256("TokenAsset(address addr,uint256 amount)");
    bytes32 constant BET_TYPE_TYPEHASH =
        keccak256(
            "Bet(address bettor,uint256 matchId,uint8 betOn,TokenAsset asset,uint256 salt)TokenAsset(address addr,uint256 amount)"
        );
    bytes32 constant BET_V2_TYPE_TYPEHASH =
        keccak256(
            "Bet(address bettor,uint256 matchId,uint256 matchTypeId,uint8 betOn,TokenAsset asset,uint256 salt)TokenAsset(address addr,uint256 amount)"
        );

    function hash(TokenAsset calldata tokenAsset)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked(
                    TOKEN_ASSET_TYPE_TYPEHASH,
                    tokenAsset.addr,
                    tokenAsset.amount
                )
            );
    }

    function hash(Bet calldata bet) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    BET_TYPE_TYPEHASH,
                    bet.bettor,
                    bet.matchId,
                    bet.betOn,
                    hash(bet.asset),
                    bet.salt
                )
            );
    }

    function hash(BetV2 calldata bet) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    BET_V2_TYPE_TYPEHASH,
                    bet.bettor,
                    bet.matchId,
                    bet.matchTypeId,
                    bet.betOn,
                    hash(bet.asset),
                    bet.salt
                )
            );
    }
}
