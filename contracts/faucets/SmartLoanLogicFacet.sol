pragma solidity ^0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "redstone-evm-connector/lib/contracts/message-based/PriceAware.sol";
import "../lib/SmartLoanLib.sol";
import { LibDiamond } from "../lib/LibDiamond.sol";
import "../mock/WAVAX.sol";
import "../ERC20Pool.sol";

// TODO: Optimize getting diamondStorage - once per function
contract SmartLoanLogicFacet is PriceAware, ReentrancyGuard {
    using TransferHelper for address payable;
    using TransferHelper for address;

    /* ========== REDSTONE-EVM-CONNECTOR OVERRIDDEN FUNCTIONS ========== */

    /**
     * Override PriceAware method to consider Avalanche guaranteed block timestamp time accuracy
     **/
    function getMaxBlockTimestampDelay() public virtual override view returns (uint256) {
        return SmartLoanLib.getMaxBlockTimestampDelay();
    }

    /**
     * Override PriceAware method, addresses below belong to authorized signers of data feeds
     **/
    function isSignerAuthorized(address _receivedSigner) public override virtual view returns (bool) {
        return (_receivedSigner == SmartLoanLib.getPriceProvider1()) || (_receivedSigner == SmartLoanLib.getPriceProvider2());
    }

    /* ========== PUBLIC AND EXTERNAL MUTATIVE FUNCTIONS ========== */

    /**
     * Funds the loan with a specified amount of a defined token
     * @dev Requires approval for ERC20 token on frontend side
     **/
    function fund(bytes32 _fundedAsset, uint256 _amount) public virtual {
        IERC20Metadata token = getERC20TokenInstance(_fundedAsset);
        TransferHelper.safeTransferFrom(address(token), msg.sender, address(this), _amount);

        emit Funded(msg.sender, _fundedAsset, _amount, block.timestamp);
    }

    /**
     * Withdraws an amount of a defined asset from the loan
     * This method could be used to cash out profits from investments
     * The loan needs to remain solvent after the withdrawal
     * @param _withdrawnAsset asset to be withdrawn
     * @param _amount to be withdrawn
     * @dev This function uses the redstone-evm-connector
     **/
    function withdraw(bytes32 _withdrawnAsset, uint256 _amount) public virtual onlyOwner nonReentrant remainsSolvent {
        IERC20Metadata token = getERC20TokenInstance(_withdrawnAsset);
        require(getBalance(address(this), _withdrawnAsset) >= _amount, "There is not enough funds to withdraw");

        token.transfer(msg.sender, _amount);

        emit Withdrawn(msg.sender, _withdrawnAsset, _amount, block.timestamp);
    }

    /**
     * Borrows funds from the pool
     * @param _asset to borrow
     * @param _amount of funds to borrow
     * @dev This function uses the redstone-evm-connector
     **/
    function borrow(bytes32 _asset, uint256 _amount) external onlyOwner remainsSolvent {
        ERC20Pool pool = ERC20Pool(SmartLoanLib.getPoolAddress(_asset));
        pool.borrow(_amount);

        emit Borrowed(msg.sender, _asset, _amount, block.timestamp);
    }

    /**
     * Repays funds to the pool
     * @param _asset to repay
     * @param _amount of funds to repay
     * @dev This function uses the redstone-evm-connector
     **/
    function repay(bytes32 _asset, uint256 _amount) public payable {
        IERC20Metadata token = getERC20TokenInstance(_asset);
        WAVAX(payable(SmartLoanLib.getExchange().getAssetAddress(SmartLoanLib.getExchange().getAllAssets()[0]))).deposit{value: msg.value}();

        if (isSolvent() && SmartLoanLib.getLiquidationInProgress() == false) {
            LibDiamond.enforceIsContractOwner();
        }

        uint256 price = getPriceFromMsg(_asset);

        ERC20Pool pool = ERC20Pool(SmartLoanLib.getPoolAddress(_asset));
        uint256 poolDebt = pool.getBorrowed(address(this)) * price * 10**10 / 10 ** token.decimals();

        _amount = Math.min(_amount, poolDebt);
        require(token.balanceOf(address(this)) >= _amount, "There is not enough funds to repay the loan");

        address(token).safeApprove(address(pool), 0);
        address(token).safeApprove(address(pool), _amount);

        pool.repay(_amount);

        emit Repaid(msg.sender, _asset, _amount, block.timestamp);
    }

    /**
     * Swaps one asset to another
     * @param _soldAsset asset to be sold
     * @param _boughtAsset asset to be bought
     * @param _maximumSold maximum amount of asset to be sold
     * @param _minimumBought minimum amount of asset to be bought
     * @dev This function uses the redstone-evm-connector
     **/
    function swap(bytes32 _soldAsset, bytes32 _boughtAsset, uint256 _maximumSold, uint256 _minimumBought) public virtual onlyOwner remainsSolvent returns (uint256[] memory) {
        return swapAssets(_soldAsset, _boughtAsset, _maximumSold, _minimumBought);
    }

    function stakeAVAXYak(uint256 amount) public onlyOwner nonReentrant remainsSolvent {
        WAVAX wavaxToken = WAVAX(payable(SmartLoanLib.getExchange().getAssetAddress(SmartLoanLib.getExchange().getAllAssets()[0])));
        require(wavaxToken.balanceOf(address(this)) >= amount, "Not enough AVAX available");
        wavaxToken.withdraw(amount);
        SmartLoanLib.getYieldYakRouter().stakeAVAX{value: amount}(amount);
    }

    function unstakeAVAXYak(uint256 amount) public onlyOwner nonReentrant remainsSolvent {
        WAVAX wavaxToken = WAVAX(payable(SmartLoanLib.getExchange().getAssetAddress(SmartLoanLib.getExchange().getAllAssets()[0])));
        IYieldYakRouter yakRouter = SmartLoanLib.getYieldYakRouter();
        address(SmartLoanLib.getYakAvaxStakingContract()).safeApprove(address(yakRouter), amount);

        require(yakRouter.unstakeAVAX(amount), "Unstaking failed");
        wavaxToken.deposit{value: amount}();
    }

    /**
     * This function can only be accessed by the owner and allows selling all of the assets.
     * @dev This function uses the redstone-evm-connector
     **/
    function closeLoan() public virtual payable onlyOwner nonReentrant remainsSolvent {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        uint256[] memory prices = getPricesFromMsg(assets);

        uint256 debt = calculateDebt(assets, prices);
        address payable nativeAddress = payable(SmartLoanLib.getExchange().getAssetAddress(assets[0]));
        WAVAX(nativeAddress).deposit{value: msg.value}();

        require(calculateAssetsValue(assets, prices) >= debt, "Not possible to repay fully the debt");

        uint256 i;

        for (i = 0; i < SmartLoanLib.getPoolsAssetsIndices().length; i++) {
            uint256 assetIndex = SmartLoanLib.getPoolsAssetsIndices()[i];
            IERC20Metadata token = getERC20TokenInstance(assets[assetIndex]);
            address poolAddress = SmartLoanLib.getPoolAddress(assets[assetIndex]);

            if (poolAddress != address(0)) {
                repayUsdAmount(
                    RepayConfig(
                        true,
                        ERC20Pool(poolAddress).getBorrowed(address(this)),
                        assetIndex,
                        0,
                        prices,
                        assets
                    )
                );
            }
        }

        for (i = 0; i < assets.length; i++) {
            IERC20Metadata token = getERC20TokenInstance(assets[i]);
            uint256 balance = token.balanceOf(address(this));

            if (balance > 0) {
                TransferHelper.safeTransfer(address(token), msg.sender, balance);
            }
        }

        emit LoanClosed(debt, address(this).balance, block.timestamp);
    }

    /**
     * @dev This function uses the redstone-evm-connector
     **/
    function liquidateLoan(uint256 toRepayInUsd, uint256[] memory orderOfPools) external payable nonReentrant {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        uint256[] memory prices = getPricesFromMsg(assets);
        uint256 leftToRepayInUsd = toRepayInUsd;

        require(calculateLTV(assets, prices) >= SmartLoanLib.getMaxLtv(), "Cannot sellout a solvent account");
        ds._liquidationInProgress = true;

        //in case critically insolvent loans it's needed to add AVAX to bring loan to solvency
        WAVAX(payable(SmartLoanLib.getExchange().getAssetAddress(assets[0]))).deposit{value: msg.value}();

        //to avoid stack to deep error
        {
            uint256 debt = calculateDebt(assets, prices);

            if (leftToRepayInUsd > debt) {
                leftToRepayInUsd = debt;
            }
        }

        uint256 bonus = (leftToRepayInUsd * SmartLoanLib.getLiquidationBonus()) / SmartLoanLib.getPercentagePrecision();

        //repay iterations without swapping assets
        uint32 i;

        while (leftToRepayInUsd > 0 && i < orderOfPools.length) {
            uint256 assetIndex = SmartLoanLib.getPoolsAssetsIndices()[orderOfPools[i]];
            IERC20Metadata poolToken = getERC20TokenInstance(assets[assetIndex]);


            uint256 repaid = repayUsdAmount(
                RepayConfig(
                    false,
                    leftToRepayInUsd * 10 ** poolToken.decimals() / (prices[assetIndex]) / 10**10,
                    assetIndex,
                    0,
                    prices,
                    assets
                )
            );

            uint256 repaidInUsd = repaid * prices[assetIndex] * 10**10 / 10 ** poolToken.decimals();

            if (repaidInUsd > leftToRepayInUsd) {
                leftToRepayInUsd = 0;
                break;
            } else {
                leftToRepayInUsd -= repaidInUsd;
            }

            i++;
        }

        //repay iterations with swapping assets
        i = 0;
        uint256 sentToLiquidator;

        while (i < orderOfPools.length) {
            uint256 assetIndex = SmartLoanLib.getPoolsAssetsIndices()[orderOfPools[i]];
            sentToLiquidator = 0;
            IERC20Metadata poolToken = getERC20TokenInstance(assets[assetIndex]);

            //only for a native token- we perform bonus transfer for a liquidator
            if (orderOfPools[i] == 0) {
                sentToLiquidator = bonus * 10 ** poolToken.decimals() / prices[assetIndex] / 10**10;
            }

            uint256 repaid = repayUsdAmount(
                RepayConfig(
                    true,
                    leftToRepayInUsd *  10 ** poolToken.decimals() / prices[assetIndex] / 10**10,
                    assetIndex,
                    sentToLiquidator,
                    prices,
                    assets
                )
            );

            uint256 repaidInUsd = repaid * prices[assetIndex] * 10**10 / 10 ** poolToken.decimals();

            if (repaidInUsd >= leftToRepayInUsd) {
                leftToRepayInUsd = 0;
                break;
            } else {
                leftToRepayInUsd -= repaidInUsd;
            }

            i++;
        }

        //TODO: make more generic in the future
        //repay with staked tokens
        uint256 avaxToRepay = leftToRepayInUsd * 10**8 / prices[0];
        uint256 stakedAvaxRepaid = Math.min(avaxToRepay, SmartLoanLib.getYieldYakRouter().getTotalStakedValue());

        if (repayWithStakedAVAX(stakedAvaxRepaid)) {
            leftToRepayInUsd -= stakedAvaxRepaid * prices[0] / 10**8;
        }

        uint256 LTV = calculateLTV(assets, prices);

        emit Liquidated(msg.sender, toRepayInUsd - leftToRepayInUsd, bonus, LTV, block.timestamp);

        if (msg.sender != LibDiamond.contractOwner()) {
            require(LTV >= SmartLoanLib.getMinSelloutLtv(), "This operation would result in a loan with LTV lower than Minimal Sellout LTV which would put loan's owner in a risk of an unnecessarily high loss");
        }


        require(LTV < SmartLoanLib.getMaxLtv(), "This operation would not result in bringing the loan back to a solvent state");
        ds._liquidationInProgress = false;
    }

    //TODO: write a test for it
    function wrapNativeToken(uint256 amount) onlyOwner public {
        require(amount <= address(this).balance, "Not enough AVAX to wrap");
        WAVAX wavaxToken = WAVAX(payable(SmartLoanLib.getExchange().getAssetAddress(SmartLoanLib.getExchange().getAllAssets()[0])));

        wavaxToken.deposit{value: amount}();
    }

    receive() external payable {}

    /* ========== VIEW FUNCTIONS ========== */


    /**
     * Returns the current debt associated with the loan
     **/
    function getDebt() public view virtual returns (uint256) {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        uint256[] memory prices = getPricesFromMsg(assets);

        return calculateDebt(assets, prices);
    }

    /**
     * Returns the current value of a loan in USD including cash and investments
     * @dev This function uses the redstone-evm-connector
     **/
    function getTotalValue() public view virtual returns (uint256) {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        uint256[] memory prices = getPricesFromMsg(assets);

        return calculateAssetsValue(assets, prices);
    }

    function getLiquidationBonus() public view virtual returns (uint256) {
        return SmartLoanLib.getLiquidationBonus();
    }

    function getMaxLtv() public view virtual returns (uint256) {
        return SmartLoanLib.getMaxLtv();
    }

    function getPercentagePrecision() public view virtual returns (uint256) {
        return SmartLoanLib.getPercentagePrecision();
    }

    function getFullLoanStatus() public view returns (uint256[4] memory) {
        return [getTotalValue(), getDebt(), getLTV(), isSolvent() ? uint256(1) : uint256(0)];
    }

    /**
     * Checks if the loan is solvent.
     * It means that the ratio between debt and collateral is below safe level,
     * which is parametrized by the SmartLoanLib.getMaxLtv()
     * @dev This function uses the redstone-evm-connector
     **/
    function isSolvent() public view returns (bool) {
        return getLTV() < SmartLoanLib.getMaxLtv();
    }

    /**
     * Returns the balances of all assets served by the price provider
     * It could be used as a helper method for UI
     **/
    function getAllAssetsBalances() public view returns (uint256[] memory) {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        uint256[] memory balances = new uint256[](assets.length);

        for (uint256 i = 0; i < assets.length; i++) {
            balances[i] = getBalance(address(this), assets[i]);
        }

        return balances;
    }

    /**
     * Returns the prices of all assets served by the price provider
     * It could be used as a helper method for UI
     * @dev This function uses the redstone-evm-connector
     **/
    function getAllAssetsPrices() public view returns (uint256[] memory) {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();

        return getPricesFromMsg(assets);
    }

    /**
     * Returns the current debts associated with the loan and summary debt
     **/
    function getDebts() public view virtual returns (uint256[] memory, uint256) {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        uint256[] memory prices = getPricesFromMsg(assets);

        return calculateDebts(assets, prices);
    }

    /**
     * LoanToValue ratio is calculated as the ratio between debt and collateral.
     * The collateral is equal to total loan value takeaway debt.
     * @dev This function uses the redstone-evm-connector
     **/
    function getLTV() public view virtual returns (uint256) {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        uint256[] memory prices = getPricesFromMsg(assets);
        return calculateLTV(assets, prices);
    }

    /**
     * Returns a current balance of the asset held by a given user
     * @dev _asset the code of an asset
     * @dev _user the address of queried user
     **/
    function getBalance(address _account, bytes32 _asset) public view returns (uint256) {
        IERC20 token = IERC20(SmartLoanLib.getExchange().getAssetAddress(_asset));
        return token.balanceOf(_account);
    }

    /* ========== INTERNAL AND PRIVATE FUNCTIONS ========== */

    /**
     * Swaps one asset with another
     * @param _soldAsset asset to be sold
     * @param _boughtAsset asset to be bought
     * @param _maximumSold maximum amount of asset to be sold
     * @param _minimumBought minimum amount of asset to be bought
     **/
    function swapAssets(bytes32 _soldAsset, bytes32 _boughtAsset, uint256 _maximumSold, uint256 _minimumBought) internal returns(uint256[] memory) {
        IERC20Metadata soldToken = getERC20TokenInstance(_soldAsset);

        require(soldToken.balanceOf(address(this)) >= _maximumSold, "Not enough token to sell");
        TransferHelper.safeTransfer(address(soldToken), address(SmartLoanLib.getExchange()), _maximumSold);

        uint256[] memory amounts = SmartLoanLib.getExchange().swap(_soldAsset, _boughtAsset, _maximumSold, _minimumBought);

        emit Swap(msg.sender, _soldAsset, _boughtAsset, amounts[0],  amounts[amounts.length - 1], block.timestamp);

        return amounts;
    }

    /**
     * Returns the current value of a loan in USD including cash and investments
     * @dev This function uses the redstone-evm-connector
     **/
    function calculateAssetsValue(bytes32[] memory assets, uint256[] memory prices) internal view virtual returns (uint256) {
        uint256 total = 0;

        for (uint256 i = 0; i < prices.length; i++) {
            require(prices[i] != 0, "Asset price returned from oracle is zero");

            bytes32 _asset = assets[i];
            IERC20Metadata token = getERC20TokenInstance(_asset);
            uint256 assetBalance = getBalance(address(this), _asset);

            total = total + (prices[i] * 10**10 * assetBalance / (10 ** token.decimals()));
        }

        total += SmartLoanLib.getYieldYakRouter().getTotalStakedValue() * prices[0] / 10**8;

        return total;
    }

    function getERC20TokenInstance(bytes32 _asset) internal view returns (IERC20Metadata) {
        address assetAddress = SmartLoanLib.getExchange().getAssetAddress(_asset);
        IERC20Metadata token = IERC20Metadata(assetAddress);
        return token;
    }

    /**
     * This function attempts to sell just enough asset to receive targetPoolTokenAmount.
     * If there is not enough asset's balance to cover the whole targetPoolTokenAmount then the whole asset's balance
     * is being sold.
     * It is possible that multiple different assets will have to be sold and for that reason we do not use the remainsSolvent modifier.
     **/
    function sellAssetsForTargetAmount(bytes32 soldAsset, bytes32 boughtAsset, uint256 targetAmount) private {
        IERC20Metadata soldToken = getERC20TokenInstance(soldAsset);
        IERC20Metadata boughtToken = getERC20TokenInstance(boughtAsset);

        uint256 balance = soldToken.balanceOf(address(this));
        if (balance > 0) {
            uint256 minSaleAmount = SmartLoanLib.getExchange().getEstimatedTokensForTokens(targetAmount, address(soldToken), address(boughtToken));
            if (balance < minSaleAmount) {
                swapAssets(soldAsset, boughtAsset, balance, 0);
            } else {
                swapAssets(soldAsset, boughtAsset, minSaleAmount, targetAmount);
            }
        }
    }

    /**
     * This function attempts to repay the _repayAmount back to the pool.
     * If there is not enough AVAX balance to repay the _repayAmount then the available AVAX balance will be repaid.
     * @dev This function uses the redstone-evm-connector
     **/
    function attemptRepay(bytes32 _repaidAsset, uint256 _repayAmount) internal {
        IERC20Metadata repaidToken = getERC20TokenInstance(_repaidAsset);
        repay(_repaidAsset, Math.min(repaidToken.balanceOf(address(this)), _repayAmount));
    }

    function calculateDebt(bytes32[] memory assets, uint256[] memory prices) internal view virtual returns (uint256) {
        uint256 debt = 0;

        for (uint256 i = 0; i < SmartLoanLib.getPoolsAssetsIndices().length; i++) {
            uint256 assetIndex = SmartLoanLib.getPoolsAssetsIndices()[i];
            IERC20Metadata token = getERC20TokenInstance(assets[assetIndex]);
            //10**18 (wei in eth) / 10**8 (precision of oracle feed) = 10**10
            debt = debt + ERC20Pool(SmartLoanLib.getPoolAddress(assets[assetIndex])).getBorrowed(address(this)) * prices[assetIndex] * 10**10
            / 10 ** token.decimals();
        }

        return debt;
    }

    /**
     * Returns the current debts associated with the loan
     **/
    function calculateDebts(bytes32[] memory assets, uint256[] memory prices) internal virtual view returns (uint256[] memory, uint256) {
        uint length = SmartLoanLib.getPoolsAssetsIndices().length;
        uint256[] memory debts = new uint256[](length);
        uint256 totalDebt;

        uint256 i;

        for (i = 0; i < length; i++) {
            uint256 assetIndex = SmartLoanLib.getPoolsAssetsIndices()[i];
            IERC20Metadata token = getERC20TokenInstance(assets[assetIndex]);
            uint256 poolDebt = ERC20Pool(SmartLoanLib.getPoolAddress(assets[assetIndex])).getBorrowed(address(this)) * prices[assetIndex] * 10**10 / 10 ** token.decimals();
            debts[i] = poolDebt;
            totalDebt += poolDebt;
        }

        return (debts, totalDebt);
    }

    function calculateLTV(bytes32[] memory assets, uint256[] memory prices) internal virtual view returns (uint256) {
        uint256 debt = calculateDebt(assets, prices);
        uint256 totalValue = calculateAssetsValue(assets, prices);

        if (debt == 0) {
            return 0;
        } else if (debt < totalValue) {
            return (debt * SmartLoanLib.getPercentagePrecision()) / (totalValue - debt);
        } else {
            return SmartLoanLib.getMaxLtv();
        }
    }

    /**
     * This function role is to repay a defined amount of debt during liquidation.
     * @dev This function uses the redstone-evm-connector
     **/
    function repayUsdAmount(RepayConfig memory repayConfig) private returns (uint256) {
        ERC20Pool pool = ERC20Pool(SmartLoanLib.getPoolAddress(repayConfig.assets[repayConfig.poolAssetIndex]));
        IERC20Metadata poolToken = getERC20TokenInstance(repayConfig.assets[repayConfig.poolAssetIndex]);

        uint256 poolTokenPrice = repayConfig.prices[repayConfig.poolAssetIndex];

        uint256 availableTokens = poolToken.balanceOf(address(this));

        uint256 neededTokensForRepay = Math.min(
            repayConfig.leftToRepay,
            pool.getBorrowed(address(this))
        );

        uint256 neededTokensWithBonus = neededTokensForRepay + repayConfig.tokensForLiquidator;

        if (repayConfig.allowSwaps) {
            uint32 j;

            // iteration with swapping assets
            while (availableTokens < neededTokensWithBonus && j < repayConfig.assets.length) {
                // no slippage protection during liquidation
                if (j != repayConfig.poolAssetIndex) {
                    availableTokens += swapToPoolToken(
                        SwapConfig(j, repayConfig.poolAssetIndex, neededTokensWithBonus - availableTokens, repayConfig.prices, repayConfig.assets)
                    );
                }

                j++;
            }
        }

        uint256 repaidAmount = Math.min(neededTokensForRepay, availableTokens);

        if (repaidAmount > 0) {
            address(poolToken).safeApprove(address(pool), 0);
            address(poolToken).safeApprove(address(pool), repaidAmount);

            bool successRepay;
            (successRepay, ) = address(pool).call{value: 0}(
                abi.encodeWithSignature("repay(uint256)", repaidAmount)
            );

            if (!successRepay) {
                repaidAmount = 0;
            }
        }

        if (repayConfig.tokensForLiquidator > 0) {
            poolToken.transfer(msg.sender, Math.min(availableTokens - repaidAmount, repayConfig.tokensForLiquidator));
        }

        return repaidAmount;
    }

    function swapToPoolToken(SwapConfig memory swapConfig) private returns (uint256) {
        IERC20Metadata token = getERC20TokenInstance(swapConfig.assets[swapConfig.assetIndex]);
        IERC20Metadata poolToken = getERC20TokenInstance(SmartLoanLib.getExchange().getAllAssets()[swapConfig.poolAssetIndex]);

        //if amount needed for swap equals 0 because of limited accuracy of calculations, we swap 1
        uint256 swapped = Math.min(
            Math.max(swapConfig.neededSwapInPoolToken * swapConfig.prices[swapConfig.poolAssetIndex] * 10 ** token.decimals() / (swapConfig.prices[swapConfig.assetIndex] * 10 ** poolToken.decimals()), 1),
            token.balanceOf(address(this))
        );

        if (swapped > 0) {
            TransferHelper.safeTransfer(address(token), address(SmartLoanLib.getExchange()), swapped);
            (bool success, bytes memory result) = address(SmartLoanLib.getExchange()).call{value: 0}(
                abi.encodeWithSignature("swap(bytes32,bytes32,uint256,uint256)",
                swapConfig.assets[swapConfig.assetIndex], swapConfig.assets[swapConfig.poolAssetIndex], swapped, 0)
            );

            if (success) {
                uint256[] memory amounts = abi.decode(result, (uint256[]));

                return amounts[amounts.length - 1];
            }
        }

        return 0;
    }

    function payBonus(uint256 _bonus) internal {
        bytes32[] memory assets = SmartLoanLib.getExchange().getAllAssets();
        IERC20Metadata wrappedNativeToken = getERC20TokenInstance(assets[0]);
        TransferHelper.safeTransfer(address(wrappedNativeToken), msg.sender, Math.min(_bonus, address(this).balance));
    }

    function repayWithStakedAVAX(uint256 targetAvaxAmount) private returns(bool) {
        WAVAX wavaxToken = WAVAX(payable(SmartLoanLib.getExchange().getAssetAddress(SmartLoanLib.getExchange().getAllAssets()[0])));
        address yakRouterAddress = address(SmartLoanLib.getYieldYakRouter());
        (bool successApprove, ) = address(SmartLoanLib.getYakAvaxStakingContract()).call(
            abi.encodeWithSignature("approve(address,uint256)", yakRouterAddress, targetAvaxAmount)
        );
        if (!successApprove) return false;

        (bool successUnstake, bytes memory result) = yakRouterAddress.call(
            abi.encodeWithSignature("unstakeAVAXForASpecifiedAmount(uint256)", targetAvaxAmount)
        );

        if (!successUnstake) return false;

        //    uint256 amount = abi.decode(result, (uint256));
        //TODO: return from unstakeAVAX the real value ustaken
        uint256 amount = Math.min(targetAvaxAmount, address(this).balance);

        wavaxToken.deposit{value: amount}();

        ERC20Pool pool = ERC20Pool(SmartLoanLib.getPoolAddress(bytes32("AVAX")));

        address(wavaxToken).safeApprove(address(pool), 0);
        address(wavaxToken).safeApprove(address(pool), amount);

        bool successRepay;
        (successRepay, ) = address(pool).call{value: 0}(
            abi.encodeWithSignature("repay(uint256)", amount)
        );

        return successRepay;
    }

    /* ========== MODIFIERS ========== */

    /**
    * @dev This modifier uses the redstone-evm-connector
    **/
    modifier remainsSolvent() {
        _;

        require(isSolvent(), "The action may cause an account to become insolvent");
    }

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    /* ========== EVENTS ========== */

    /**
     * @dev emitted after a loan is funded
     * @param funder the address which funded the loan
     * @param asset funded by an investor
     * @param amount the amount of funds
     * @param timestamp time of funding
     **/
    event Funded(address indexed funder, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    /**
     * @dev emitted after the funds are withdrawn from the loan
     * @param owner the address which withdraws funds from the loan
     * @param asset withdrawn by an investor
     * @param amount of funds withdrawn
     * @param timestamp of the withdrawal
     **/
    event Withdrawn(address indexed owner, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    /**
     * @dev emitted after a swap of assets
     * @param investor the address of investor making the purchase
     * @param soldAsset sold by the investor
     * @param boughtAsset bought by the investor
     * @param _maximumSold maximum to be sold
     * @param _minimumBought minimum to be bought
     * @param timestamp time of the swap
     **/
    event Swap(address indexed investor, bytes32 indexed soldAsset, bytes32 indexed boughtAsset, uint256 _maximumSold, uint256 _minimumBought, uint256 timestamp);

    /**
     * @dev emitted when funds are borrowed from the pool
     * @param borrower the address of borrower
     * @param asset borrowed by an investor
     * @param amount of the borrowed funds
     * @param timestamp time of the borrowing
     **/
    event Borrowed(address indexed borrower, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    /**
     * @dev emitted when funds are repaid to the pool
     * @param borrower the address initiating repayment
     * @param _asset asset repaid by an investor
     * @param amount of repaid funds
     * @param timestamp of the repayment
     **/
    event Repaid(address indexed borrower, bytes32 indexed _asset, uint256 amount, uint256 timestamp);

    /**
     * @dev emitted after a successful liquidation operation
     * @param liquidator the address that initiated the liquidation operation
     * @param repayAmount requested amount (AVAX) of liquidation
     * @param bonus an amount of bonus (AVAX) received by the liquidator
     * @param ltv a new LTV after the liquidation operation
     * @param timestamp a time of the liquidation
     **/
    event Liquidated(address indexed liquidator, uint256 repayAmount, uint256 bonus, uint256 ltv, uint256 timestamp);

    /**
     * @dev emitted after closing a loan by the owner
     * @param debtRepaid the amount of a borrowed AVAX that was repaid back to the pool
     * @param withdrawalAmount the amount of AVAX that was withdrawn by the owner after closing the loan
     * @param timestamp a time of the loan's closure
     **/
    event LoanClosed(uint256 debtRepaid, uint256 withdrawalAmount, uint256 timestamp);

    struct RepayConfig {
        bool allowSwaps;
        uint256 leftToRepay;
        uint256 poolAssetIndex;
        uint256 tokensForLiquidator;
        uint256[] prices;
        bytes32[] assets;
    }

    struct SwapConfig {
        uint256 assetIndex;
        uint256 poolAssetIndex;
        uint256 neededSwapInPoolToken;
        uint256[] prices;
        bytes32[] assets;
    }
}
