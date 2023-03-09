import {ethers, network, waffle} from "hardhat";
import {BigNumber, Contract, Wallet} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CompoundingIndex, MockToken, Pool, MockVariableUtilisationRatesCalculator} from "../typechain";
import AVAX_TOKEN_ADDRESSES from '../common/addresses/avax/token_addresses.json';
import CELO_TOKEN_ADDRESSES from '../common/addresses/celo/token_addresses.json';
import VariableUtilisationRatesCalculatorArtifact
    from '../artifacts/contracts/mock/MockVariableUtilisationRatesCalculator.sol/MockVariableUtilisationRatesCalculator.json';
import PoolArtifact from '../artifacts/contracts/Pool.sol/Pool.json';
import CompoundingIndexArtifact from '../artifacts/contracts/CompoundingIndex.sol/CompoundingIndex.json';
import MockTokenArtifact from "../artifacts/contracts/mock/MockToken.sol/MockToken.json";
import fetch from "node-fetch";
import {execSync} from "child_process";
import updateConstants from "../tools/scripts/update-constants"
import {JsonRpcSigner} from "@ethersproject/providers";
import addresses from "../common/addresses/avax/token_addresses.json";

const {deployFacet} = require('../tools/diamond/deploy-diamond');

export const erc20ABI = require('./abis/ERC20.json');
export const LPAbi = require('./abis/LP.json');
export const wavaxAbi = require('./abis/WAVAX.json');
export const yakRouterAbi = require('./abis/YakRouter.json');
export const GLPManagerRewarderAbi = require('./abis/GLPManagerRewarder.json');

export const ZERO = ethers.constants.AddressZero;

export function asset(symbol: string, debtCoverage: string = '0.83333333333333333') {
    //@ts-ignore
    return new Asset(toBytes32(symbol), addresses[symbol], debtCoverage);
}

export function pool(symbol: string, address: string) {
    return new PoolAsset(toBytes32(symbol), address);
}

interface PoolInitializationObject {
    name: string,
    airdropList: Array<SignerWithAddress>
}

interface MockTokenPriceObject {
    symbol: string,
    value: number
}

export {PoolInitializationObject, MockTokenPriceObject};


const {provider} = waffle;

const {deployContract} = waffle;

export const toWei = ethers.utils.parseUnits;
export const formatUnits = (val: BigNumber, decimalPlaces: BigNumber) => parseFloat(ethers.utils.formatUnits(val, decimalPlaces));
export const fromWei = (val: BigNumber) => parseFloat(ethers.utils.formatEther(val));
export const fromWeiS = (val: BigNumber) => ethers.utils.formatEther(val);
export const toBytes32 = ethers.utils.formatBytes32String;
export const fromBytes32 = ethers.utils.parseBytes32String;

export type Second = number;

export const time = {
    increase: async (duration: Second) => {
        await network.provider.send("evm_increaseTime", [duration]);
        await network.provider.send("evm_mine");
    },
    duration: {
        years: (years: number): Second => {
            return 60 * 60 * 24 * 365 * years; //TODO: leap years..
        },
        months: (months: number): Second => {
            return 60 * 60 * 24 * 30 * months; // ofc. it is simplified..
        },
        days: (days: number): Second => {
            return 60 * 60 * 24 * days;
        },
        hours: (hours: number): Second => {
            return 60 * 60 * hours;
        },
        minutes: (minutes: number): Second => {
            return 60 * minutes;
        }
    }
}

export const toRepay = function (
    action: string,
    debt: number,
    initialTotalValue: number,
    targetLTV: number,
    bonus: number
) {
    switch (action) {
        case 'CLOSE':
            return debt;
        case 'HEAL':
            //bankrupt loan
            return debt;
        default:
            //liquidate
            return ((1 + targetLTV) * debt - targetLTV * initialTotalValue) / (1 - targetLTV * bonus);

    }
}


export const calculateBonus = function (
    action: string,
    debt: number,
    initialTotalValue: number,
    targetLTV: number,
    maxBonus: number
) {
    switch (action) {
        case 'CLOSE':
            return 0;
        case 'HEAL':
            return 0;
        default:
            let possibleBonus = (1 - ((1 + targetLTV) * debt - targetLTV * initialTotalValue) / debt) / targetLTV;
            return Math.round(Math.min(possibleBonus, maxBonus) * 1000) / 1000;
    }
}

export const getLiquidationAmounts = function (
    action: string,
    debts: Debt[],
    assets: AssetBalanceLeverage[],
    prices: any,
    finalHealthRatio: number,
    //TODO: bonus in edge scenarios
    bonus: number,
    loanIsBankrupt: boolean
) {
    return loanIsBankrupt ?
        getHealingLiquidationAmounts(action, debts, assets)
        :
        getProfitableLiquidationAmounts(action, debts, assets, prices, finalHealthRatio, bonus);
}

export const getLiquidationAmountsBasedOnLtv = function (
    action: string,
    debts: Debt[],
    assets: AssetBalanceLeverage[],
    prices: any,
    finalHealthRatio: number,
    //TODO: bonus in edge scenarios
    bonus: number,
    loanIsBankrupt: boolean
) {
    return loanIsBankrupt ?
        getHealingLiquidationAmounts(action, debts, assets)
        :
        getProfitableLiquidationAmountsBasedOnLtv(action, debts, assets, prices, finalHealthRatio, bonus);
}

export const getHealingLiquidationAmounts = function (
    action: string,
    debts: Debt[],
    assets: AssetBalanceLeverage[]
) {
    let repayAmounts: any = [];
    let deliveredAmounts: any = [];

    debts.forEach(debt => {
        const asset = assets.find(a => a.name == debt.name)!;
        repayAmounts.push(new Repayment(debt.name, 1.001 * debt.debt));
        deliveredAmounts.push(new Allowance(debt.name, debt.debt > asset.balance ? 1.005 * (debt.debt - asset.balance) : 0));
    });

    return {repayAmounts, deliveredAmounts}
}

export function customError(errorName: string, ...args: any[]) {

    let argumentString = '';

    if (Array.isArray(args) && args.length) {

        // add quotation marks to first argument if it is of string type
        if (typeof args[0] === 'string') {
            args[0] = `"${args[0]}"`
        }

        // add joining comma and quotation marks to all subsequent arguments, if they are of string type
        argumentString = args.reduce(function (acc: string, cur: any) {
            if (typeof cur === 'string')
                return `${acc}, "${cur}"`
            else
                return `${acc}, ${cur.toString()}`;
        })
    }

    return `'${errorName}(${argumentString})'`
}

//simple model: we iterate over pools and repay their debts based on how much is left to repay in USD
export const getProfitableLiquidationAmounts = function (
    action: string,
    debts: Debt[],
    assets: AssetBalanceLeverage[],
    prices: any,
    finalHealthRatio: number,
    //TODO: bonus in edge scenarios
    bonus: number
) {
    let repayAmounts = [];
    let deliveredAmounts: any = [];
    let converged = false;

    // loop with repaying solely with account balance
    for (let debt of debts) {
        //repaying with account balance
        let asset = assets.find(el => el.name == debt.name)!;
        let repayAmount = 0;
        let initialDebt = debt.debt;
        let initialBalance = asset.balance;

        let price = prices.find((y: any) => y.dataFeedId == asset.name)!.value;

        let ratio = calculateHealthRatio(debts, assets, prices);

        let sign = 1;
        let repayChange = Math.min(asset.balance, debt.debt);

        repayAmount = 0;
        let useAllAmount = false;
        let i = 0;

        while (repayChange != 0 && !converged && !useAllAmount && i <12) {
            repayAmount += repayChange;
            debt.debt = initialDebt - repayAmount;
            asset.balance = initialBalance - repayAmount;

            let repaidInUsd = repayAmount * price + repayAmounts.reduce((x, y) => x + y.amount * prices.find((z: any) => y.name == z.dataFeedId)!.value, 0);
            let bonusAmount = bonus * repaidInUsd;
            let updatedAssets: AssetBalanceLeverage[]  = JSON.parse(JSON.stringify(assets));
            let assetsValue = updatedAssets.reduce((x, y) =>  x + y.balance * prices.find((z: any) => y.name == z.dataFeedId)!.value, 0);
            let partToRepayToLiquidator = bonusAmount / assetsValue;


            updatedAssets.forEach(asset => asset.balance *= (1 - partToRepayToLiquidator));

            ratio = calculateHealthRatio(debts, updatedAssets, prices);

            // if ratio is higher than desired, we decrease the repayAmount
            sign = (ratio > finalHealthRatio || debt.debt == 0) ? -1 : 1;

            repayChange = sign * Math.abs(repayChange) / 2;

            if (i == 0 && ratio < finalHealthRatio) {
                useAllAmount = true;
            }

            if (Math.abs(finalHealthRatio - ratio) < 0.0001) {
                converged = true;
            }
            i++;
        }

        repayAmounts.push(new Repayment(debt.name, repayAmount));
    }

    // loop with delivering tokens
    for (let debt of debts) {
        if (!converged) {
            //repaying with added tokens balance
            let asset = assets.find(el => el.name == debt.name)!;
            let initialRepayAmount: number = repayAmounts.find(el => el.name == debt.name)!.amount;
            let deliveredAmount = 0;
            let initialDebt = debt.debt;

            let changeInDeliveredAmount = initialDebt;

            let price = prices.find((y: any) => y.dataFeedId == asset.name)!.value;
            let useAllAmount = false;
            let ratio = calculateHealthRatio(debts, assets, prices);
            let sign = 1;

            let i = 0;
            while (changeInDeliveredAmount != 0 && !converged && !useAllAmount) {
                deliveredAmount += changeInDeliveredAmount;
                debt.debt = initialDebt - deliveredAmount;

                let repaidInUsd = deliveredAmount * price + repayAmounts.reduce((x, y) =>
                    x + y.amount * prices.find((z: any) => y.name == z.dataFeedId)!.value, 0);
                let bonusAmount = bonus * repaidInUsd;

                let deliveredInUsd = deliveredAmount * price + deliveredAmounts.reduce((x: number, y: any) =>
                    x + y.amount * prices.find((z: any) => y.name == z.dataFeedId)!.value, 0);

                let updatedAssets: AssetBalanceLeverage[] = JSON.parse(JSON.stringify(assets));
                let assetsValue = updatedAssets.reduce((x, y) => x + y.balance * prices.find((z: any) => y.name == z.dataFeedId)!.value, 0);

                let partToRepayToLiquidator = Math.min((deliveredInUsd + bonusAmount) / assetsValue, 1);

                updatedAssets.forEach(asset => asset.balance *= (1 - partToRepayToLiquidator));

                ratio = calculateHealthRatio(debts, updatedAssets, prices);

                // if ratio is higher than desired, we decrease the repayAmount
                sign = (ratio > finalHealthRatio) ? -1 : 1;
                changeInDeliveredAmount = sign * Math.abs(changeInDeliveredAmount) / 2;

                if (i == 0 && ratio != 0 && ratio < finalHealthRatio) {
                    useAllAmount = true;
                }

                if (Math.abs(finalHealthRatio - ratio) < 0.0001) {
                    converged = true;
                }

                i++;
            }

            //IMPORTANT:
            //approve a little more to account for the debt compounding
            let delivered = deliveredAmount; // to account for inaccuracies and debt compounding
            deliveredAmounts.push(new Allowance(debt.name, delivered < 0 ? 0 : delivered));
            let repayment = repayAmounts.find(el => el.name == debt.name)!;
            repayment.amount = deliveredAmount + initialRepayAmount;
        }
    }

    return {repayAmounts, deliveredAmounts};
}

//this is a simplified formula based on an assumption that all assets has 0.833333 max. debtCoverage
export const getProfitableLiquidationAmountsBasedOnLtv = function (
    action: string,
    debts: Debt[],
    assets: AssetBalanceLeverage[],
    prices: any,
    finalHealthRatio: number,
    //TODO: bonus in edge scenarios
    bonus: number
) {
    function getPrice(asset: string) {
        return prices.find((feed: any) => feed.dataFeedId === asset).value;
    }
    const debt = debts.reduce((sum, debt) => sum += debt.debt * getPrice(debt.name), 0);

    //we are calculating total value excluding assets with 0 debtCoverage. We assume that every other asset has 0.83333 corresponding to 500% max. LTV
    const initialTotalValue = assets.reduce((sum, asset) => sum += (asset.debtCoverage != 0 ? asset.balance * getPrice(asset.name) : 0), 0);

    const targetLTV = 4.1; //4 is minimum acceptable by protocol, added .1 for additional robustness

    let repayAmounts = getRepayAmounts(debts, toRepayBasedOnLtv(action, debt, initialTotalValue, targetLTV, bonus), prices);
    let deliveredAmounts = getDeliveredAmounts(assets, repayAmounts);
    return { repayAmounts, deliveredAmounts };
}

export const calculateHealthRatio = function (
    debts: Debt[],
    assets: AssetBalanceLeverage[],
    prices: any[]
) {
    let debt = 0;
    debts.forEach(
        asset => {
            let price: number = prices.find(el => el.dataFeedId == asset.name)!.value;

            debt += asset.debt * price;
        }
    );

    let maxDebt = 0;
    assets.forEach(
        asset => {
            let price: number = prices.find(el => el.dataFeedId == asset.name)!.value;
            maxDebt += asset.balance * asset.debtCoverage * price;
        }
    );

    return debt == 0 ? Infinity : maxDebt / debt;
}

export const toRepayBasedOnLtv = function (
    action: string,
    debt: number,
    initialTotalValue: number,
    targetLTV: number,
    bonus: number
) {
    switch (action) {
        case 'CLOSE':
            return debt;
        case 'HEAL':
            //bankrupt loan
            return (debt - targetLTV * (initialTotalValue - debt)) / (1 + targetLTV);
        default:
            //liquidate
            return ((1 + targetLTV) * debt - targetLTV * initialTotalValue) / (1 - targetLTV * bonus);

    }
}


export const getRepayAmounts = function (
    debts: Array<Debt>,
    toRepayInUsd: number,
    prices: Array<{symbol: string, value: number}>
) {
    let repayAmounts: Array<Repayment> = [];
    let leftToRepayInUsd = toRepayInUsd;
    debts.forEach(
        (debt) => {
            let price = prices.find((y: any) => y.dataFeedId == debt.name)!.value;

            let availableToRepayInUsd = debt.debt * price;
            let repaidToPool = Math.min(availableToRepayInUsd, leftToRepayInUsd);
            leftToRepayInUsd -= repaidToPool;


            repayAmounts.push(new Repayment(debt.name, repaidToPool / price));
        });

    //repayAmounts are measured in appropriate tokens (not USD)
    return repayAmounts;
}

export const getDeliveredAmounts = function (
    assets: AssetBalanceLeverage[],
    repayAmounts: Array<Repayment>
) {
    //multiplied by 1.00001 to account for limited accuracy of calculations
    let deliveredAmounts: any = [];

    for (const repayment of repayAmounts) {
        // TODO: Change 1.01 to smth smaller if possible
        let name = repayment.name;
        let asset = assets.find(el => el.name === name)!;
        deliveredAmounts.push(new Allowance(name, 1.01 * Math.max(Number(repayment.amount) - (asset.balance ?? 0), 0)));
    }

    return deliveredAmounts;
}

export const deployPools = async function(
    smartLoansFactory: Contract,
    tokens: Array<PoolInitializationObject>,
    tokenContracts: Map<string, Contract>,
    poolContracts: Map<string, Contract>,
    lendingPools: Array<PoolAsset>,
    owner: SignerWithAddress | JsonRpcSigner,
    depositor: SignerWithAddress | Wallet,
    depositAmount: number = 1000,
    chain: string = 'AVAX'
) {
    for (const token of tokens) {
        let {
            poolContract,
            tokenContract
        } = await deployAndInitializeLendingPool(owner, token.name, smartLoansFactory.address, token.airdropList, chain);
        for (const user of token.airdropList) {
            if (token.name == 'AVAX' || token.name == 'MCKUSD') {
                await tokenContract!.connect(user).approve(poolContract.address, toWei(depositAmount.toString()));
                await poolContract.connect(user).deposit(toWei(depositAmount.toString()));
            }
        }
        lendingPools.push(new PoolAsset(toBytes32(token.name), poolContract.address));
        tokenContracts.set(token.name, tokenContract);
        poolContracts.set(token.name, poolContract);
    }
}

function zip(arrays: any) {
    return arrays[0].map(function(_: any,i: any){
        return arrays.map(function(array: any){return array[i]})
    });
}

function getPriceWithLatestTimestamp(prices: any, symbol: any){
    if(symbol in prices){
        let symbolPriceObject = prices[symbol];
        let currentNewestTimestamp = 0;
        let currentNewestTimestampIndex = 0;
        for(let i=0; i<symbolPriceObject.length; i++){
            if(symbolPriceObject[0].timestampMilliseconds > currentNewestTimestamp){
                currentNewestTimestamp = symbolPriceObject[0].timestampMilliseconds;
                currentNewestTimestampIndex = i;
            }
        }
        return symbolPriceObject[currentNewestTimestampIndex].dataPoints[0].value;
    } else {
        throw new Error(`Symbol ${symbol} not found in the prices object`);
    }
}

export const getRedstonePrices = async function(tokenSymbols: Array<string>, priceProvider: string = "redstone-avalanche-prod-1"): Promise<any> {
    const redstonePrices = await (await fetch('https://oracle-gateway-1.a.redstone.finance/data-packages/latest/redstone-avalanche-prod')).json();
    let result = [];
    for(const symbol of tokenSymbols){
        result.push(getPriceWithLatestTimestamp(redstonePrices, symbol));
    }
    return result;
}

export const getTokensPricesMap = async function(tokenSymbols: Array<string>, priceProviderFunc: Function, additionalMockTokensPrices: Array<MockTokenPriceObject> = [], resultMap: Map<string, number> = new Map()): Promise<Map<string, number>> {
    for (const [tokenSymbol, tokenPrice] of zip([tokenSymbols, await priceProviderFunc(tokenSymbols)])) {
        resultMap.set(tokenSymbol, tokenPrice);
    }
    if(additionalMockTokensPrices.length > 0) {
        additionalMockTokensPrices.forEach(obj => (resultMap.set(obj.symbol, obj.value)));
    }
    return resultMap
}

export const convertTokenPricesMapToMockPrices = function(tokensPrices: Map<string, number>) {
    return Array.from(tokensPrices).map( ([token, price]) => ({dataFeedId: token, value: price}));
}

export const convertAssetsListToSupportedAssets = function(assetsList: Array<string>, customTokensAddresses: any = [], chain = 'AVAX') {
    const tokenAddresses = chain === 'AVAX' ? AVAX_TOKEN_ADDRESSES : CELO_TOKEN_ADDRESSES
    return assetsList.map(asset => {
        // @ts-ignore
        return new Asset(toBytes32(asset), tokenAddresses[asset] === undefined ? customTokensAddresses[asset] : tokenAddresses[asset]);
    });
}



export const getFixedGasSigners = async function (gasLimit: number) {
    const signers: SignerWithAddress[] = await ethers.getSigners();
    signers.forEach(signer => {
        let orig = signer.sendTransaction;
        signer.sendTransaction = function (transaction) {
            transaction.gasLimit = BigNumber.from(gasLimit.toString());
            return orig.apply(signer, [transaction]);
        }
    });
    return signers;
};


export const deployAllFacets = async function (diamondAddress: any, mock: boolean = true, chain = 'AVAX', hardhatConfig = undefined) {
    const diamondCut = await ethers.getContractAt('IDiamondCut', diamondAddress);
    console.log('Pausing')
    await diamondCut.pause();
    await deployFacet(
        "YieldYakSwapFacet",
        diamondAddress,
        [
            'yakSwap',
        ],
        hardhatConfig
    )
    await deployFacet(
        "GLPFacet",
        diamondAddress,
        [
            'mintAndStakeGlp',
            'unstakeAndRedeemGlp',
        ],
        hardhatConfig
    )
    await deployFacet(
        "OwnershipFacet",
        diamondAddress,
        [
            'proposeOwnershipTransfer',
            'acceptOwnership',
            'owner',
            'proposedOwner',
            'pauseAdmin',
            'proposedPauseAdmin'
        ],
        hardhatConfig
    )
    await deployFacet(
        "AssetsOperationsFacet",
        diamondAddress,
        [
            'borrow',
            'repay',
            'fund',
            'fundGLP',
            'withdrawGLP',
            'withdraw',
        ],
        hardhatConfig
    )
    await deployFacet(
        "AssetsExposureController",
        diamondAddress,
        [
            'resetPrimeAccountAssetsExposure',
            'setPrimeAccountAssetsExposure',
        ],
        hardhatConfig
    )
    if(mock) {
        await deployFacet("SolvencyFacetMock", diamondAddress, [
                'canRepayDebtFully',
                'isSolvent',
                'isSolventWithPrices',
                'getOwnedAssetsWithNativePrices',
                'getTotalValueWithPrices',
                'getHealthRatioWithPrices',
                'getDebtAssets',
                'getDebtAssetsPrices',
                'getStakedPositionsPrices',
                'getAllPricesForLiquidation',
                'getDebt',
                'getDebtWithPrices',
                'getPrices',
                'getTotalAssetsValue',
                'getThresholdWeightedValue',
                'getStakedValue',
                'getTotalValue',
                'getFullLoanStatus',
                'getHealthRatio'
            ],
            hardhatConfig)
    } else {
        await deployFacet("SolvencyFacetProd", diamondAddress, [
                'canRepayDebtFully',
                'isSolvent',
                'isSolventWithPrices',
                'getOwnedAssetsWithNativePrices',
                'getTotalValueWithPrices',
                'getHealthRatioWithPrices',
                'getDebtAssets',
                'getDebtAssetsPrices',
                'getStakedPositionsPrices',
                'getAllPricesForLiquidation',
                'getDebt',
                'getDebtWithPrices',
                'getPrices',
                'getTotalAssetsValue',
                'getThresholdWeightedValue',
                'getStakedValue',
                'getTotalValue',
                'getFullLoanStatus',
                'getHealthRatio'
            ],
            hardhatConfig)
    }

    if (chain == 'AVAX') {
        await deployFacet("SmartLoanWrappedNativeTokenFacet", diamondAddress, ['depositNativeToken', 'wrapNativeToken', 'unwrapAndWithdraw'], hardhatConfig)
        await deployFacet("PangolinDEXFacet", diamondAddress, ['swapPangolin', 'addLiquidityPangolin', 'removeLiquidityPangolin'], hardhatConfig)
        await deployFacet("TraderJoeDEXFacet", diamondAddress, ['swapTraderJoe', 'addLiquidityTraderJoe', 'removeLiquidityTraderJoe'], hardhatConfig)
        await deployFacet("YieldYakFacet", diamondAddress, [
            'stakeAVAXYak',
            'unstakeAVAXYak',
            'stakeSAVAXYak',
            'unstakeSAVAXYak',
            'stakeGLPYak',
            'unstakeGLPYak',
            'stakeTJAVAXUSDCYak',
            'unstakeTJAVAXUSDCYak',
            'stakePNGAVAXUSDCYak',
            'unstakePNGAVAXUSDCYak',
            'stakePNGAVAXETHYak',
            'unstakePNGAVAXETHYak',
            'stakeTJAVAXUSDCYak',
            'unstakeTJAVAXUSDCYak',
            'stakeTJAVAXETHYak',
            'unstakeTJAVAXETHYak',
            'stakeTJAVAXSAVAXYak',
            'unstakeTJAVAXSAVAXYak'

        ], hardhatConfig)
        // await deployFacet("BeefyFinanceAvalancheFacet", diamondAddress, ['stakePngUsdcAvaxLpBeefy', 'stakePngUsdceAvaxLpBeefy' ,'stakeTjUsdcAvaxLpBeefy', 'unstakePngUsdcAvaxLpBeefy', 'unstakePngUsdceAvaxLpBeefy', 'unstakeTjUsdcAvaxLpBeefy'], hardhatConfig)
        await deployFacet("VectorFinanceFacet", diamondAddress, [
                'vectorStakeUSDC1Auto',
                'vectorUnstakeUSDC1Auto',
                'vectorUSDC1BalanceAuto',
                'vectorStakeWAVAX1Auto',
                'vectorUnstakeWAVAX1Auto',
                'vectorWAVAX1BalanceAuto',
                'vectorStakeSAVAX1Auto',
                'vectorUnstakeSAVAX1Auto',
                'vectorSAVAX1BalanceAuto',
                'vectorMigrateAvax',
                'vectorMigrateSAvax'
            ],
            hardhatConfig)
        await deployFacet("VectorFinanceFacetOld", diamondAddress, [
                'vectorStakeUSDC1',
                'vectorUnstakeUSDC1',
                'vectorUSDC1Balance',
                'vectorStakeWAVAX1',
                'vectorUnstakeWAVAX1',
                'vectorWAVAX1Balance',
                'vectorStakeSAVAX1',
                'vectorUnstakeSAVAX1',
                'vectorSAVAX1Balance'
            ],
            hardhatConfig)

    }
    if (chain == 'CELO') {
        await deployFacet("UbeswapDEXFacet", diamondAddress, ['swapUbeswap'], hardhatConfig)
    }
    await deployFacet(
        "SmartLoanLiquidationFacet",
        diamondAddress,
        [
            'liquidateLoan',
            'unsafeLiquidateLoan',
            'getMaxLiquidationBonus',
            'whitelistLiquidators',
            'delistLiquidators',
            'isLiquidatorWhitelisted'
        ],
        hardhatConfig
    )
    await deployFacet(
        "SmartLoanViewFacet",
        diamondAddress,
        [
            'initialize',
            'getAllAssetsBalances',
            'getDebts',
            'getPercentagePrecision',
            'getAllAssetsPrices',
            'getBalance',
            'getSupportedTokensAddresses',
            'getAllOwnedAssets',
            'getContractOwner',
            'getProposedOwner',
            'getStakedPositions',
        ],
        hardhatConfig
    )
    await diamondCut.unpause();
    console.log('Unpaused')
};

export const extractAssetNameBalances = async function (
    wrappedLoan: any
) {
    let assetsNamesBalances = await wrappedLoan.getAllAssetsBalances();
    let result: any = {};
    for (const assetNameBalance of assetsNamesBalances) {
        result[fromBytes32(assetNameBalance[0])] = assetNameBalance[1];
    }
    return result;
}

export const extractAssetNamePrices = async function (
    wrappedLoan: any
) {
    let assetsNamesPrices = await wrappedLoan.getAllAssetsPrices();
    let result: any = {};
    for (const assetNamePrice of assetsNamesPrices) {
        result[fromBytes32(assetNamePrice[0])] = assetNamePrice[1];
    }
    return result;
}


function getMissingTokenContracts(assetsList: Array<string>, tokenContracts: Map<string, Contract>) {
    return assetsList.filter(asset => !Array.from(tokenContracts.keys()).includes(asset))
}


export const addMissingTokenContracts = function (tokensContract: Map<string, Contract>, assetsList: Array<string>, chain: string = 'AVAX') {
    let missingTokens: Array<string> = getMissingTokenContracts(assetsList, tokensContract);
    const tokenAddresses = chain === 'AVAX' ? AVAX_TOKEN_ADDRESSES : CELO_TOKEN_ADDRESSES
    for (const missingToken of missingTokens) {
        // @ts-ignore
        tokensContract.set(missingToken, new ethers.Contract(tokenAddresses[missingToken] , wavaxAbi, provider));
    }
}

export const deployAndInitExchangeContract = async function (
    owner: SignerWithAddress | JsonRpcSigner,
    routerAddress: string,
    tokenManagerAddress: string,
    supportedAssets: Array<Asset>,
    name: string
) {
    let exchangeFactory = await ethers.getContractFactory(name);
    const exchange = (await exchangeFactory.deploy()).connect(owner);
    await exchange.initialize(routerAddress, tokenManagerAddress, supportedAssets.map(asset => asset.assetAddress));
    return exchange
};

export async function calculateStakingTokensAmountBasedOnAvaxValue(yakContract: Contract, avaxAmount: BigNumber) {
    let totalSupply = await yakContract.totalSupply();
    let totalDeposits = await yakContract.totalDeposits();
    return avaxAmount.mul(totalSupply).div(totalDeposits);
}

export async function syncTime() {
    const now = Math.ceil(new Date().getTime() / 1000);
    try {
        await provider.send('evm_setNextBlockTimestamp', [now]);
    } catch (error) {
        await (provider as any)._hardhatNetwork.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc"
                    },
                },
            ],
        });

        await syncTime();
    }
}

export async function deployAndInitializeLendingPool(owner: any, tokenName: string, smartLoansFactoryAddress: string, tokenAirdropList: any, chain = 'AVAX', rewarder: string = '') {

    const mockVariableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as MockVariableUtilisationRatesCalculator;
    let pool = (await deployContract(owner, PoolArtifact)) as Pool;
    let tokenContract: any;
    if (chain === 'AVAX') {
        switch (tokenName) {
            case 'MCKUSD':
                //it's a mock implementation of USD token with 18 decimal places
                tokenContract = (await deployContract(owner, MockTokenArtifact, [tokenAirdropList.map((user: SignerWithAddress) => user.address)])) as MockToken;
                break;
            case 'AVAX':
                tokenContract = new ethers.Contract(AVAX_TOKEN_ADDRESSES['AVAX'], wavaxAbi, provider);
                for (const user of tokenAirdropList) {
                    await tokenContract.connect(user).deposit({value: toWei("5000")});
                }
                break;
            case 'ETH':
                tokenContract = new ethers.Contract(AVAX_TOKEN_ADDRESSES['ETH'], erc20ABI, provider);
                break;
            case 'USDC':
                tokenContract = new ethers.Contract(AVAX_TOKEN_ADDRESSES['USDC'], erc20ABI, provider);
                break;
        }
    } else if (chain === 'CELO') {
        switch (tokenName) {
            case 'MCKUSD':
                //it's a mock implementation of USD token with 18 decimal places
                tokenContract = (await deployContract(owner, MockTokenArtifact, [tokenAirdropList])) as MockToken;
                break;
            case 'CELO':
                tokenContract = new ethers.Contract(CELO_TOKEN_ADDRESSES['CELO'], erc20ABI, provider);
                break;
            case 'mcUSD':
                tokenContract = new ethers.Contract(CELO_TOKEN_ADDRESSES['mcUSD'], erc20ABI, provider);
                break;
            case 'ETH':
                tokenContract = new ethers.Contract(CELO_TOKEN_ADDRESSES['ETH'], erc20ABI, provider);
                break;
        }
    }

    rewarder = rewarder !== '' ? rewarder : ethers.constants.AddressZero;

    const depositIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;
    const borrowingIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;
    await pool.initialize(
        mockVariableUtilisationRatesCalculator.address,
        smartLoansFactoryAddress,
        depositIndex.address,
        borrowingIndex.address,
        tokenContract!.address,
        rewarder,
        0
    );
    return {'poolContract': pool, 'tokenContract': tokenContract}
}

export async function recompileConstantsFile(chain: string, contractName: string, exchanges: Array<{ facetPath: string, contractAddress: string }>, tokenManagerAddress: string, diamondBeaconAddress: string, smartLoansFactoryAddress: string, subpath: string, maxLTV: number = 5000, minSelloutLTV: string = "1.042e18", maxLiquidationBonus: number = 100, nativeAssetSymbol: string = 'AVAX') {
    const subPath = subpath ? subpath + '/' : "";
    const artifactsDirectory = `../artifacts/contracts/${subPath}/${chain}/${contractName}.sol/${contractName}.json`;
    delete require.cache[require.resolve(artifactsDirectory)]
    await updateConstants(chain, exchanges, tokenManagerAddress, diamondBeaconAddress, smartLoansFactoryAddress, maxLTV, minSelloutLTV, maxLiquidationBonus, nativeAssetSymbol);
    execSync(`npx hardhat compile`, {encoding: 'utf-8', stdio: "ignore"});
    return require(artifactsDirectory);
}


export class Asset {
    asset: string;
    assetAddress: string;
    debtCoverage: BigNumber;

    constructor(asset: string, assetAddress: string, debtCoverage: string = '0.8333333333333333') {
        this.asset = asset;
        this.assetAddress = assetAddress;
        this.debtCoverage = toWei(debtCoverage);
    }
}

export class AssetNamePrice {
    name: string;
    price: BigNumber;

    constructor(name: string, price: BigNumber) {
        this.name = name;
        this.price = price;
    }
}

export class AssetNameBalance {
    name: string;
    balance: BigNumber;

    constructor(name: string, balance: BigNumber) {
        this.name = name;
        this.balance = balance;
    }
}

export class AssetNameDebt {
    name: string;
    debt: BigNumber;

    constructor(name: string, debt: BigNumber) {
        this.name = name;
        this.debt = debt;
    }
}

export class Debt {
    name: string;
    debt: number;

    constructor(name: string, debt: number) {
        this.name = name;
        this.debt = debt;
    }
}

export class Repayment {
    name: string;
    amount: number;

    constructor(name: string, amount: number) {
        this.name = name;
        this.amount = amount;
    }
}

export class Allowance {
    name: string;
    amount: number;

    constructor(name: string, amount: number) {
        this.name = name;
        this.amount = amount;
    }
}

export class PoolAsset {
    asset: string;
    poolAddress: string;

    constructor(asset: string, poolAddress: string) {
        this.asset = asset;
        this.poolAddress = poolAddress;
    }
}

export class AddressIdentifier {
    _address: string;
    _identifier: string;

    constructor(_address: string, _identifier: string) {
        this._address = _address;
        this._identifier = _identifier;
    }
}

export class AssetBalanceLeverage {
    name: string;
    balance: number;
    debtCoverage: number

    constructor(name: string, balance: number, debtCoverage: number = 0.8333333333333333) {
        this.name = name;
        this.balance = balance;
        this.debtCoverage = debtCoverage;
    }
}

export class StakedPosition {
    asset: string;
    symbol: string;
    identifier: string;
    balanceSelector: string;
    unstakeSelector: string;

    constructor(asset: string, identifier: string, symbol: string, balanceSelector: string, unstakeSelector: string) {
        this.asset = asset;
        this.symbol = symbol;
        this.identifier = identifier;
        this.balanceSelector = balanceSelector;
        this.unstakeSelector = unstakeSelector;
    }
}

