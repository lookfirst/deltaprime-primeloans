pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAssetsExchange.sol";
import "../Pool.sol";
import "../interfaces/IYieldYakRouter.sol";
import {LibDiamond} from "../lib/LibDiamond.sol";
import "../mock/WAVAX.sol";
import "../ERC20Pool.sol";

library SmartLoanLib {

    uint256 private constant _PERCENTAGE_PRECISION = 1000;
    // 5%
    uint256 private constant _MAX_LIQUIDATION_BONUS = 50;
    // 500%
    uint256 private constant _MAX_LTV = 5000;
    // 400%
    uint256 private constant _MIN_SELLOUT_LTV = 4000;

    address private constant _POOL_ADDRESS = 0x5ff1DE6091871adAAe64E2Ec4feD754628482868;

  address private constant _EXCHANGE_ADDRESS = 0x36b58F5C1969B7b6591D752ea6F5486D069010AB;

    // redstone-evm-connector price providers
    address private constant _PRICE_PROVIDER_1 = 0x981bdA8276ae93F567922497153de7A5683708d3;

    address private constant _PRICE_PROVIDER_2 = 0x3BEFDd935b50F172e696A5187DBaCfEf0D208e48;

    address private constant _WAVAX_ADDRESS = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;

    address private constant _YIELD_YAK_ROUTER_ADDRESS = 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5;

    address private constant _YAK_STAKING_CONTRACT = 0xaAc0F2d0630d1D09ab2B5A400412a4840B866d95;

    // redstone-evm-connector max block.timestamp acceptable delay
    uint256 internal constant MAX_BLOCK_TIMESTAMP_DELAY = 30; // 30 seconds


    function getPercentagePrecision() internal view returns (uint256) {
        return _PERCENTAGE_PRECISION;
    }

    function getMaxLiquidationBonus() internal view returns (uint256) {
        return _MAX_LIQUIDATION_BONUS;
    }

    function getMaxLtv() internal view returns (uint256) {
        return _MAX_LTV;
    }

    function getMinSelloutLtv() internal view returns (uint256) {
        return _MIN_SELLOUT_LTV;
    }

    function getExchange() internal view returns (IAssetsExchange) {
        return IAssetsExchange(_EXCHANGE_ADDRESS);
    }

    function getNativeTokenWrapped() internal view returns (WAVAX) {
        return WAVAX(payable(_WAVAX_ADDRESS));
    }

    function getYieldYakRouter() internal view returns (IYieldYakRouter) {
  return IYieldYakRouter(0x8198f5d8F8CfFE8f9C413d98a0A55aEB8ab9FbB7);
    }

    function getMaxBlockTimestampDelay() internal view returns (uint256) {
        return MAX_BLOCK_TIMESTAMP_DELAY;
    }

    function getYakAvaxStakingContract() internal view returns (IERC20) {
        return IERC20(_YAK_STAKING_CONTRACT);
    }

    function getPriceProvider1() internal view returns (address) {
        return _PRICE_PROVIDER_1;
    }

    function getPriceProvider2() internal view returns (address) {
        return _PRICE_PROVIDER_2;
    }

    function getPoolTokens() internal view returns (IERC20Metadata[2] memory) {
        return [
      IERC20Metadata(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7),
      IERC20Metadata(0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664)
        ];
    }

    function getPools() internal view returns (ERC20Pool[2] memory) {
        return [
      ERC20Pool(0x21dF544947ba3E8b3c32561399E88B52Dc8b2823),
      ERC20Pool(0xDC11f7E700A4c898AE5CAddB1082cFfa76512aDD)
        ];
    }

    function getLiquidationInProgress() internal view returns (bool) {
        LibDiamond.LiquidationStorage storage ls = LibDiamond.liquidationStorage();
        return ls._liquidationInProgress;
    }

    function setLiquidationInProgress(bool _status) internal {
        LibDiamond.LiquidationStorage storage ls = LibDiamond.liquidationStorage();
        ls._liquidationInProgress = _status;
    }

    //TODO: remember about proper sequence of pools
    //returns indices of assets that have an ERC20 pool
    function getPoolsAssetsIndices() internal view returns (uint8[2] memory) {
    return [0,1];
    }

    //TODO: remember that it will be updated with a deployment script...
    function getPoolAddress(bytes32 poolToken) internal view returns (address) {
    if (poolToken == bytes32("AVAX")) return 0x21dF544947ba3E8b3c32561399E88B52Dc8b2823;
    if (poolToken == bytes32("USDC")) return 0xDC11f7E700A4c898AE5CAddB1082cFfa76512aDD;

        return address(0);
    }


}