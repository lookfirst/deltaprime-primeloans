// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: 5e8f5dec33212cea26a543bc9e4611925b8e412a;
pragma solidity ^0.8.4;

import "../WavaxPool.sol";


/**
 * @title WavaxPoolFactory
 * @dev Contract factory allowing anyone to deploy a pool contract
 */
contract WavaxPoolFactory {
  function deployPool() public {
    WavaxPool pool = new WavaxPool();
    emit PoolDeployed(address(pool));
  }

  /**
   * @dev emitted after pool is deployed by any user
   * @param poolAddress of deployed pool
   **/
  event PoolDeployed(address poolAddress);
}