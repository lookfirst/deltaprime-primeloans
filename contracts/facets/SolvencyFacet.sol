// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: ;
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "redstone-evm-connector/lib/contracts/message-based/PriceAware.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../TokenManager.sol";
import "../Pool.sol";
import "../DiamondHelper.sol";
import "../interfaces/IStakingPositions.sol";
//TODO: remove
import "hardhat/console.sol";


//This path is updated during deployment
import "../lib/local/DeploymentConstants.sol";

contract SolvencyFacet is PriceAware, DiamondHelper {

    /* ========== REDSTONE-EVM-CONNECTOR OVERRIDDEN FUNCTIONS ========== */

    /**
     * Override PriceAware method to consider Avalanche guaranteed block timestamp time accuracy
     **/
    function getMaxBlockTimestampDelay() public virtual override view returns (uint256) {
        return 30;
    }

    /**
     * Override PriceAware method, addresses below belong to authorized signers of data feeds
     **/
    function isSignerAuthorized(address _receivedSigner) public override virtual view returns (bool) {
        return DeploymentConstants.getRedstoneConfigManager().signerExists(_receivedSigner);
    }

    /* ================== */

    /**
    * Checks if the loan is solvent.
    * It means that the ratio between borrowing power and current devt (defined as total value minus debt) is above safe level
    * @dev This function uses the redstone-evm-connector
    **/
    function isSolvent() public view returns (bool) {
        return getHealthRatio() >= 1e18;
    }

    function getPrices(bytes32[] memory symbols) external view returns (uint256[] memory) {
        return getPricesFromMsg(symbols);
    }

    function getPrice(bytes32 symbol) external view returns (uint256) {
        return getPriceFromMsg(symbol);
    }

    /**
   * Returns the current debt from all lending pools
   * @dev This function uses the redstone-evm-connector
   **/
    function getDebt() public view virtual returns (uint256) {
        uint256 debt = 0;
        TokenManager tokenManager = DeploymentConstants.getTokenManager();
        bytes32[] memory assets = tokenManager.getAllPoolAssets();
        uint256[] memory prices = getPricesFromMsg(assets);

        for (uint256 i = 0; i < assets.length; i++) {
            IERC20Metadata token = IERC20Metadata(tokenManager.getAssetAddress(assets[i], true));

            Pool pool = Pool(tokenManager.getPoolAddress(assets[i]));
            //10**18 (wei in eth) / 10**8 (precision of oracle feed) = 10**10
            debt = debt + pool.getBorrowed(address(this)) * prices[i] * 10 ** 10
            / 10 ** token.decimals();
        }

        return debt;
    }

    /**
     * Returns the current value of Prime Account in USD including all tokens as well as staking and LP positions
     * @dev This function uses the redstone-evm-connector
     **/
    function getTotalAssetsValue() public view virtual returns (uint256) {
        bytes32[] memory assets = DeploymentConstants.getAllOwnedAssets();
        uint256[] memory prices = getPricesFromMsg(assets);
        uint256 nativeTokenPrice = getPriceFromMsg(DeploymentConstants.getNativeTokenSymbol());
        if (prices.length > 0) {
            TokenManager tokenManager = DeploymentConstants.getTokenManager();

            uint256 total = address(this).balance * nativeTokenPrice / 10 ** 8;

            for (uint256 i = 0; i < prices.length; i++) {
                require(prices[i] != 0, "Asset price returned from oracle is zero");

                IERC20Metadata token = IERC20Metadata(tokenManager.getAssetAddress(assets[i], true));
                uint256 assetBalance = token.balanceOf(address(this));

                total = total + (prices[i] * 10 ** 10 * assetBalance / (10 ** token.decimals()));
            }

            return total;
        } else {
            return 0;
        }
    }


    /**
     * Returns the current value of assets value in USD including all tokens as well as staking and LP positions
     * @dev This function uses the redstone-evm-connector
     **/
    function getMaxDebt() public view virtual returns (uint256) {
        bytes32[] memory assets = DeploymentConstants.getAllOwnedAssets();
        uint256[] memory prices = getPricesFromMsg(assets);
        uint256 nativeTokenPrice = getPriceFromMsg(DeploymentConstants.getNativeTokenSymbol());
        if (prices.length > 0) {
            TokenManager tokenManager = DeploymentConstants.getTokenManager();

            uint256 total;

            for (uint256 i = 0; i < prices.length; i++) {
                require(prices[i] != 0, "Asset price returned from oracle is zero");

                IERC20Metadata token = IERC20Metadata(tokenManager.getAssetAddress(assets[i], true));
                address poolAddress = tokenManager.getPoolAddress(assets[i]);
                uint256 borrowed;

                if (poolAddress != address(0)) {
                    Pool pool = Pool(tokenManager.getPoolAddress(assets[i]));
                    borrowed = pool.getBorrowed(address(this));
                }

                total = total + (prices[i] * 10 ** 10 * token.balanceOf(address(this)) * tokenManager.maxTokenLeverage(address(token)) / (10 ** token.decimals() * 1e18));
            }

            return total;
        } else {
            return 0;
        }
    }

    function getStakedValue() public view virtual returns (uint256) {
        uint256 valueOfStaked;

        IStakingPositions.StakedPosition[] storage positions = DiamondStorageLib.stakedPositions();

        uint256 usdValue;

        for (uint256 i; i < positions.length; i++) {
            //TODO: fetch multiple prices to reduce cost
            uint256 price = getPriceFromMsg(positions[i].symbol);
            require(price != 0, "Asset price returned from oracle is zero");

            (bool success, bytes memory result) = address(this).staticcall(abi.encodeWithSelector(positions[i].balanceSelector));

            if (success) {
                uint256 balance = abi.decode(result, (uint256));

                IERC20Metadata token = IERC20Metadata(DeploymentConstants.getTokenManager().getAssetAddress(positions[i].symbol, true));

                usdValue += price * 10 ** 10 * balance / (10 ** token.decimals());
            }
        }

        return usdValue;
    }

    function getTotalValue() public view virtual returns (uint256) {
        return getTotalAssetsValue() + getStakedValue();
    }

    function getFullLoanStatus() public returns (uint256[4] memory) {
        return [getTotalValue(), getDebt(), getHealthRatio(), isSolvent() ? uint256(1) : uint256(0)];
    }

    /**
     * Returns current Loan To Value (solvency ratio) associated with the loan, defined as debt / (total value - debt)
     * The collateral is equal to total loan value takeaway debt.
     * @dev This function uses the redstone-evm-connector
     **/
    function getHealthRatio() public view virtual returns (uint256) {
        uint256 debt = getDebt();
        uint256 maxDebt = getMaxDebt();

        if (debt == 0) {
            return 1e18;
        } else {
            return maxDebt * 1e18 / debt;
        }
    }
}
