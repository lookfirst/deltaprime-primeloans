// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: 5e8f5dec33212cea26a543bc9e4611925b8e412a;
pragma solidity ^0.8.4;

import "./ERC20Pool.sol";
import "./mock/WAVAX.sol";


/**
 * @title Pool
 * @dev Contract allowing user to deposit and borrow funds from a single pot
 * Depositors are rewarded with the interest rates collected from borrowers.
 * Rates are compounded every second and getters always return the current deposit and borrowing balance.
 * The interest rates calculation is delegated to the external calculator contract.
 */
contract WavaxPool is ERC20Pool {

  function depositNativeToken() public payable virtual {
    WAVAX(tokenAddress).deposit{value: msg.value}();

    _accumulateDepositInterest(msg.sender);

    _mint(msg.sender, msg.value);
    _updateRates();

    emit Deposit(msg.sender, msg.value, block.timestamp);
  }
}