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

contract LiquidationFlashloan is FlashLoanReceiverBase, OwnableUpgradeable {
  using TransferHelper for address payable;
  using TransferHelper for address;

  struct AssetAmount {
    address asset;
    uint256 amount;
  }

  struct FlashLoanArgs {
    address _receiverAddress;
    address[] _assets;
    uint256[] _amounts;
    uint256[] _interestRateModes;
    address _onBehalfOf;
    bytes _params;
    uint16 _referralCode;
    address _liquidationFacet;
  }

  AssetAmount[] assetSurplus;
  AssetAmount[] assetDeficit;
  uint256[] amounts;

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
    console.log('6');
    // approves
    for (uint32 i = 0; i < _assets.length; i++) {
      IERC20(_assets[i]).approve(_initiator, 0);
      IERC20(_assets[i]).approve(_initiator, _amounts[i]);
      IERC20(_assets[i]).approve(address(POOL), 0);
      IERC20(_assets[i]).approve(address(POOL), _amounts[i] + _premiums[i]);
      // address(_assets[i]).safeApprove(_initiator, 0);
      // address(_assets[i]).safeApprove(_initiator, _amounts[i]);
      // address(POOL).safeApprove(_initiator, 0);
      // address(POOL).safeApprove(_initiator, _amounts[i] + _premiums[i]);
    }

    // liquidation
    uint256 bonus = toUint256(_params);
    liquidationFacet.liquidateLoan(_amounts, bonus); //needs redstone calldata!!!!(temp: setter for bonus) ProxyConnecter.proxyCalldata, copy as call data, arguemtn -> calldata

    // calculate surpluses & deficits
    for (uint32 i = 0; i < _assets.length; i++) {
      int256 amount = int256(
        IERC20Metadata(_assets[i]).balanceOf(_initiator)
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
        if(swapToNegateDeficits(assetDeficit[i], assetSurplus[j], _initiator)){
          break;
        }
      }
    }

    // // success
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
  ) public {
    console.log('4');
    IPool(address(POOL)).flashLoan(
    // POOL.flashLoan(
      _receiverAddress,
      _assets,
      _amounts,
      _interestRateModes,
      _onBehalfOf,
      // _params,
      "",
      _referralCode
    );
    console.log('5');
  }

  function executeFlashloan( //todo: call directly, IPOOL doesnt work at all, execteOps doesnt work
    FlashLoanArgs calldata args
  ) public {
    console.log('1');
    setLiquidationFacet(args._liquidationFacet);
    console.log('2');
    // POOL.flashLoan(
    //   args._receiverAddress,
    //   args._assets,
    //   args._amounts,
    //   args._interestRateModes,
    //   args._onBehalfOf,
    //   args._params,
    //   args._referralCode
    // );
    console.log('args._receiverAddress');
    console.log(args._receiverAddress);
    console.log('args._assets');
    for (uint32 i = 0; i < args._assets.length; i++) {
      console.log(args._assets[i]);
    }
    console.log('args._amounts');
   for (uint32 i = 0; i < args._amounts.length; i++) {
      console.log(args._amounts[i]);
    }
    console.log('args._interestRateModes');
       for (uint32 i = 0; i < args._interestRateModes.length; i++) {
      console.log(args._interestRateModes[i]);
    }
    console.log('args._onBehalfOf');
    console.log(args._onBehalfOf);
    // console.log(args._params);
    console.log('args._referralCode');
    console.log(args._referralCode);
    flashloan(
        args._receiverAddress,
      args._assets,
      args._amounts,
      args._interestRateModes,
      args._onBehalfOf,
      args._params,
      args._referralCode);
    console.log('3');
  }

  function swapToNegateDeficits(AssetAmount memory _deficit, AssetAmount memory _surplus, address _initiator) private returns (bool shouldBreak){
        uint256 soldTokenAmountNeeded = pangolinExchange
          .getEstimatedTokensForTokens(
            _deficit.amount,
            _surplus.asset,
            _deficit.asset
          );
          
        if (soldTokenAmountNeeded > _surplus.amount) {
          // uint256 amounts2 = getEstimatedTokensFromTokens(_surplus.amount, _surplus.address, _deficit.address);
          amounts = pangolinRouter.swapExactTokensForTokens(
            _surplus.amount,
            (soldTokenAmountNeeded * _deficit.amount) /
              _surplus.amount,
            pangolinExchange.getPath(_deficit.asset, _surplus.asset), //migrate getPaht here
            _initiator,
            block.timestamp
          );
          return false;
        } else {
          amounts = pangolinRouter.swapTokensForExactTokens(
            _deficit.amount,
            soldTokenAmountNeeded,
            pangolinExchange.getPath(_surplus.asset, _deficit.asset),
            _initiator,
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
