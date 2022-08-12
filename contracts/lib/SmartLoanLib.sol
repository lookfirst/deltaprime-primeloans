pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAssetsExchange.sol";
import "../Pool.sol";
import "../interfaces/IYieldYakRouter.sol";
import {LibDiamond} from "../lib/LibDiamond.sol";
import "../mock/WAVAX.sol";
import "../ERC20Pool.sol";
import "hardhat/console.sol";

library SmartLoanLib {

    uint256 private constant _PERCENTAGE_PRECISION = 1000;
    // 5%
    uint256 private constant _MAX_LIQUIDATION_BONUS = 100; //todo: 50
    // 500%
    uint256 private constant _MAX_LTV = 5000;
    // 400%
    uint256 private constant _MIN_SELLOUT_LTV = 4000;

    address private constant _POOL_ADDRESS = 0x5ff1DE6091871adAAe64E2Ec4feD754628482868;

  address private constant _EXCHANGE_ADDRESS = 0x38a024C0b412B9d1db8BC398140D00F5Af3093D4;

    // redstone-evm-connector price providers
    address private constant _PRICE_PROVIDER_1 = 0x981bdA8276ae93F567922497153de7A5683708d3;
    address private constant _PRICE_PROVIDER_2 = 0xAE9D49Ea64DF38B9fcbC238bc7004a1421f7eeE8;
    address private constant _PRICE_PROVIDER_3 = 0xbC5a06815ee80dE7d20071703C1F1B8fC511c7d4;
    address private constant _PRICE_PROVIDER_4 = 0x2D0645D863a4eE15664761ea1d99fF2bae8aAe35;
    address private constant _PRICE_PROVIDER_5 = 0x9456dd79c3608cF463d975F76f7658f87a41Cd6C;
    address private constant _PRICE_PROVIDER_6 = 0x4C6f83Faa74106139FcB08d4E49568e0Df222815;
    address private constant _PRICE_PROVIDER_7 = 0x60930D9f74811B525356E68D23977baEAb7706d0;
    address private constant _PRICE_PROVIDER_8 = 0x4CF8310ABAe9CA2ACD85f460B509eE495F36eFAF;
    address private constant _PRICE_PROVIDER_9 = 0xc1D5b940659e57b7bDF8870CDfC43f41Ca699460;
    address private constant _PRICE_PROVIDER_10 = 0x2BC37a0368E86cA0d14Bc8788D45c75deabaC064;
    address private constant _PRICE_PROVIDER_11 = 0x9277491f485460575918B43f5d6D5b2BB8c5A62d;
    address private constant _PRICE_PROVIDER_12 = 0x11D23F3dbf8B8e1cf61AeF77A2ea0592Bc9860E0;
    address private constant _PRICE_PROVIDER_13 = 0x41FB6b8d0f586E73d575bC57CFD29142B3214A47;
    address private constant _PRICE_PROVIDER_14 = 0x91dC1fe6472e18Fd2C9407e438dD022f22891a4f;
    address private constant _PRICE_PROVIDER_15 = 0xa50abc5D76dAb99d5fe59FD32f239Bd37d55025f;
    address private constant _PRICE_PROVIDER_16 = 0xC1068312a6333e6601f937c4773065B70D38A5bF;
    address private constant _PRICE_PROVIDER_17 = 0x496f4E8aC11076350A59b88D2ad62bc20d410EA3;
    address private constant _PRICE_PROVIDER_18 = 0x4bbb86992E94AA209c52ecfd38897A18bde8E39D;
    address private constant _PRICE_PROVIDER_19 = 0x3BEFDd935b50F172e696A5187DBaCfEf0D208e48;
    address private constant _PRICE_PROVIDER_20 = 0xF5c14165fb10Ac4926d52504a9B45550411A3C0F;
    address private constant _PRICE_PROVIDER_21 = 0xDf6b1cA313beE470D0142279791Fa760ABF5C537;
    address private constant _PRICE_PROVIDER_22 = 0x1Cd8F9627a2838a7DAE6b98CF71c08B9CbF5174a;
    address private constant _PRICE_PROVIDER_23 = 0xe9Fa2869C5f6fC3A0933981825564FD90573A86D;

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
  return IYieldYakRouter(0x8A93d247134d91e0de6f96547cB0204e5BE8e5D8);
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

    function getPriceProvider3() internal view returns (address) {
        return _PRICE_PROVIDER_3;
    }

        function getPriceProvider4() internal view returns (address) {
        return _PRICE_PROVIDER_4;
    }

        function getPriceProvider5() internal view returns (address) {
        return _PRICE_PROVIDER_5;
    }

        function getPriceProvider6() internal view returns (address) {
        return _PRICE_PROVIDER_6;
    }

        function getPriceProvider7() internal view returns (address) {
        return _PRICE_PROVIDER_7;
    }

        function getPriceProvider8() internal view returns (address) {
        return _PRICE_PROVIDER_8;
    }

        function getPriceProvider9() internal view returns (address) {
        return _PRICE_PROVIDER_9;
    }

        function getPriceProvider10() internal view returns (address) {
        return _PRICE_PROVIDER_10;
    }

        function getPriceProvider11() internal view returns (address) {
        return _PRICE_PROVIDER_11;
    }

        function getPriceProvider12() internal view returns (address) {
        return _PRICE_PROVIDER_12;
    }

        function getPriceProvider13() internal view returns (address) {
        return _PRICE_PROVIDER_13;
    }

        function getPriceProvider14() internal view returns (address) {
        return _PRICE_PROVIDER_14;
    }

        function getPriceProvider15() internal view returns (address) {
        return _PRICE_PROVIDER_15;
    }

        function getPriceProvider16() internal view returns (address) {
        return _PRICE_PROVIDER_16;
    }

        function getPriceProvider17() internal view returns (address) {
        return _PRICE_PROVIDER_17;
    }

        function getPriceProvider18() internal view returns (address) {
        return _PRICE_PROVIDER_18;
    }

        function getPriceProvider19() internal view returns (address) {
        return _PRICE_PROVIDER_19;
    }

        function getPriceProvider20() internal view returns (address) {
        return _PRICE_PROVIDER_20;
    }

        function getPriceProvider21() internal view returns (address) {
        return _PRICE_PROVIDER_21;
    }

        function getPriceProvider22() internal view returns (address) {
        return _PRICE_PROVIDER_22;
    }

        function getPriceProvider23() internal view returns (address) {
        return _PRICE_PROVIDER_23;
    }

    function getPoolTokens() internal view returns (IERC20Metadata[1] memory) {
        return [
      IERC20Metadata(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7)
        ];
    }

    function getPools() internal view returns (ERC20Pool[1] memory) {
        return [
      ERC20Pool(0xb9bEECD1A582768711dE1EE7B0A1d582D9d72a6C)
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
    function getPoolsAssetsIndices() internal view returns (uint8[1] memory) {
    return [0];
    }

    //TODO: remember that it will be updated with a deployment script...
    function getPoolAddress(bytes32 poolToken) internal view returns (address) {
    if (poolToken == bytes32("AVAX")) return 0xb9bEECD1A582768711dE1EE7B0A1d582D9d72a6C;

        return address(0);
    }


}