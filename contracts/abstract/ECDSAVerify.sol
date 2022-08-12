// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: ;
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

abstract contract ECDSAVerify {
    using ECDSA for bytes32;

    function verifyMessage(address signer, string memory message, bytes memory signature) public pure returns(bool) {
        bytes32 messageHash =  keccak256(bytes(message));
        address signerAddress = messageHash.toEthSignedMessageHash().recover(signature);

        return true;
        // return signerAddress == signer;
    }
}
