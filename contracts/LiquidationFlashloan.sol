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

    console.log("bonus :", bonus);
    console.log("before liquidation :", IERC20Metadata(_assets[0]).balanceOf(address(this)));

    for (uint32 i = 0; i < _assets.length; i++) {
      IERC20(_assets[i]).approve(address(liquidationFacet), 0);
      IERC20(_assets[i]).approve(address(liquidationFacet), _amounts[i]);
    }

    // liquidate loan
    {
      (bool success,) = address(liquidationFacet).call(abi.encodePacked(abi.encodeWithSelector(SmartLoanLiquidationFacet.liquidateLoan.selector, _amounts, bonus), _params));
      require(success, "Liquidation failed");
      console.log("after liquidation  :", IERC20Metadata(_assets[0]).balanceOf(address(this)));
      console.log("after liquidation  :", IERC20Metadata(_assets[0]).balanceOf(_initiator));
      console.log("after liquidation  :", IERC20Metadata(_assets[0]).balanceOf(msg.sender));
      console.log("after liquidation  :", IERC20Metadata(_assets[0]).balanceOf(liquidator));
      console.log(success);
    }


    address[10] memory supportedTokens = [
      0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7,
      0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E,
      0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB,
      0x50b7545627a5162F82A992c33b87aDc75187B218,
      0xc7198437980c041c805A1EDcbA50c1Ce5db95118,
      0x60781C2586D68229fde47564546784ab3fACA982,
      0xd1c3f94DE7e5B45fa4eDBBA472491a9f4B166FC4,
      0x5947BB275c521040051D82396192181b413227A3,
      0x59414b3089ce2AF0010e7523Dea7E2b35d776ec7,
      0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5
    ];


    console.log('calculate surpluses & deficits');
    // calculate surpluses & deficits
    for (uint32 i = 0; i < supportedTokens.length; i++) {
      int256 index = findIndex(supportedTokens[i], _assets);

      if (index != -1) {
        int256 amount = int256(IERC20Metadata(_assets[uint256(index)]).balanceOf(address(this))) - int256(_amounts[uint256(index)]) - int256(_premiums[uint256(index)]);
        console.log("amounts :", _amounts[uint256(index)]);
        console.log("amounts + premiums :", _amounts[uint256(index)] + _premiums[uint256(index)]);

        if (amount > 0) {
          assetSurplus.push(AssetAmount(supportedTokens[uint256(index)], uint256(amount)));
          console.log("asset: ", assetSurplus[uint256(index)].asset);
          console.log("surplus: ", assetSurplus[uint256(index)].amount);
        } else if (amount < 0) {
          assetDeficit.push(AssetAmount(supportedTokens[uint256(index)], uint256(amount * -1)));
          console.log("asset: ", assetDeficit[uint256(index)].asset);
          console.log("deficit: ", assetDeficit[uint256(index)].amount);
        }
      } else if (IERC20Metadata(supportedTokens[i]).balanceOf(address(this)) > 0) {
        assetSurplus.push(AssetAmount(supportedTokens[i], uint256(IERC20Metadata(supportedTokens[i]).balanceOf(address(this)))));
      }
    }

    // swap to negate deficits
    for (uint32 i = 0; i < assetDeficit.length; i++) {
      for (uint32 j = 0; j < assetSurplus.length; j++) {
        if (swapToNegateDeficits(assetDeficit[i], assetSurplus[j])) {
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
      console.log("needed    : ", _amounts[i] + _premiums[i]);
      console.log("amount: ", _amounts[i], ", premium: ", _premiums[i]);
      IERC20(_assets[i]).approve(address(POOL), 0);
      IERC20(_assets[i]).approve(address(POOL), _amounts[i] + _premiums[i]);
    }

    //empty arrays
    delete assetSurplus;
    delete assetDeficit;

    // success
    return true;
  }

  function executeFlashloan(
    FlashLoanArgs calldata _args
  ) public {
    setLiquidationFacet(_args.liquidationFacet);
    setBonus(_args.bonus);
    setLiquidator(_args.liquidator);

    console.log("before flashloan   :", IERC20Metadata(_args.assets[0]).balanceOf(address(this)));

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

  //argument storage, bo przechowujemy w tablicy storage
  function swapToNegateDeficits(AssetAmount storage _deficit, AssetAmount storage _surplus) private returns (bool shouldBreak){
        uint256[] memory amounts;
        uint256 soldTokenAmountNeeded = pangolinExchange
          .getEstimatedTokensForTokens(
            _deficit.amount,
            _surplus.asset,
            _deficit.asset
          );
          
        if (soldTokenAmountNeeded > _surplus.amount) {
          address(_surplus.asset).safeApprove(address(pangolinRouter), 0);
          address(_surplus.asset).safeApprove(address(pangolinRouter), _surplus.amount);

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
          address(_surplus.asset).safeApprove(address(pangolinRouter), 0);
          address(_surplus.asset).safeApprove(address(pangolinRouter), soldTokenAmountNeeded);

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

  //TODO: pretty inefficient, find better way
  function findIndex(address addr, address[] memory array) internal view returns (int256){
    int256 index = -1;
    for (uint256 i; i < array.length; i++) {
      if (array[i] == addr) {
        index = int256(i);
      }
    }

    return index;
  }
}
