pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAssetsExchange.sol";
import "../Pool.sol";
import "../TokenManager.sol";
import "../interfaces/IYieldYakRouter.sol";
import {DiamondStorageLib} from "../lib/DiamondStorageLib.sol";
import "../Pool.sol";
import "../RedstoneConfigManager.sol";

library SmartLoanConfigLib {

    // Used for LTV (TotalValue, Debt) and LiquidationBonus calculations
    uint256 private constant _PERCENTAGE_PRECISION = 1000;
    // 5%
    uint256 private constant _MAX_LIQUIDATION_BONUS = 50;
    // 500%
    uint256 private constant _MAX_LTV = 5000;
    // 400%
    uint256 private constant _MIN_SELLOUT_LTV = 4000;

    address private constant _POOL_ADDRESS = 0x5ff1DE6091871adAAe64E2Ec4feD754628482868;

    address private constant _NATIVE_ADDRESS = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;

    address private constant _DIAMOND_BEACON_ADDRESS = 0x1c85638e118b37167e9298c2268758e058DdfDA0;

    address private constant _SMART_LOANS_FACTORY_ADDRESS = 0x1f10F3Ba7ACB61b2F50B9d6DdCf91a6f787C0E82;

    function getSmartLoansFactoryAddress() internal view returns (address) {
        return _SMART_LOANS_FACTORY_ADDRESS;
    }

    function getDiamondAddress() internal view returns (address) {
        return _DIAMOND_BEACON_ADDRESS;
    }

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

    function getTokenManager() internal view returns (TokenManager) {
    return TokenManager(0x4EE6eCAD1c2Dae9f525404De8555724e3c35d07B);
    }

    function getNativeTokenSymbol() internal pure returns (bytes32 symbol) {
        return "AVAX";
    }

    function getRedstoneConfigManager() internal view returns (RedstoneConfigManager) {
    return RedstoneConfigManager(0x7151E5129F386e6B4c497F151030Fa5eD6b4453c);
    }

    function getNativeToken() internal view returns (address payable) {
        return payable(_NATIVE_ADDRESS);
    }

    /**
    * Returns all owned assets keys
    **/
    function getAllOwnedAssets() internal view returns (bytes32[] memory result) {
        DiamondStorageLib.SmartLoanStorage storage sls = DiamondStorageLib.smartLoanStorage();
        return sls.ownedAssets._inner._keys._inner._values;
    }
}