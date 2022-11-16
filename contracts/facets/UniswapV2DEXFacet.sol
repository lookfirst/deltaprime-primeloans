// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: ;
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../ReentrancyGuardKeccak.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "../lib/SolvencyMethods.sol";
import {DiamondStorageLib} from "../lib/DiamondStorageLib.sol";

//This path is updated during deployment
import "../lib/local/DeploymentConstants.sol";
import "../interfaces/IAssetsExchange.sol";

contract UniswapV2DEXFacet is ReentrancyGuardKeccak, SolvencyMethods {
    using TransferHelper for address payable;
    using TransferHelper for address;

    function getProtocolID() pure internal virtual returns (bytes32) {
        return "";
    }

    function stringToBytes32(string memory source) public pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(source, 32))
        }
    }

    function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
        uint8 i = 0;
        while(i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }

    /**
    * Swaps one asset with another
    * @param _soldAsset asset to be sold
    * @param _boughtAsset asset to be bought
    * @param _exactSold exact amount of asset to be sold
    * @param _minimumBought minimum amount of asset to be bought
    **/
    function swapAssets(bytes32 _soldAsset, bytes32 _boughtAsset, uint256 _exactSold, uint256 _minimumBought) internal remainsSolvent returns (uint256[] memory) {
        IERC20Metadata soldToken = getERC20TokenInstance(_soldAsset, true);
        IERC20Metadata boughtToken = getERC20TokenInstance(_boughtAsset, false);

        require(soldToken.balanceOf(address(this)) >= _exactSold, "Not enough token to sell");
        address(soldToken).safeTransfer(getExchangeIntermediaryContract(), _exactSold);

        IAssetsExchange exchange = IAssetsExchange(getExchangeIntermediaryContract());

        uint256[] memory amounts = exchange.swap(address(soldToken), address(boughtToken), _exactSold, _minimumBought);

        TokenManager tokenManager = DeploymentConstants.getTokenManager();
        // Add asset to ownedAssets
        address boughtAssetAddress = tokenManager.getAssetAddress(_boughtAsset, false);

        if (boughtToken.balanceOf(address(this)) > 0) {
            DiamondStorageLib.addOwnedAsset(_boughtAsset, boughtAssetAddress);
        }

        // Remove asset from ownedAssets if the asset balance is 0 after the swap
        if (soldToken.balanceOf(address(this)) == 0) {
            DiamondStorageLib.removeOwnedAsset(_soldAsset);
        }

        emit Swap(msg.sender, _soldAsset, _boughtAsset, amounts[0], amounts[amounts.length - 1], block.timestamp);

        return amounts;
    }

    /**
    * Adds liquidity
    **/
    function addLiquidity(bytes32 _assetA, bytes32 _assetB, uint amountA, uint amountB, uint amountAMin, uint amountBMin) internal remainsSolvent {
        IERC20Metadata tokenA = getERC20TokenInstance(_assetA, true);
        IERC20Metadata tokenB = getERC20TokenInstance(_assetB, false);

        require(tokenA.balanceOf(address(this)) >= amountA, "Not enough tokenA to provide");
        require(tokenB.balanceOf(address(this)) >= amountB, "Not enough tokenB to provide");

        address(tokenA).safeTransfer(getExchangeIntermediaryContract(), amountA);
        address(tokenB).safeTransfer(getExchangeIntermediaryContract(), amountB);

        IAssetsExchange exchange = IAssetsExchange(getExchangeIntermediaryContract());

        address lpTokenAddress;
        uint liquidity;

        (lpTokenAddress, amountA, amountB, liquidity)
          = exchange.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, amountAMin, amountBMin);

        if (IERC20Metadata(lpTokenAddress).balanceOf(address(this)) > 0) {
            (bytes32 token0, bytes32 token1) = _assetA < _assetB ? (_assetA, _assetB) : (_assetB, _assetA);
            bytes32 lpToken = stringToBytes32(string.concat(
                    bytes32ToString(getProtocolID()),
                        '_',
                        bytes32ToString(token0),
                        '_',
                        bytes32ToString(token1),
                        '_LP'
                )
            );
            DiamondStorageLib.addOwnedAsset(lpToken, lpTokenAddress);
        }

        // Remove asset from ownedAssets if the asset balance is 0 after the LP
        if (tokenA.balanceOf(address(this)) == 0) {
            DiamondStorageLib.removeOwnedAsset(_assetA);
        }

        if (tokenB.balanceOf(address(this)) == 0) {
            DiamondStorageLib.removeOwnedAsset(_assetB);
        }

        emit AddLiquidity(msg.sender, lpTokenAddress, _assetA, _assetB, liquidity, amountA, amountB, block.timestamp);
    }

    /**
    * Removes liquidity
    **/
    function removeLiquidity(bytes32 _assetA, bytes32 _assetB, uint liquidity, uint amountAMin, uint amountBMin) internal remainsSolvent {
        IERC20Metadata tokenA = getERC20TokenInstance(_assetA, true);
        IERC20Metadata tokenB = getERC20TokenInstance(_assetB, false);

        IAssetsExchange exchange = IAssetsExchange(getExchangeIntermediaryContract());

        address lpTokenAddress = exchange.getPair(address(tokenA), address(tokenB));

        lpTokenAddress.safeTransfer(getExchangeIntermediaryContract(), liquidity);

        (uint amountA, uint amountB) = exchange.removeLiquidity(address(tokenA), address(tokenB), liquidity, amountAMin, amountBMin);

        // Remove asset from ownedAssets if the asset balance is 0 after the LP
        if (IERC20Metadata(lpTokenAddress).balanceOf(address(this)) == 0) {
            (bytes32 token0, bytes32 token1) = _assetA < _assetB ? (_assetA, _assetB) : (_assetB, _assetA);
            bytes32 lpToken = stringToBytes32(string.concat(
                    bytes32ToString(getProtocolID()),
                    '_',
                    bytes32ToString(token0),
                    '_',
                    bytes32ToString(token1)
                )
            );
            DiamondStorageLib.removeOwnedAsset(lpToken);
        }
        DiamondStorageLib.addOwnedAsset(_assetA, address(tokenA));
        DiamondStorageLib.addOwnedAsset(_assetB, address(tokenB));

        emit RemoveLiquidity(msg.sender, lpTokenAddress, _assetA, _assetB, liquidity, amountA, amountB, block.timestamp);
    }

    /**
     * Returns address of DeltaPrime intermediary contract of UniswapV2-like exchange
     **/
    //TO BE OVERRIDDEN
    function getExchangeIntermediaryContract() public virtual returns (address) {
        return address(0);
    }

    modifier onlyOwner() {
        DiamondStorageLib.enforceIsContractOwner();
        _;
    }

    /**
     * @dev emitted after a swap of assets
     * @param user the address of user making the purchase
     * @param soldAsset sold by the user
     * @param boughtAsset bought by the user
     * @param maximumSold maximum to be sold
     * @param minimumBought minimum to be bought
     * @param timestamp time of the swap
     **/
    event Swap(address indexed user, bytes32 indexed soldAsset, bytes32 indexed boughtAsset, uint256 maximumSold, uint256 minimumBought, uint256 timestamp);

    /**
     * @dev emitted after providing liquidity
     * @param user the address of user providing liquidity
     * @param lpToken the address LP token
     * @param firstAsset first asset provided for liquidity
     * @param secondAsset second asset provided for liquidity
     * @param liquidity amount of liquidity (LP token) added
     * @param firstAmount amount of the first asset used
     * @param secondAmount amount of the second asset used
     * @param timestamp time of the transaction
     **/
    event AddLiquidity(address indexed user, address indexed lpToken, bytes32 firstAsset, bytes32 secondAsset, uint liquidity, uint firstAmount, uint secondAmount, uint256 timestamp);

    /**
     * @dev emitted after removing liquidity
     * @param user the address of user providing liquidity
     * @param lpToken the address LP token
     * @param firstAsset first asset from LP position
     * @param secondAsset second asset from LP position
     * @param liquidity amount of liquidity (LP token) removed
     * @param firstAmount amount of the first asset obtained
     * @param secondAmount amount of the second asset obtained
     * @param timestamp time of the transaction
     **/
    event RemoveLiquidity(address indexed user, address indexed lpToken, bytes32 firstAsset, bytes32 secondAsset, uint liquidity, uint firstAmount, uint secondAmount, uint256 timestamp);
}