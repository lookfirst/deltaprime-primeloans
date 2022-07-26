pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./aave_v3/flashloan/base/FlashLoanReceiverBase.sol";
import "./faucets/SmartLoanLiquidationFacet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@pangolindex/exchange-contracts/contracts/pangolin-periphery/interfaces/IPangolinRouter.sol";
import "./PangolinExchange.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "hardhat/console.sol";
import "redstone-evm-connector/lib/contracts/commons/ProxyConnector.sol";

contract LiquidationFlashloan is FlashLoanReceiverBase, OwnableUpgradeable {
  using TransferHelper for address payable;
  using TransferHelper for address;

  struct AssetAmount {
    address asset;
    uint256 amount;
  }

  struct FlashLoanArgs {
    address[] assets;
    uint256[] amounts;
    uint256[] interestRateModes;
    bytes params;
    uint256 bonus;
    address liquidator;
    address liquidationFacet;
  }

  SmartLoanLiquidationFacet liquidationFacet;
  IPangolinRouter pangolinRouter;
  PangolinExchange pangolinExchange;

  AssetAmount[] assetSurplus;
  AssetAmount[] assetDeficit;
  address liquidator;
  uint256 bonus;

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
  ) public override returns (bool) {
    console.log('6');

    // liquidate loan
    //todo: redstone calldata -> _params?
     ProxyConnector.proxyCalldata(address(liquidationFacet), 
      abi.encodeWithSelector(SmartLoanLiquidationFacet.liquidateLoan.selector, _amounts, bonus), 
      false);

    // calculate surpluses & deficits
    for (uint32 i = 0; i < _assets.length; i++) {
      int256 amount = int256(
        IERC20Metadata(_assets[i]).balanceOf(address(this))
      ) -
        int256(_amounts[i]) -
        int256(_premiums[i]);
      if (amount > 0) {
        assetSurplus.push(AssetAmount(_assets[i], uint256(amount)));
      } else if (amount < 0) {
        assetDeficit.push(AssetAmount(_assets[i], uint256(amount * -1)));
      }
    }

    // swap to negate deficits
    for (uint32 i = 0; i < assetDeficit.length; i++) {
      for (uint32 j = 0; j < assetSurplus.length; j++) {
        if(swapToNegateDeficits(assetDeficit[i], assetSurplus[j])){
          break;
        }
      }
    }

    // send remaining tokens (bonus) to initiator
    for (uint32 i = 0; i < assetSurplus.length; i++) {
      address(assetSurplus[i].asset).safeTransfer(
        liquidator,
        assetSurplus[i].amount
      );
    }

    // approves
    for (uint32 i = 0; i < _assets.length; i++) {
      console.log("balance of: ", IERC20(_assets[i]).balanceOf(address(this)));
      console.log("amount: ", _amounts[i], ", premium: ",_premiums[i] );
      IERC20(_assets[i]).approve(address(POOL), 0);
      IERC20(_assets[i]).approve(address(POOL), _amounts[i] + _premiums[i]);
    }

    // success
    return true;
  }

  function executeFlashloan(
    FlashLoanArgs calldata _args
  ) public {
    setLiquidationFacet(_args.liquidationFacet);
    setBonus(_args.bonus);
    setLiquidator(_args.liquidator);
    IPool(address(POOL)).flashLoan(
      address(this),
      _args.assets,
      _args.amounts,
      _args.interestRateModes,
      address(this),
      _args.params,
      0
    );
  }

  function swapToNegateDeficits(AssetAmount memory _deficit, AssetAmount memory _surplus) private returns (bool shouldBreak){
        uint256[] memory amounts;
        uint256 soldTokenAmountNeeded = pangolinExchange
          .getEstimatedTokensForTokens(
            _deficit.amount,
            _surplus.asset,
            _deficit.asset
          );
          
        if (soldTokenAmountNeeded > _surplus.amount) {
          amounts = pangolinRouter.swapExactTokensForTokens(
            _surplus.amount,
            (soldTokenAmountNeeded * _deficit.amount) /
              _surplus.amount,
            pangolinExchange.getPath(_deficit.asset, _surplus.asset), //todo: migrate getPath to this contract
            address(this),
            block.timestamp
          );
          return false;
        } else {
          amounts = pangolinRouter.swapTokensForExactTokens(
            _deficit.amount,
            soldTokenAmountNeeded,
            pangolinExchange.getPath(_surplus.asset, _deficit.asset),
            address(this),
            block.timestamp
          );
          _deficit.amount =
            _deficit.amount -
            amounts[amounts.length - 1];
          _surplus.amount = _surplus.amount - amounts[0];
          return true;
        }
  }

  function setLiquidationFacet(address _liquidationFacet) public {
    liquidationFacet = SmartLoanLiquidationFacet(_liquidationFacet);
  }

  function setLiquidator(address _liquidator) public {
    liquidator = _liquidator;
  }

  function setBonus(uint256 _bonus) public {
    bonus = _bonus;
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
