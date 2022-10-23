// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: ;
pragma solidity 0.8.17;

import "../../TokenManager.sol";
import {DiamondStorageLib} from "../../lib/DiamondStorageLib.sol";
import "../../RedstoneConfigManager.sol";

/**
 * DeploymentConstants
 * These constants are updated during test and prod deployments using JS scripts. Defined as constants
 * to decrease gas costs. Not meant to be updated unless really necessary.
 * BE CAREFUL WHEN UPDATING. CONSTANTS CAN BE USED AMONG MANY FACETS.
 **/
library DeploymentConstants {

    // Used for LTV (TotalValue, Debt) and LiquidationBonus calculations
    uint256 private constant _PERCENTAGE_PRECISION = 1000;

    bytes32 private constant _NATIVE_TOKEN_SYMBOL = 'AVAX';

    address private constant _NATIVE_ADDRESS = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;

    address private constant _DIAMOND_BEACON_ADDRESS = 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5;

    address private constant _SMART_LOANS_FACTORY_ADDRESS = 0x367761085BF3C12e5DA2Df99AC6E1a824612b8fb;

    address private constant _TOKEN_MANAGER_ADDRESS = 0x18E317A7D70d8fBf8e6E893616b52390EbBdb629;

    address private constant _REDSTONE_CONFIG_MANAGER_ADDRESS = 0xBEc49fA140aCaA83533fB00A2BB19bDdd0290f25;

    //implementation-specific

    function getPercentagePrecision() internal pure returns (uint256) {
        return _PERCENTAGE_PRECISION;
    }

    //blockchain-specific

    function getNativeTokenSymbol() internal pure returns (bytes32 symbol) {
        return _NATIVE_TOKEN_SYMBOL;
    }

    function getNativeToken() internal pure returns (address payable) {
        return payable(_NATIVE_ADDRESS);
    }

    //deployment-specific

    function getDiamondAddress() internal pure returns (address) {
        return _DIAMOND_BEACON_ADDRESS;
    }

    function getSmartLoansFactoryAddress() internal pure returns (address) {
        return _SMART_LOANS_FACTORY_ADDRESS;
    }

    function getTokenManager() internal pure returns (TokenManager) {
        return TokenManager(_TOKEN_MANAGER_ADDRESS);
    }

    function getRedstoneConfigManager() internal pure returns (RedstoneConfigManager) {
        return RedstoneConfigManager(_REDSTONE_CONFIG_MANAGER_ADDRESS);
    }

    /**
    * Returns all owned assets keys
    **/
    function getAllOwnedAssets() internal view returns (bytes32[] memory result) {
        DiamondStorageLib.SmartLoanStorage storage sls = DiamondStorageLib.smartLoanStorage();
        return sls.ownedAssets._inner._keys._inner._values;
    }
}