// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "../ERC721/DepositAccessNFT.sol";

contract MockDepositAccessNFT is DepositAccessNFT {

    constructor() DepositAccessNFT() {
        accessTokenTrustedSigner = 0xdD2FD4581271e230360230F9337D5c0430Bf44C0;
    }
}
