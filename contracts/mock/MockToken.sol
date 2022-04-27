// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(address[] memory airdropUsers) ERC20("MockToken", "USDT") {

        for(uint256 i = 0; i < airdropUsers.length; i++) {
            _mint(airdropUsers[i], 10000 * 10 ** decimals());
        }
    }
}
