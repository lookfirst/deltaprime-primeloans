pragma solidity ^0.8.4;

import "../interfaces/IAssetsExchange.sol";
import "../Pool.sol";
import "../interfaces/IYieldYakRouter.sol";
import {LibDiamond} from "../lib/LibDiamond.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library SmartLoanLib {
    // TODO: Move some of those to constants to save gas on reading storage
    // TODO: Add setters (for example for _liquidationInProgress flag

    uint256 private constant _PERCENTAGE_PRECISION = 1000;
    // 10%
    uint256 private constant _LIQUIDATION_BONUS = 100;
    // 500%
    uint256 private constant _MAX_LTV = 5000;
    // 400%
    uint256 private constant _MIN_SELLOUT_LTV = 4000;

    address private constant _POOL_ADDRESS = 0x5ff1DE6091871adAAe64E2Ec4feD754628482868;

    address private constant _EXCHANGE_ADDRESS = 0xB468647B04bF657C9ee2de65252037d781eABafD;

    // redstone-evm-connector price providers
    address private constant _PRICE_PROVIDER_1 = 0x981bdA8276ae93F567922497153de7A5683708d3;

    address private constant _PRICE_PROVIDER_2 = 0x3BEFDd935b50F172e696A5187DBaCfEf0D208e48;

    // redstone-evm-connector max block.timestamp acceptable delay
    uint256 internal constant MAX_BLOCK_TIMESTAMP_DELAY = 30; // 30 seconds


    function getPercentagePrecision() internal view returns (uint256) {
        return _PERCENTAGE_PRECISION;
    }

    function getLiquidationBonus() internal view returns (uint256) {
        return _LIQUIDATION_BONUS;
    }

    function getLiquidationInProgress() internal view returns (bool) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        return ds._liquidationInProgress;
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

    function getYieldYakRouter() internal view returns (IYieldYakRouter) {
        // TODO: Make it upgradeable or explicitly move to a constant?
        return IYieldYakRouter(0x7bdd3b028C4796eF0EAf07d11394d0d9d8c24139);
    }

    function getMaxBlockTimestampDelay() internal view returns (uint256) {
        return MAX_BLOCK_TIMESTAMP_DELAY;
    }

    function getYakAvaxStakingContract() internal view returns (IERC20) {
        return IERC20(0xaAc0F2d0630d1D09ab2B5A400412a4840B866d95);
    }

    function getPool() internal view returns (Pool) {
        return Pool(_POOL_ADDRESS);
    }

    function getPriceProvider1() internal view returns (address) {
        return _PRICE_PROVIDER_1;
    }

    function getPriceProvider2() internal view returns (address) {
        return _PRICE_PROVIDER_2;
    }

    //TODO: remember about proper sequence of pools
    //returns indices of assets that have an ERC20 pool
    function getPoolsAssetsIndices() internal view returns (uint8[1] memory) {
      return [0];
    }

    //TODO: remember that it will be updated with a deployment script...
    function getPoolAddress(bytes32 poolToken) internal view returns (address) {
    if (poolToken == bytes32("AVAX")) return 0xF85895D097B2C25946BB95C4d11E2F3c035F8f0C;
        return address(0);
    }


}
