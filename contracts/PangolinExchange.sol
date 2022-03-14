// SPDX-License-Identifier: UNLICENSED
// Last deployed from commit: c5c938a0524b45376dd482cd5c8fb83fa94c2fcc;
pragma solidity ^0.8.4;

import "@pangolindex/exchange-contracts/contracts/pangolin-periphery/interfaces/IPangolinRouter.sol";
import "@pangolindex/exchange-contracts/contracts/pangolin-core/interfaces/IPangolinFactory.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./interfaces/IAssetsExchange.sol";
import "./lib/Bytes32EnumerableMap.sol";

/**
 * @title PangolinExchange
 * @dev Contract allows user to invest into an ERC20 token
 * This implementation uses the Pangolin DEX
 */
contract PangolinExchange is OwnableUpgradeable, IAssetsExchange, ReentrancyGuardUpgradeable {
  using TransferHelper for address payable;
  using TransferHelper for address;

  /* ========= STATE VARIABLES ========= */
  IPangolinRouter pangolinRouter;
  IPangolinFactory pangolinFactory;


  using EnumerableMap for EnumerableMap.Bytes32ToAddressMap;
  EnumerableMap.Bytes32ToAddressMap private supportedAssetsMap;

  address private constant WAVAX_ADDRESS = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;

  // first supportedAsset must be a blockchain native currency
  function initialize(address _pangolinRouter, address _pangolinFactory, Asset[] memory supportedAssets) external initializer {
    pangolinRouter = IPangolinRouter(_pangolinRouter);
    pangolinFactory = IPangolinFactory(_pangolinFactory);

    _updateAssets(supportedAssets);
    __Ownable_init();
    __ReentrancyGuard_init();
  }

  /**
   * Buys selected ERC20 token with AVAX using the Pangolin DEX
   * Refunds unused AVAX to the msg.sender
   * @dev _token ERC20 token's address
   * @dev _exactERC20AmountOut amount of the ERC20 token to be bought
   **/
  function buyAsset(bytes32 _token, uint256 _exactERC20AmountOut) external payable override nonReentrant returns (bool) {
    require(_exactERC20AmountOut != 0, "Amount of tokens to buy has to be greater than 0");
    address tokenAddress = getAssetAddress(_token);
    uint256 amountIn = getEstimatedAVAXForERC20Token(_exactERC20AmountOut, tokenAddress);
    require(msg.value >= amountIn, "Not enough funds were provided");

    address[] memory path = getPathForAVAXtoToken(tokenAddress);
    (bool success, ) = address(pangolinRouter).call{value: msg.value}(
      abi.encodeWithSignature("swapAVAXForExactTokens(uint256,address[],address,uint256)", _exactERC20AmountOut, path, msg.sender, block.timestamp)
    );

    payable(msg.sender).safeTransferETH(address(this).balance);
    emit TokenPurchase(msg.sender, _exactERC20AmountOut, block.timestamp, success);
    return success;
  }

  /**
   * Sells selected ERC20 token for AVAX
   * @dev _token ERC20 token's address
   * @dev _exactERC20AmountIn amount of the ERC20 token to be sold
   * @dev _minamountAVAXOut minimum amount of the AVAX token to be bought
   **/
  function sellAsset(bytes32 _token, uint256 _exactERC20AmountIn, uint256 _minamountAVAXOut) external override nonReentrant returns (bool) {
    require(_exactERC20AmountIn > 0, "Amount of tokens to sell has to be greater than 0");

    address tokenAddress = getAssetAddress(_token);
    IERC20 token = IERC20(tokenAddress);
    address(token).safeApprove(address(pangolinRouter), 0);
    address(token).safeApprove(address(pangolinRouter), _exactERC20AmountIn);

    (bool success, ) = address(pangolinRouter).call{value: 0}(
      abi.encodeWithSignature("swapExactTokensForAVAX(uint256,uint256,address[],address,uint256)", _exactERC20AmountIn, _minamountAVAXOut, getPathForTokenToAVAX(tokenAddress), msg.sender, block.timestamp)
    );

    if (!success) {
      address(token).safeTransfer(msg.sender, token.balanceOf(address(this)));
      return false;
    }
    payable(msg.sender).safeTransferETH(address(this).balance);
    emit TokenSell(msg.sender, _exactERC20AmountIn, block.timestamp, success);
    return true;
  }

  /**
   * Adds or updates supported assets
   * @dev _assets assets to be added or updated
   **/
  function _updateAssets(Asset[] memory _assets) internal {
    for (uint256 i = 0; i < _assets.length; i++) {
      require(_assets[i].asset != "", "Cannot set an empty string asset.");
      require(_assets[i].assetAddress != address(0), "Cannot set an empty address.");

      EnumerableMap.set(supportedAssetsMap, _assets[i].asset, _assets[i].assetAddress);
    }

    emit AssetsAdded(_assets);
  }

  /**
   * Adds liquidity to _token/WAVAX LP
   * @dev _token token to be added to _token/WAVAX LP
   * @dev amountTokenDesired target _token amount to be added to the LP
   * @dev amountTokenMin minimum amount of _token to be added to the LP
   * @dev msg.value target AVAX amount to be added to the LP
   * @dev amountAVAXMin minimum amount of AVAX to be added to the LP
   * @dev deadline epoch time before which the transaction must be executed
   **/
  function addLiquidityAVAX(
    bytes32 _tokenA,
    uint amountTokenDesired,
    uint amountTokenMin,
    uint amountAVAXMin,
    uint deadline
  ) public nonReentrant payable returns(bool success) {
    require(amountTokenDesired >= amountTokenMin, "amountTokenMin cannot be greater than amountTokenDesired");
    require(msg.value >= amountAVAXMin, "amountAVAXMin cannot be greater than amount of AVAX sent along with the tx");

    address tokenAAddress = getAssetAddress(_tokenA);
    IERC20 tokenAContract = IERC20(tokenAAddress);
    tokenAContract.approve(address(pangolinRouter), amountTokenDesired);

    bytes memory result;
    (success, result) = address(pangolinRouter).call{value: msg.value}(
      abi.encodeWithSignature(
        "addLiquidityAVAX(address,uint256,uint256,uint256,address,uint256)",
        tokenAAddress,
        amountTokenDesired,
        amountTokenMin,
        amountAVAXMin,
        msg.sender,
        deadline
      )
    );
    uint256 amountTokenA;
    uint256 amountAVAX;
    uint256 liquidity;
    assembly {
      amountTokenA := mload(add(result, 32))
      amountAVAX := mload(add(result, 64))
      liquidity := mload(add(result, 96))
    }

    address pairAddress = pangolinFactory.getPair(tokenAAddress, WAVAX_ADDRESS);
    emit LiquidityAdded(msg.sender, pairAddress, amountTokenA, amountAVAX, liquidity);

    // Return leftover AVAX
    payable(msg.sender).safeTransferETH(address(this).balance);
    if (!success) {
      tokenAAddress.safeTransfer(msg.sender, tokenAContract.balanceOf(address(this)));
      return false;
    }
    return true;
  }


  function removeLiquidityAVAX(
    bytes32 _tokenA,
    uint256 liquidity,
    uint256 amountTokenMin,
    uint256 amountAVAXMin,
    uint256 deadline
  ) public nonReentrant returns (bool success) {
    require(liquidity > 0, "Number of LP tokens to remove has to be > 0");

    address tokenAAddress = getAssetAddress(_tokenA);
    address pairAddress = pangolinFactory.getPair(tokenAAddress, WAVAX_ADDRESS);
    IERC20 pairTokenContract = IERC20(pairAddress);
    bytes memory result;

    pairTokenContract.approve(address(pangolinRouter), liquidity);

    (success, result) = address(pangolinRouter).call(
      abi.encodeWithSignature(
        "removeLiquidityAVAX(address,uint256,uint256,uint256,address,uint256)",
        tokenAAddress,
        liquidity,
        amountTokenMin,
        amountAVAXMin,
        msg.sender,
        deadline
      )
    );
    uint256 amountTokenA;
    uint256 amountAVAX;
    assembly {
      amountTokenA := mload(add(result, 32))
      amountAVAX := mload(add(result, 64))
    }

    emit LiquidityRemoved(msg.sender, pairAddress, amountTokenA, amountAVAX, liquidity);

    if (!success) {
      pairAddress.safeTransfer(msg.sender, pairTokenContract.balanceOf(address(this)));
      return false;
    }
    payable(msg.sender).safeTransferETH(address(this).balance);
    tokenAAddress.safeTransfer(msg.sender, IERC20(tokenAAddress).balanceOf(address(this)));
    return true;
  }


  /**
   * Adds or updates supported assets
   * @dev _assets assets to be added/updated
   **/
  function updateAssets(Asset[] memory _assets) external override onlyOwner {
    _updateAssets(_assets);
  }

  /**
   * Removes supported assets
   * @dev _assets assets to be removed
   **/
  function removeAssets(bytes32[] calldata _assets) external override onlyOwner {
    for (uint256 i = 0; i < _assets.length; i++) {
      EnumerableMap.remove(supportedAssetsMap, _assets[i]);
    }

    emit AssetsRemoved(_assets);
  }

  /**
   * Returns all the supported assets keys
   **/
  function getAllAssets() external view override returns (bytes32[] memory result) {
    return supportedAssetsMap._inner._keys._inner._values;
  }

  /**
   * Returns address of an asset
   **/
  function getAssetAddress(bytes32 _asset) public view override returns (address) {
    (, address assetAddress) = EnumerableMap.tryGet(supportedAssetsMap, _asset);
    require(assetAddress != address(0), "Asset not supported.");

    return assetAddress;
  }

  /* ========== RECEIVE AVAX FUNCTION ========== */
  receive() external payable {}

  /* ========== VIEW FUNCTIONS ========== */

  // Initial audit comment: Three below functions can in theory fail if there would be no liquidity at DEX but in this case
  // we can just remove a given asset from supported assets or change all calls to the below functions to an external .call
  // and handle a failure in our code. It is yet to be decided upon.

  /**
   * Returns the minimum token amount that is required to be sold to receive _exactAmountOut of AVAX.
   **/
  function getMinimumERC20TokenAmountForExactAVAX(uint256 _exactAmountOut, address _token) public view override returns (uint256) {
    address[] memory path = getPathForTokenToAVAX(_token);

    return pangolinRouter.getAmountsIn(_exactAmountOut, path)[0];
  }

  /**
   * Returns the minimum AVAX amount that is required to buy _exactAmountOut of _token ERC20 token.
   **/
  function getEstimatedAVAXForERC20Token(uint256 _exactAmountOut, address _token) public view returns (uint256) {
    address[] memory path = getPathForAVAXtoToken(_token);

    return pangolinRouter.getAmountsIn(_exactAmountOut, path)[0];
  }

  /**
   * Returns the maximum AVAX amount that will be obtained in the event of selling _amountIn of _token ERC20 token.
   **/
  function getEstimatedAVAXFromERC20Token(uint256 _amountIn, address _token) public view override returns (uint256) {
    address[] memory path = getPathForTokenToAVAX(_token);

    return pangolinRouter.getAmountsOut(_amountIn, path)[1];
  }

  /**
   * Returns a path containing WAVAX token's address and chosen ERC20 token's address
   * @dev _token ERC20 token's address
   **/
  function getPathForAVAXtoToken(address _token) private view returns (address[] memory) {
    address[] memory path = new address[](2);
    path[0] = WAVAX_ADDRESS;
    path[1] = _token;
    return path;
  }

  /**
   * Returns a path containing chosen ERC20 token's address and WAVAX token's address
   * @dev _token ERC20 token's address
   **/
  function getPathForTokenToAVAX(address _token) private view returns (address[] memory) {
    address[] memory path = new address[](2);
    path[0] = _token;
    path[1] = WAVAX_ADDRESS;
    return path;
  }

  /* ========== EVENTS ========== */

  /**
   * @dev emitted after a tokens were purchased
   * @param buyer the address which bought tokens
   * @param amount the amount of token bought
   **/
  event TokenPurchase(address indexed buyer, uint256 amount, uint256 timestamp, bool success);

  /**
   * @dev emitted after a tokens were sold
   * @param seller the address which sold tokens
   * @param amount the amount of token sold
   **/
  event TokenSell(address indexed seller, uint256 amount, uint256 timestamp, bool success);

  /* ========== EVENTS ========== */

  /**
   * @dev emitted after the owner adds/updates assets
   * @param assets added/updated assets
   **/
  event AssetsAdded(Asset[] assets);

  /**
   * @dev emitted after the owner removes assets
   * @param removedAssets removed assets
   **/
  event AssetsRemoved(bytes32[] removedAssets);

  /**
   * @dev emitted after adding liquidity to a LP
   * @param provider Address of the wallet that added liquidity
   * @param pair Address of the LP pair
   * @param tokenAAmount Amount of tokenA added to a LP
   * @param tokenBAmount Amount of tokenB added to a LP
   * @param LPTokens Amount of LP tokens received
   **/
  event LiquidityAdded(address indexed provider, address pair, uint256 tokenAAmount, uint256 tokenBAmount, uint256 LPTokens);


  /**
   * @dev emitted after removing liquidity from a LP
   * @param provider Address of the wallet that removed liquidity
   * @param pair Address of the LP pair
   * @param tokenAAmount Amount of tokenA received from a LP
   * @param tokenBAmount Amount of tokenB received from a LP
   * @param LPTokens Amount of LP tokens returned to a LP
   **/
  event LiquidityRemoved(address indexed provider, address pair, uint256 tokenAAmount, uint256 tokenBAmount, uint256 LPTokens);

}