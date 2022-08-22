// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: 5e8f5dec33212cea26a543bc9e4611925b8e412a;
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract WavaxPoolTUP is TransparentUpgradeableProxy {
    constructor(address _logic, address admin_, bytes memory _data) TransparentUpgradeableProxy(_logic, admin_, _data) {}
}
