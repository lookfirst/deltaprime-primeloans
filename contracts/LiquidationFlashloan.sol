pragma solidity ^0.8.15;

import "./aave_v3/flashloan/base/FlashLoanReceiverBase.sol";
import "./faucets/SmartLoanLiquidationFacet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./lib/LTVLib.sol";
import "@pangolindex/exchange-contracts/contracts/pangolin-periphery/interfaces/IPangolinRouter.sol";
import "./PangolinExchange.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

contract LiquidationFlashloan is FlashLoanReceiverBase, OwnableUpgradeable {
  using TransferHelper for address payable;
  using TransferHelper for address;

  struct AssetAmount {
    address asset;
    uint256 amount;
  }

  AssetAmount[] assetSurplus;
  AssetAmount[] assetDeficit;

  SmartLoanLiquidationFacet liquidationFacet;
  IPangolinRouter pangolinRouter;
  PangolinExchange pangolinExchange;

  constructor(
    address _addressProvider,
    address _liquidationFacet,
    address _pangolinRouter,
    address payable _pangolinExchange
  ) FlashLoanReceiverBase(IPoolAddressesProvider(_addressProvider)) {
    liquidationFacet = SmartLoanLiquidationFacet(_liquidationFacet);
    pangolinRouter = IPangolinRouter(_pangolinRouter);
    pangolinExchange = PangolinExchange(_pangolinExchange);
  }

  /**
        This function is called after your contract has received the flash loaned amount
     */
  /**
   * @notice Executes an operation after receiving the flash-borrowed assets
   * @dev Ensure that the contract can return the debt + premium, e.g., has
   *      enough funds to repay and has approved the Pool to pull the total amount
   * @param _assets The addresses of the flash-borrowed assets
   * @param _amounts The amounts of the flash-borrowed assets
   * @param _premiums The fee of each flash-borrowed asset
   * @param _initiator The address of the flashloan initiator
   * @param _params The byte-encoded params passed when initiating the flashloan
   * @return True if the execution of the operation succeeds, false otherwise
   */
  function executeOperation(
    address[] calldata _assets,
    uint256[] calldata _amounts,
    uint256[] calldata _premiums,
    address _initiator,
    bytes calldata _params
  ) external override returns (bool) {
    // approve spending for this contract (loop through _assets)
    for (uint256 i = 0; i < _assets.length; i++) {
      address(_assets[i]).safeApprove(address(this), 0);
      address(_assets[i]).safeApprove(address(this), _amounts[i]);
      address(POOL).safeApprove(address(this), 0);
      address(POOL).safeApprove(address(this), _amounts[i] + _premiums[i]);
    }

    //  function swapTokensForExactTokens(
    //         uint amountOut,
    //         uint amountInMax,
    //         address[] calldata path,
    //         address to,
    //         uint deadline
    //     ) external returns (uint[] memory amounts);

    // convert _params to bonusInWei
    uint256 bonus = toUint256(_params);
    liquidationFacet.liquidateLoan(_amounts, bonus);

    // mapping(address => uint256) surplusMap;
    // mapping(address => uint256) deficitMap;
    // uint32 surplusCounter = 0;
    // uint32 deficitCounter = 0;

    for (uint256 i = 0; i < _assets.length; i++) {
      int256 amount = int256(
        IERC20Metadata(_assets[i]).balanceOf(address(this)) -
          _amounts[i] -
          _premiums[i]
      );
      if (amount > 0) {
        assetSurplus.push(AssetAmount(_assets[i], uint256(amount)));
        // surplusMap[_assets[i]] = amount;
        // surplusCounter++;
      } else if (amount < 0) {
        assetDeficit.push(AssetAmount(_assets[i], uint256(amount * -1)));
        // deficitMap[_assets[i]] = amount * -1;
        // deficitCounter++;
      }
    }

    for (uint256 i = 0; i < assetDeficit.length; i++) {
      // deficitMap[i]
      for (uint256 j = 0; j < assetSurplus.length; j++) {
        //  * Returns the minimum _soldToken amount that is required to be sold to receive _exactAmountOut of a _boughtToken.
        // function getEstimatedTokensForTokens(uint256 _exactAmountOut, address _soldToken, address _boughtToken) public view override returns (uint256) {
        // ile potrzebujemy sprzedac tokenow zeby otrzymac DEFICYT
        uint256 soldTokenAmountNeeded = pangolinExchange
          .getEstimatedTokensForTokens(
            assetDeficit[i].amount,
            assetSurplus[j].asset,
            assetDeficit[i].asset
          );
        if (soldTokenAmountNeeded > assetSurplus[j].amount) {
          //           function swapTokensForExactTokens(
          //     uint amountOut, -- we buy
          //     uint amountInMax, -- we sell
          //     address[] calldata path, -- from sell to buy
          //     address to, -- this address
          //     uint deadline -- block.timestamp
          // ) external returns (uint[] memory amounts);
          // TODO: if not enough surplus to buy all needed deficit
          // use different method to swap = swapExactTokensForTokens
        } else {
          uint256[] memory amounts = pangolinRouter.swapTokensForExactTokens(
            assetDeficit[i].amount,
            soldTokenAmountNeeded,
            pangolinExchange.getPath(_assets[j], _assets[i]),
            address(this),
            block.timestamp
          );
          assetDeficit[i].amount =
            assetDeficit[i].amount -
            amounts[amounts.length - 1];
          assetSurplus[j].amount = assetSurplus[j].amount - amounts[0];
          // amounts[0] -- we sold
          // amounts[amounts.length -1] -- we bought
          break;
        }

        // pangolinRouter.swapTokensForExactTokens(exactAmountOut, amountInMax, pangolinExchange.path(_assets[i]), to, block.timestamp);
      }

      // bytes32 boughtTokenSymbol;
      // string memory symbol = IERC20Metadata(_assets[i]).symbol();
      // assembly {
      //   boughtToken := mload(add(symbol, 32))
      // }

      // pangolinExchange.swap(
      //   "USDC",
      //   boughtToken,
      //   // bytes32(IERC20Metadata(_assets[i]).name()),
      //   _exactAmountIn,
      //   _premiums[i]
      // );
    }

    //TODO: withdraw bonus assetsi to _initiator in a loop or _initiator = liquidator address instead of this

    return true;
  }

  function flashloan(
    address _receiverAddress,
    address[] calldata _assets,
    uint256[] calldata _amounts,
    uint256[] calldata _interestRateModes,
    address _onBehalfOf,
    bytes calldata _params,
    uint16 _referralCode
  ) public onlyOwner {
    // IPool pool = IPool(addressesProvider.getLendingPool());
    POOL.flashLoan(
      address(this),
      _assets,
      _amounts,
      _interestRateModes,
      _onBehalfOf,
      _params,
      _referralCode
    );
  }

  function toUint256(bytes memory _bytes)
    internal
    pure
    returns (uint256 value)
  {
    assembly {
      value := mload(add(_bytes, 0x20))
    }
  }
}
