// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "../SolvencyFacet.sol";

contract MockSolvencyFacet is SolvencyFacet {
    //for testing purposes on hardhat fork nodes (where block timestamps can diverge)
    function getMaxDataTimestampDelay() public virtual override view returns (uint256) {
        return 300;
    }
}
