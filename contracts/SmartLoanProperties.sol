// SPDX-License-Identifier: UNLICENSED
// Last deployed using commit: ;
pragma solidity ^0.8.4;

import "./interfaces/IAssetsExchange.sol";
import "./Pool.sol";

/**
 * @title SmartLoanProperties
 * A contract that holds SmartLoan related properties.
 * Every property has a virtual getter to allow overriding when upgrading a SmartLoan contract.
 *
 */
contract SmartLoanProperties {

  uint256 private constant _PERCENTAGE_PRECISION = 1000;
  // 10%
  uint256 private constant _LIQUIDATION_BONUS = 100;

  // 500%
  uint256 private constant _MAX_LTV = 5000;
  // 400%
  uint256 private constant _MIN_SELLOUT_LTV = 4000;

  address private constant _EXCHANGE_ADDRESS = 0xBc45b6F1ff0626CAb1746c2a5f8173a9417A4925;

  address private constant _POOL_ADDRESS = 0xDF83DC5a11EE4a176264FaE1146406295eb6e18D;

  // redstone-evm-connector price providers
  address private constant _PRICE_PROVIDER_1 = 0x981bdA8276ae93F567922497153de7A5683708d3;

  address private constant _PRICE_PROVIDER_2 = 0x3BEFDd935b50F172e696A5187DBaCfEf0D208e48;

  // redstone-evm-connector max block.timestamp acceptable delay
  uint256 internal constant MAX_BLOCK_TIMESTAMP_DELAY = 30; // 30 seconds

  bool internal _liquidationInProgress = false;


  /* ========== GETTERS ========== */


  function getPercentagePrecision() public virtual view returns (uint256) {
    return _PERCENTAGE_PRECISION;
  }

  function getLiquidationBonus() public virtual view returns (uint256) {
    return _LIQUIDATION_BONUS;
  }

  function getMaxLtv() public virtual view returns (uint256) {
    return _MAX_LTV;
  }

  function getMinSelloutLtv() public virtual view returns (uint256) {
    return _MIN_SELLOUT_LTV;
  }

  function getExchange() public virtual view returns (IAssetsExchange) {
    return IAssetsExchange(_EXCHANGE_ADDRESS);
  }

  function getPool() public virtual view returns (Pool) {
    return Pool(_POOL_ADDRESS);
  }

  function getPriceProvider1() public virtual view returns (address) {
    return _PRICE_PROVIDER_1;
  }

  function getPriceProvider2() public virtual view returns (address) {
    return _PRICE_PROVIDER_2;
  }
}